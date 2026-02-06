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
    public var tokenChanges: [Range<Int>]? = nil
    // File header metadata
    public var fileName: String? = nil
    public var linesAdded: Int? = nil
    public var linesRemoved: Int? = nil
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

    // Checks if content matches another DiffResult, ignoring UUIDs
    public func isContentEqual(to other: DiffResult) -> Bool {
        if lines.count != other.lines.count { return false }
        if originalText != other.originalText { return false }
        if newText != other.newText { return false }
        if language != other.language { return false }

        for (i, line) in lines.enumerated() {
            let otherLine = other.lines[i]
            if line.type != otherLine.type { return false }
            if line.content != otherLine.content { return false }
            if line.originalLineNumber != otherLine.originalLineNumber { return false }
            if line.newLineNumber != otherLine.newLineNumber { return false }
            if line.fileName != otherLine.fileName { return false }
            if line.isNewFile != otherLine.isNewFile { return false }
            // Ignore tokenChanges for now as they might be computed differently or nil
        }
        return true
    }
}

// --- DiffParser ---

@MainActor
public final class DiffParser: Sendable {

    public static func diff(oldText: String, newText: String) -> DiffResult {
        let oldLines = oldText.components(separatedBy: .newlines)
        let newLines = newText.components(separatedBy: .newlines)

        // Pass 1: Line-level Diff using Swift's built-in CollectionDifference
        let difference = newLines.difference(from: oldLines)

        var resultLines: [DiffLine] = []

        // If no changes, return all lines as common
        if difference.isEmpty {
            return DiffResult(lines: oldLines.enumerated().map { DiffLine(type: .common, content: $0.element, originalLineNumber: $0.offset + 1, newLineNumber: $0.offset + 1) }, originalText: oldText, newText: newText)
        }

        // Create sets for quick lookup of changed indices
        var removedIndices = Set<Int>()
        var insertedIndices = Set<Int>()

        for change in difference {
            switch change {
            case .remove(let offset, _, _):
                removedIndices.insert(offset)
            case .insert(let offset, _, _):
                insertedIndices.insert(offset)
            }
        }

        var s = 0 // Source Index
        var t = 0 // Target Index

        while s < oldLines.count || t < newLines.count {
            // Check if s is deleted
            if s < oldLines.count && removedIndices.contains(s) {
                resultLines.append(DiffLine(type: .removed, content: oldLines[s], originalLineNumber: s + 1, newLineNumber: nil))
                s += 1
                continue
            }

            // Check if t is inserted
            if t < newLines.count && insertedIndices.contains(t) {
                // Pass 2: Intra-line diff check (Myers)
                // Look back at last line. If it was Removed, maybe this Added line is a modification.
                if let last = resultLines.last, last.type == .removed {
                    let charDiffs = diffCharacters(left: last.content, right: newLines[t])

                    var newLine = DiffLine(type: .added, content: newLines[t], originalLineNumber: nil, newLineNumber: t + 1)
                    newLine.tokenChanges = charDiffs
                    resultLines.append(newLine)
                } else {
                    resultLines.append(DiffLine(type: .added, content: newLines[t], originalLineNumber: nil, newLineNumber: t + 1))
                }

                t += 1
                continue
            }

            // Common
            if s < oldLines.count && t < newLines.count {
                resultLines.append(DiffLine(type: .common, content: oldLines[s], originalLineNumber: s + 1, newLineNumber: t + 1))
                s += 1
                t += 1
            } else {
                // Remaining items logic
                if s < oldLines.count {
                    resultLines.append(DiffLine(type: .removed, content: oldLines[s], originalLineNumber: s + 1, newLineNumber: nil))
                    s += 1
                } else if t < newLines.count {
                    resultLines.append(DiffLine(type: .added, content: newLines[t], originalLineNumber: nil, newLineNumber: t + 1))
                    t += 1
                }
            }
        }

        return DiffResult(lines: resultLines, originalText: oldText, newText: newText)
    }

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

    // Detect language from file extension
    static func languageFromFileName(_ fileName: String) -> String? {
        let ext = (fileName as NSString).pathExtension.lowercased()
        switch ext {
        case "swift": return "swift"
        case "py": return "python"
        case "c", "h": return "c"
        case "cpp", "cc", "cxx", "hpp", "hxx": return "cpp"
        case "js": return "javascript"
        case "ts": return "typescript"
        case "java": return "java"
        case "go": return "go"
        case "rs": return "rust"
        case "rb": return "ruby"
        case "kt", "kts": return "kotlin"
        case "m", "mm": return "objective-c"
        default: return nil
        }
    }

