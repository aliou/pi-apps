import Foundation

// --- Models ---

public enum DiffLineType: Equatable, Sendable {
    case common
    case added
    case removed
    case fileHeader  // File header line showing filename and stats
    case spacer      // Visual spacer between files
}

public struct DiffLine: Identifiable, Equatable, Sendable {
    public let id = UUID()
    public let type: DiffLineType
    public let content: String
    public let originalLineNumber: Int?
    public let newLineNumber: Int?
    // Ranges of indices in 'content' that are modified (for character-level highlighting)
    public var tokenChanges: [Range<Int>]?
    // File header metadata
    public var fileName: String?
    public var linesAdded: Int?
    public var linesRemoved: Int?
    public var isNewFile: Bool = false
}

public struct DiffResult: Sendable {
    public let lines: [DiffLine]
    public let originalText: String
    public let newText: String
    public let language: String?

    public init(lines: [DiffLine], originalText: String, newText: String, language: String? = nil) {
        self.lines = lines
        self.originalText = originalText
        self.newText = newText
        self.language = language
    }

    // Checks if metadata matches between DiffResult objects
    private func metadataMatches(_ other: DiffResult) -> Bool {
        if lines.count != other.lines.count { return false }
        if originalText != other.originalText { return false }
        if newText != other.newText { return false }
        if language != other.language { return false }
        return true
    }

    // Checks if a single DiffLine matches another
    private func lineMatches(_ line: DiffLine, against otherLine: DiffLine) -> Bool {
        if line.type != otherLine.type { return false }
        if line.content != otherLine.content { return false }
        if line.originalLineNumber != otherLine.originalLineNumber { return false }
        if line.newLineNumber != otherLine.newLineNumber { return false }
        if line.fileName != otherLine.fileName { return false }
        if line.isNewFile != otherLine.isNewFile { return false }
        return true
    }

    // Checks if content matches another DiffResult, ignoring UUIDs
    public func isContentEqual(to other: DiffResult) -> Bool {
        guard metadataMatches(other) else { return false }

        for (index, line) in lines.enumerated() {
            let otherLine = other.lines[index]
            if !lineMatches(line, against: otherLine) {
                return false
            }
        }
        return true
    }
}

// --- DiffParser ---

@MainActor
public final class DiffParser {

    // MARK: - Public Methods

    public static func diff(oldText: String, newText: String) -> DiffResult {
        let oldLines = oldText.components(separatedBy: .newlines)
        let newLines = newText.components(separatedBy: .newlines)

        // Pass 1: Line-level Diff using Swift's built-in CollectionDifference
        let difference = newLines.difference(from: oldLines)

        // If no changes, return all lines as common
        if difference.isEmpty {
            return buildCommonDiffResult(oldLines: oldLines, oldText: oldText, newText: newText)
        }

        // Create sets for quick lookup of changed indices
        let (removedIndices, insertedIndices) = buildChangeSets(from: difference)

        // Build diff lines with Pass 2 intra-line diff checking
        let resultLines = buildDiffLines(
            oldLines: oldLines,
            newLines: newLines,
            removedIndices: removedIndices,
            insertedIndices: insertedIndices
        )

        return DiffResult(lines: resultLines, originalText: oldText, newText: newText)
    }

    // Parses a Unified Patch string into a DiffResult for visualization
    public static func fromPatch(patch: String, language: String? = nil, filename: String? = nil) -> DiffResult {
        var lines: [DiffLine] = []
        let patchLines = patch.components(separatedBy: .newlines)

        var oldLineCounter = 0
        var newLineCounter = 0

        // Extract file metadata
        let headerInfo = extractPatchHeader(from: patchLines, filename: filename)
        var detectedLanguage = language

        // Add file header line and detect language from filename
        if let name = headerInfo.fileName {
            if detectedLanguage == nil {
                detectedLanguage = languageFromFileName(name)
            }

            let headerLine = createHeaderLine(from: headerInfo, fileName: name)
            lines.append(headerLine)
        }

        // Parse hunk content lines
        processHunkLines(
            patchLines: patchLines,
            lines: &lines,
            oldLineCounter: &oldLineCounter,
            newLineCounter: &newLineCounter
        )

        return DiffResult(lines: lines, originalText: "", newText: "", language: detectedLanguage)
    }

    // Creates a combined DiffResult from multiple patches
    public static func fromPatches(_ patches: [PatchInput]) -> DiffResult {
        var allLines: [DiffLine] = []
        var detectedLanguage: String?

        for (index, patchInput) in patches.enumerated() {
            let result = fromPatch(
                patch: patchInput.patch,
                language: patchInput.language,
                filename: patchInput.filename
            )

            // Add spacing before files (except the first one)
            if index > 0 && !allLines.isEmpty {
                addSpacerLines(to: &allLines)
            }

            allLines.append(contentsOf: result.lines)

            // Use the first detected language
            if detectedLanguage == nil {
                detectedLanguage = patchInput.language ?? result.language
            }
        }

        return DiffResult(
            lines: allLines,
            originalText: "",
            newText: "",
            language: detectedLanguage
        )
    }

