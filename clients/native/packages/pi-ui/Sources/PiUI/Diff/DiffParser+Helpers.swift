import Foundation

// MARK: - Patch Header Utilities

extension DiffParser {
    // Helper struct to hold patch header metadata
    struct PatchHeaderInfo {
        var fileName: String?
        var isNewFile: Bool = false
        var linesAdded: Int = 0
        var linesRemoved: Int = 0
    }

    // Extract file metadata from patch header
    static func extractPatchHeader(
        from patchLines: [String],
        filename: String?
    ) -> PatchHeaderInfo {
        var info = PatchHeaderInfo()

        for line in patchLines {
            if line.hasPrefix("diff --git") {
                info.fileName = extractFileNameFromDiffGit(line)
            } else if line.hasPrefix("+++ ") {
                info.fileName = extractFileNameFromPatchHeader(line, info.fileName)
            } else if line.hasPrefix("--- ") {
                let rawName = String(line.dropFirst(4)).trimmingCharacters(in: .whitespaces)
                if rawName == "/dev/null" {
                    info.isNewFile = true
                }
            } else if line.hasPrefix("+") && !line.hasPrefix("+++") {
                info.linesAdded += 1
            } else if line.hasPrefix("-") && !line.hasPrefix("---") {
                info.linesRemoved += 1
            }
        }

        info.fileName = info.fileName ?? filename
        return info
    }

    // Extract filename from "diff --git a/path b/path" format
    private static func extractFileNameFromDiffGit(_ line: String) -> String? {
        let parts = line.components(separatedBy: " ")
        guard parts.count >= 4 else { return nil }
        var path = parts[3]
        if path.hasPrefix("b/") {
            path = String(path.dropFirst(2))
        }
        return path
    }

    // Extract filename from "+++ path" format
    private static func extractFileNameFromPatchHeader(
        _ line: String,
        _ current: String?
    ) -> String? {
        let rawName = String(line.dropFirst(4)).trimmingCharacters(in: .whitespaces)
        guard rawName != "/dev/null" else { return current }
        if rawName.hasPrefix("b/") {
            return String(rawName.dropFirst(2))
        } else if current == nil {
            return rawName
        }
        return current
    }
}

// MARK: - Hunk Parsing Utilities

extension DiffParser {
    // Parse hunk header to extract line numbers
    static func parseHunkHeader(
        _ line: String,
        oldLineCounter: inout Int,
        newLineCounter: inout Int
    ) {
        let components = line.split(separator: " ")
        guard components.count >= 3 else { return }

        let oldStr = components[1].dropFirst()
        let newStr = components[2].dropFirst()

        let oldParts = oldStr.split(separator: ",")
        if let start = Int(oldParts[0]) {
            oldLineCounter = start
        }

        let newParts = newStr.split(separator: ",")
        if let start = Int(newParts[0]) {
            newLineCounter = start
        }
    }

    // Process a single line in a hunk
    private static func processHunkLine(
        _ line: String,
        lines: inout [DiffLine],
        oldLineCounter: inout Int,
        newLineCounter: inout Int
    ) -> Bool {
        if line.hasPrefix("+"), !line.hasPrefix("+++") {
            let content = String(line.dropFirst())
            lines.append(DiffLine(
                type: .added,
                content: content,
                originalLineNumber: nil,
                newLineNumber: newLineCounter
            ))
            newLineCounter += 1
            return true
        } else if line.hasPrefix("-"), !line.hasPrefix("---") {
            let content = String(line.dropFirst())
            lines.append(DiffLine(
                type: .removed,
                content: content,
                originalLineNumber: oldLineCounter,
                newLineNumber: nil
            ))
            oldLineCounter += 1
            return true
        } else if line.hasPrefix(" ") {
            let content = String(line.dropFirst())
            lines.append(DiffLine(
                type: .common,
                content: content,
                originalLineNumber: oldLineCounter,
                newLineNumber: newLineCounter
            ))
            oldLineCounter += 1
            newLineCounter += 1
            return true
        }
        return false
    }

    // Process hunk content lines
    static func processHunkLines(
        patchLines: [String],
        lines: inout [DiffLine],
        oldLineCounter: inout Int,
        newLineCounter: inout Int
    ) {
        var inHunk = false

        for line in patchLines {
            if line.hasPrefix("@@") {
                inHunk = true
                parseHunkHeader(line, oldLineCounter: &oldLineCounter, newLineCounter: &newLineCounter)
                continue
            }

            guard inHunk else { continue }

            if line == "\\ No newline at end of file" {
                continue
            }

            if line.hasPrefix("diff ") {
                inHunk = false
                continue
            }

            _ = processHunkLine(
                line,
                lines: &lines,
                oldLineCounter: &oldLineCounter,
                newLineCounter: &newLineCounter
            )
        }
    }
}

// MARK: - Language Detection

extension DiffParser {
    // Detect language from file extension
    static func languageFromFileName(_ fileName: String) -> String? {
        let ext = (fileName as NSString).pathExtension.lowercased()
        let languageMap: [String: String] = [
            "swift": "swift",
            "py": "python",
            "c": "c",
            "h": "c",
            "cpp": "cpp",
            "cc": "cpp",
            "cxx": "cpp",
            "hpp": "cpp",
            "hxx": "cpp",
            "js": "javascript",
            "ts": "typescript",
            "java": "java",
            "go": "go",
            "rs": "rust",
            "rb": "ruby",
            "kt": "kotlin",
            "kts": "kotlin",
            "m": "objective-c",
            "mm": "objective-c"
        ]
        return languageMap[ext]
    }
}

// MARK: - Line Diff Utilities

extension DiffParser {
    // Build initial set of removed and inserted indices from CollectionDifference
    static func buildChangeSets(
        from difference: CollectionDifference<String>
    ) -> (removed: Set<Int>, inserted: Set<Int>) {
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

        return (removedIndices, insertedIndices)
    }

    // Process an inserted line, checking for character-level diffs
    static func processInsertedLine(
        _ targetIndex: Int,
        newLines: [String],
        resultLines: inout [DiffLine]
    ) {
        if let last = resultLines.last, last.type == .removed {
            let charDiffs = diffCharacters(left: last.content, right: newLines[targetIndex])
            var newLine = DiffLine(
                type: .added,
                content: newLines[targetIndex],
                originalLineNumber: nil,
                newLineNumber: targetIndex + 1
            )
            newLine.tokenChanges = charDiffs
            resultLines.append(newLine)
        } else {
            resultLines.append(DiffLine(
                type: .added,
                content: newLines[targetIndex],
                originalLineNumber: nil,
                newLineNumber: targetIndex + 1
            ))
        }
    }
}

// MARK: - Multi-Patch Processing

extension DiffParser {
    // Add spacing between patches for visual separation
    static func addSpacerLines(to lines: inout [DiffLine]) {
        guard !lines.isEmpty else { return }
        let spacer = DiffLine(
            type: .spacer,
            content: "",
            originalLineNumber: nil,
            newLineNumber: nil
        )
        lines.append(contentsOf: [spacer, spacer, spacer])
    }

    // Create header line from patch info
    static func createHeaderLine(
        from headerInfo: PatchHeaderInfo,
        fileName: String
    ) -> DiffLine {
        DiffLine(
            type: .fileHeader,
            content: fileName,
            originalLineNumber: nil,
            newLineNumber: nil,
            fileName: fileName,
            linesAdded: headerInfo.linesAdded,
            linesRemoved: headerInfo.linesRemoved,
            isNewFile: headerInfo.isNewFile
        )
    }
}