    // Parses a Unified Patch string into a DiffResult for visualization
    public static func fromPatch(patch: String, language: String? = nil, filename: String? = nil) -> DiffResult {
        var lines: [DiffLine] = []
        let patchLines = patch.components(separatedBy: .newlines)

        var oldLineCounter = 0
        var newLineCounter = 0
        var inHunk = false

        // First pass: Extract file name and count added/removed lines
        var detectedFileName: String? = nil
        var isNewFile = false
        var linesAdded = 0
        var linesRemoved = 0
        var detectedLanguage = language

        for line in patchLines {
            if line.hasPrefix("diff --git") {
                // Extract filename from "diff --git a/path b/path"
                let parts = line.components(separatedBy: " ")
                if parts.count >= 4 {
                    var path = parts[3]
                    if path.hasPrefix("b/") {
                        path = String(path.dropFirst(2))
                    }
                    detectedFileName = path
                }
            } else if line.hasPrefix("+++ ") {
                let rawName = String(line.dropFirst(4)).trimmingCharacters(in: .whitespaces)
                if rawName != "/dev/null" {
                    if rawName.hasPrefix("b/") {
                        detectedFileName = String(rawName.dropFirst(2))
                    } else if detectedFileName == nil {
                        detectedFileName = rawName
                    }
                }
            } else if line.hasPrefix("--- ") {
                let rawName = String(line.dropFirst(4)).trimmingCharacters(in: .whitespaces)
                if rawName == "/dev/null" {
                    isNewFile = true
                }
            } else if line.hasPrefix("+") && !line.hasPrefix("+++") {
                linesAdded += 1
            } else if line.hasPrefix("-") && !line.hasPrefix("---") {
                linesRemoved += 1
            }
        }

        // Use provided filename if we couldn't detect one, or as an override/supplement
        // We prioritize the detected name from the patch, but fallback to passed filename.
        // Actually, sometimes the patch format is just the hunk (no header), so detectedFileName is nil.
        let finalFileName = detectedFileName ?? filename

        // Add file header line and detect language from filename
        if let name = finalFileName {
            // Detect language from file extension if not explicitly provided
            if detectedLanguage == nil {
                detectedLanguage = languageFromFileName(name)
            }

            let headerLine = DiffLine(
                type: .fileHeader,
                content: name,
                originalLineNumber: nil,
                newLineNumber: nil,
                fileName: name,
                linesAdded: linesAdded,
                linesRemoved: linesRemoved,
                isNewFile: isNewFile
            )
            lines.append(headerLine)
        }

        // Second pass: Parse actual content lines
        for line in patchLines {
            if line.hasPrefix("@@") {
                inHunk = true
                // Parse line numbers: @@ -oldStart,oldLen +newStart,newLen @@
                let components = line.split(separator: " ")
                if components.count >= 3 {
                    let oldStr = components[1].dropFirst() // "-..."
                    let newStr = components[2].dropFirst() // "+..."

                    let oldParts = oldStr.split(separator: ",")
                    if let start = Int(oldParts[0]) {
                        oldLineCounter = start
                    }

                    let newParts = newStr.split(separator: ",")
                    if let start = Int(newParts[0]) {
                        newLineCounter = start
                    }
                }
                continue
            }

            if inHunk {
                // When in a hunk, lines starting with + are added, - are removed, space is context
                // Don't check for +++ or --- patterns here - those are file headers that only appear
                // BEFORE hunks, not inside them. A line like "---" inside a hunk means removing "--"
                if line.hasPrefix("+") {
                    let content = String(line.dropFirst())
                    lines.append(DiffLine(type: .added, content: content, originalLineNumber: nil, newLineNumber: newLineCounter))
                    newLineCounter += 1
                } else if line.hasPrefix("-") {
                    let content = String(line.dropFirst())
                    lines.append(DiffLine(type: .removed, content: content, originalLineNumber: oldLineCounter, newLineNumber: nil))
                    oldLineCounter += 1
                } else if line.hasPrefix(" ") {
                    let content = String(line.dropFirst())
                    lines.append(DiffLine(type: .common, content: content, originalLineNumber: oldLineCounter, newLineNumber: newLineCounter))
                    oldLineCounter += 1
                    newLineCounter += 1
                } else if line == "\\ No newline at end of file" {
                     // ignore
                } else if line.hasPrefix("diff ") {
                    // Start of a new file's diff - exit hunk mode
                    // Note: This shouldn't happen as we parse one patch at a time
                    inHunk = false
                }
                // Other unrecognized lines are ignored but don't exit hunk mode
            }
        }

        return DiffResult(lines: lines, originalText: "", newText: "", language: detectedLanguage)
    }

    // Creates a combined DiffResult from multiple patches
    public static func fromPatches(_ patches: [(patch: String, language: String?, filename: String?)]) -> DiffResult {
        var allLines: [DiffLine] = []
        var detectedLanguage: String? = nil

        for (index, patchTuple) in patches.enumerated() {
            let result = fromPatch(patch: patchTuple.patch, language: patchTuple.language, filename: patchTuple.filename)

            // Add spacing before files (except the first one)
            if index > 0 && !allLines.isEmpty {
                // Add multiple spacer lines for better visual separation
                allLines.append(DiffLine(type: .spacer, content: "", originalLineNumber: nil, newLineNumber: nil))
                allLines.append(DiffLine(type: .spacer, content: "", originalLineNumber: nil, newLineNumber: nil))
                allLines.append(DiffLine(type: .spacer, content: "", originalLineNumber: nil, newLineNumber: nil))
            }

            allLines.append(contentsOf: result.lines)

            // Use the first detected language
            if detectedLanguage == nil {
                detectedLanguage = patchTuple.language ?? result.language
            }
        }

        return DiffResult(lines: allLines, originalText: "", newText: "", language: detectedLanguage)
    }
}