    // MARK: - Character-Level Diff

    static func diffCharacters(left: String, right: String) -> [Range<Int>] {
        let leftChars = Array(left)
        let rightChars = Array(right)

        // Swift Standard Myers Diff
        let diff = rightChars.difference(from: leftChars)

        var ranges: [Range<Int>] = []

        for change in diff {
            switch change {
            case .insert(let offset, _, _):
                // Merge contiguous ranges
                if let last = ranges.last, last.upperBound == offset {
                    ranges[ranges.count - 1] = last.lowerBound..<(offset + 1)
                } else {
                    ranges.append(offset..<(offset + 1))
                }
            default: break
            }
        }
        return ranges
    }

    // MARK: - Struct Definition

    // Struct to represent a patch input
    public struct PatchInput: Sendable {
        public let patch: String
        public let language: String?
        public let filename: String?

        public init(patch: String, language: String? = nil, filename: String? = nil) {
            self.patch = patch
            self.language = language
            self.filename = filename
        }
    }

    // MARK: - Private Helpers

    private static func buildCommonDiffResult(
        oldLines: [String],
        oldText: String,
        newText: String
    ) -> DiffResult {
        DiffResult(
            lines: oldLines.enumerated().map {
                DiffLine(
                    type: .common,
                    content: $0.element,
                    originalLineNumber: $0.offset + 1,
                    newLineNumber: $0.offset + 1
                )
            },
            originalText: oldText,
            newText: newText
        )
    }

    // Build result lines using the two-pass diff algorithm
    private static func buildDiffLines(
        oldLines: [String],
        newLines: [String],
        removedIndices: Set<Int>,
        insertedIndices: Set<Int>
    ) -> [DiffLine] {
        var resultLines: [DiffLine] = []
        var sourceIndex = 0
        var targetIndex = 0

        while sourceIndex < oldLines.count || targetIndex < newLines.count {
            if shouldProcessRemoved(
                sourceIndex: sourceIndex,
                removedIndices: removedIndices,
                oldLinesCount: oldLines.count
            ) {
                let removed = createRemovedLine(oldLines[sourceIndex], lineNumber: sourceIndex + 1)
                resultLines.append(removed)
                sourceIndex += 1
                continue
            }

            if shouldProcessInserted(
                targetIndex: targetIndex,
                insertedIndices: insertedIndices,
                newLinesCount: newLines.count
            ) {
                processInsertedLine(targetIndex, newLines: newLines, resultLines: &resultLines)
                targetIndex += 1
                continue
            }

            processCommonOrRemainingLines(
                sourceIndex: &sourceIndex,
                targetIndex: &targetIndex,
                oldLines: oldLines,
                newLines: newLines,
                resultLines: &resultLines
            )
        }

        return resultLines
    }

    private static func shouldProcessRemoved(sourceIndex: Int, removedIndices: Set<Int>, oldLinesCount: Int) -> Bool {
        sourceIndex < oldLinesCount && removedIndices.contains(sourceIndex)
    }

    private static func shouldProcessInserted(targetIndex: Int, insertedIndices: Set<Int>, newLinesCount: Int) -> Bool {
        targetIndex < newLinesCount && insertedIndices.contains(targetIndex)
    }

    private static func createRemovedLine(_ content: String, lineNumber: Int) -> DiffLine {
        DiffLine(
            type: .removed,
            content: content,
            originalLineNumber: lineNumber,
            newLineNumber: nil
        )
    }

    private static func processCommonOrRemainingLines(
        sourceIndex: inout Int,
        targetIndex: inout Int,
        oldLines: [String],
        newLines: [String],
        resultLines: inout [DiffLine]
    ) {
        if sourceIndex < oldLines.count && targetIndex < newLines.count {
            resultLines.append(DiffLine(
                type: .common,
                content: oldLines[sourceIndex],
                originalLineNumber: sourceIndex + 1,
                newLineNumber: targetIndex + 1
            ))
            sourceIndex += 1
            targetIndex += 1
        } else if sourceIndex < oldLines.count {
            resultLines.append(createRemovedLine(oldLines[sourceIndex], lineNumber: sourceIndex + 1))
            sourceIndex += 1
        } else if targetIndex < newLines.count {
            resultLines.append(DiffLine(
                type: .added,
                content: newLines[targetIndex],
                originalLineNumber: nil,
                newLineNumber: targetIndex + 1
            ))
            targetIndex += 1
        }
    }
}
