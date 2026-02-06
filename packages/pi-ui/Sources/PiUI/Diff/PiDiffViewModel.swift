import Foundation
import Metal
import CoreGraphics
import SwiftUI
import simd

/// View model that converts DiffResult into Metal instance data for rendering.
@MainActor
public class PiDiffViewModel: ObservableObject {
    @Published public var diffResult: DiffResult?

    // Selection state
    public struct TextPosition: Equatable, Sendable {
        public let visualLineIndex: Int
        public let charIndex: Int

        public init(visualLineIndex: Int, charIndex: Int) {
            self.visualLineIndex = visualLineIndex
            self.charIndex = charIndex
        }
    }

    @Published public var selectionStart: TextPosition?
    @Published public var selectionEnd: TextPosition?

    // Layout
    private let baseFontSize: Float = 13.0
    var lineHeight: Float { baseFontSize * 1.5 }
    private let gutterWidth: Float = 80.0
    private let contentOffsetX: Float = 10.0

    // Text alignment tuning
    private let baselineRatio: Float = 0.78
    private let textVerticalOffset: Float = 5
    private let textHorizontalOffset: Float = -4

    // Virtualization
    private var visibleRange: Range<Float> = 0..<1000
    private var viewportHeight: Float = 1000

    var totalContentHeight: Float {
        return Float(visualLines.count) * lineHeight
    }

    private let lineManager = LineManager()
    private let syntaxHighlighter = SyntaxHighlighter()

    // Cached render state
    private var cachedInstances: [InstanceData]?
    private var cachedRects: [RectInstance]?
    private var cachedVisibleRange: Range<Int>?
    private var needsFullRegen: Bool = true
    private var charColorCache: [Int: [SIMD4<Float>]] = [:]

    struct VisualLine {
        let isFold: Bool
        let diffLineIndex: Int
        let foldCount: Int
    }

    private var visualLines: [VisualLine] = []

    public init() {}

    public func setDiffResult(_ result: DiffResult) {
        self.diffResult = result
        self.visualLines = computeVisualLines(diff: result)
        self.lineManager.rebuild(lineCount: visualLines.count, lineHeight: lineHeight)
        self.needsFullRegen = true
        
        // Trigger syntax highlighting
        computeSyntaxHighlighting(diff: result)
        
        self.objectWillChange.send()
    }

    private func computeVisualLines(diff: DiffResult) -> [VisualLine] {
        var visual = [VisualLine]()
        for i in 0..<diff.lines.count {
            let line = diff.lines[i]
            if line.type == .fileHeader || line.type == .spacer {
                visual.append(VisualLine(isFold: false, diffLineIndex: i, foldCount: 0))
            } else {
                visual.append(VisualLine(isFold: false, diffLineIndex: i, foldCount: 0))
            }
        }
        return visual
    }

    private func computeSyntaxHighlighting(diff: DiffResult) {
        guard let language = diff.language, !language.isEmpty else {
            charColorCache = [:]
            return
        }

        // Extract content lines (exclude fileHeader and spacer)
        var contentLines: [String] = []
        var visualLineToContentIdx: [Int: Int] = [:]

        for (vIdx, vLine) in visualLines.enumerated() {
            let line = diff.lines[vLine.diffLineIndex]
            if line.type == .fileHeader || line.type == .spacer {
                continue
            }
            visualLineToContentIdx[vIdx] = contentLines.count
            contentLines.append(line.content)
        }

        guard !contentLines.isEmpty else {
            charColorCache = [:]
            return
        }

        // Get default text color from DiffColors
        let defaultColor = DiffColors.text.simd4

        // Parse syntax highlighting
        let colorsByContentLine = syntaxHighlighter.parsePerCharColors(
            lines: contentLines,
            language: language,
            defaultColor: defaultColor
        )

        // Map back to visual line indices
        charColorCache = [:]
        for (vIdx, contentIdx) in visualLineToContentIdx {
            if let colors = colorsByContentLine[contentIdx] {
                charColorCache[vIdx] = colors
            }
        }
    }

    func setViewport(height: Float, scrollY: Float) {
        self.viewportHeight = height
        let totalHeight = Float(visualLines.count) * lineHeight
        let maxScrollY = max(0, totalHeight - height)
        let clampedScrollY = max(0, min(scrollY, maxScrollY))

        let isFullHeightView = height >= totalHeight || height <= lineHeight || visualLines.count == 0

        let visibleLineRange: Range<Int>
        if isFullHeightView {
            visibleLineRange = 0..<visualLines.count
        } else {
            visibleLineRange = lineManager.visibleLineRange(
                viewportTop: clampedScrollY,
                viewportBottom: clampedScrollY + height,
                buffer: max(50, Int(ceil(height / lineHeight)))
            )
        }

        let rangeStart: Float
        let rangeEnd: Float
        if visibleLineRange.isEmpty {
            rangeStart = 0
            rangeEnd = totalHeight
        } else {
            rangeStart = lineManager.lineY(visibleLineRange.lowerBound)
            let lastLineIndex = min(visibleLineRange.upperBound - 1, lineManager.lineCount - 1)
            rangeEnd = lastLineIndex >= 0 ? lineManager.lineY(lastLineIndex) + lineHeight : totalHeight
        }
        self.visibleRange = rangeStart..<max(rangeStart, rangeEnd)

        // Check if cached instances can be reused
        if !needsFullRegen, cachedInstances != nil,
           let cachedRange = cachedVisibleRange,
           visibleLineRange.lowerBound >= cachedRange.lowerBound,
           visibleLineRange.upperBound <= cachedRange.upperBound {
            return
        }

        cachedVisibleRange = visibleLineRange
        cachedInstances = nil
        cachedRects = nil
    }

    func invalidateRenderCache() {
        needsFullRegen = true
        cachedInstances = nil
        cachedRects = nil
        cachedVisibleRange = nil
    }

    func update(renderer: PiDiffRenderer) {
        guard let diff = diffResult else {
            renderer.updateInstances([], rects: [])
            return
        }

        // Check if cached instances can be reused
        if !needsFullRegen, let cached = cachedInstances, let cachedR = cachedRects {
            renderer.updateInstances(cached, rects: cachedR)
            return
        }

        needsFullRegen = false

        let atlas = renderer.fontAtlasManager
        let monoAdvance: Float = atlas.monoAdvance

        let visibleLineRange = lineManager.visibleLineRange(
            viewportTop: visibleRange.lowerBound,
            viewportBottom: visibleRange.upperBound,
            buffer: 0
        )

        let validStart = visibleLineRange.lowerBound
        let validEnd = visibleLineRange.upperBound

        if validStart >= validEnd {
            renderer.updateInstances([], rects: [])
            return
        }

        let estimatedLines = validEnd - validStart
        var instances: [InstanceData] = []
        instances.reserveCapacity(estimatedLines * 40)
        var rects: [RectInstance] = []
        rects.reserveCapacity(estimatedLines * 3)

        // Colors
        let colAdded = DiffColors.addedBg.simd4
        let colRemoved = DiffColors.removedBg.simd4
        let colTextDefault = DiffColors.text.simd4
        let colGutterText = DiffColors.gutterText.simd4
        let colHighlight = DiffColors.highlight.simd4
        let colFileHeaderBg = DiffColors.fileHeaderBg.simd4
        let colFileHeaderText = DiffColors.fileHeaderText.simd4
        let colModifiedIndicator = DiffColors.modifiedIndicator.simd4
        let colAddedText = DiffColors.addedText.simd4
        let colRemovedText = DiffColors.removedText.simd4
        let colGutterSeparator = DiffColors.gutterSeparator.simd4
        let colSelection = DiffColors.selection.simd4

        // Normalize selection
        var normalizedSelStart: TextPosition?
        var normalizedSelEnd: TextPosition?
        if let start = selectionStart, let end = selectionEnd {
            if start.visualLineIndex < end.visualLineIndex ||
               (start.visualLineIndex == end.visualLineIndex && start.charIndex <= end.charIndex) {
                normalizedSelStart = start
                normalizedSelEnd = end
            } else {
                normalizedSelStart = end
                normalizedSelEnd = start
            }
        }

        // Gutter separator
        rects.append(RectInstance(
            origin: [gutterWidth - 2, 0],
            size: [1, totalContentHeight],
            color: colGutterSeparator
        ))

        let asciiGlyphs = atlas.asciiGlyphs

        for vIdx in validStart..<validEnd {
            let vLine = visualLines[vIdx]
            let currentY: Float = lineManager.lineY(vIdx)
            let nextLineY = vIdx + 1 < lineManager.lineCount ? lineManager.lineY(vIdx + 1) : totalContentHeight
            let effectiveLineHeight = nextLineY - currentY

            let line = diff.lines[vLine.diffLineIndex]

            // FILE HEADER
            if line.type == .fileHeader {
                rects.append(RectInstance(
                    origin: [0, currentY],
                    size: [1500, effectiveLineHeight],
                    color: colFileHeaderBg
                ))

                var x: Float = floor(gutterWidth + contentOffsetX)
                let baselineY = floor(currentY + (lineHeight * baselineRatio) + textVerticalOffset)

                // "M" indicator for modified files
                if !line.isNewFile && ((line.linesAdded ?? 0) > 0 || (line.linesRemoved ?? 0) > 0) {
                    if let descriptor = asciiGlyphs[Int(Character("M").asciiValue!)] {
                        let charBaselineY = baselineY - descriptor.sizeFloat.y
                        instances.append(InstanceData(
                            origin: [floor(x + textHorizontalOffset), charBaselineY],
                            size: descriptor.sizeFloat,
                            uvMin: descriptor.uvMin,
                            uvMax: descriptor.uvMax,
                            color: colModifiedIndicator
                        ))
                        x += descriptor.advanceFloat + 10.0
                    }
                }

                // Filename
                if let fileName = line.fileName {
                    for char in fileName {
                        if let asciiValue = char.asciiValue, asciiValue < 128,
                           let descriptor = asciiGlyphs[Int(asciiValue)] {
                            let charBaselineY = baselineY - descriptor.sizeFloat.y
                            instances.append(InstanceData(
                                origin: [floor(x + textHorizontalOffset), charBaselineY],
                                size: descriptor.sizeFloat,
                                uvMin: descriptor.uvMin,
                                uvMax: descriptor.uvMax,
                                color: colFileHeaderText
                            ))
                            x += descriptor.advanceFloat
                        } else {
                            x += monoAdvance
                        }
                    }
                }

                // Stats (+N -M)
                if let added = line.linesAdded, let removed = line.linesRemoved {
                    x += 20.0
                    for char in "+\(added)" {
                        if let asciiValue = char.asciiValue, asciiValue < 128,
                           let descriptor = asciiGlyphs[Int(asciiValue)] {
                            let charBaselineY = baselineY - descriptor.sizeFloat.y
                            instances.append(InstanceData(
                                origin: [floor(x + textHorizontalOffset), charBaselineY],
                                size: descriptor.sizeFloat,
                                uvMin: descriptor.uvMin,
                                uvMax: descriptor.uvMax,
                                color: colAddedText
                            ))
                            x += descriptor.advanceFloat
                        } else { x += monoAdvance }
                    }
                    x += 10.0
                    for char in "-\(removed)" {
                        if let asciiValue = char.asciiValue, asciiValue < 128,
                           let descriptor = asciiGlyphs[Int(asciiValue)] {
                            let charBaselineY = baselineY - descriptor.sizeFloat.y
                            instances.append(InstanceData(
                                origin: [floor(x + textHorizontalOffset), charBaselineY],
                                size: descriptor.sizeFloat,
                                uvMin: descriptor.uvMin,
                                uvMax: descriptor.uvMax,
                                color: colRemovedText
                            ))
                            x += descriptor.advanceFloat
                        } else { x += monoAdvance }
                    }
                }
                continue
            }

            // SPACER
            if line.type == .spacer { continue }

            // NORMAL LINE
            let chars = Array(line.content)
            let baselineY = floor(currentY + (lineHeight * baselineRatio) + textVerticalOffset)

            // Line background
            if line.type != .common {
                let bgColor = line.type == .added ? colAdded : colRemoved
                rects.append(RectInstance(
                    origin: [0, currentY],
                    size: [1500, effectiveLineHeight],
                    color: bgColor
                ))
            }

            // Line numbers
            var gutterX: Float = 10.0
            if let oldNum = line.originalLineNumber {
                for char in String(oldNum) {
                    if let asciiValue = char.asciiValue, let descriptor = asciiGlyphs[Int(asciiValue)] {
                        let charBaselineY = baselineY - descriptor.sizeFloat.y
                        instances.append(InstanceData(
                            origin: [floor(gutterX + textHorizontalOffset), charBaselineY],
                            size: descriptor.sizeFloat,
                            uvMin: descriptor.uvMin,
                            uvMax: descriptor.uvMax,
                            color: colGutterText
                        ))
                        gutterX += descriptor.advanceFloat
                    }
                }
            }
            gutterX = 40.0
            if let newNum = line.newLineNumber {
                for char in String(newNum) {
                    if let asciiValue = char.asciiValue, let descriptor = asciiGlyphs[Int(asciiValue)] {
                        let charBaselineY = baselineY - descriptor.sizeFloat.y
                        instances.append(InstanceData(
                            origin: [floor(gutterX + textHorizontalOffset), charBaselineY],
                            size: descriptor.sizeFloat,
                            uvMin: descriptor.uvMin,
                            uvMax: descriptor.uvMax,
                            color: colGutterText
                        ))
                        gutterX += descriptor.advanceFloat
                    }
                }
            }

            // Character-level diff highlights
            if let changes = line.tokenChanges, !changes.isEmpty {
                for range in changes {
                    let startX = floor(gutterWidth + contentOffsetX + Float(range.lowerBound) * monoAdvance)
                    let rangeWidth = floor(Float(range.count) * monoAdvance)
                    rects.append(RectInstance(
                        origin: [startX, currentY],
                        size: [rangeWidth, effectiveLineHeight],
                        color: colHighlight
                    ))
                }
            }

            // Selection highlight
            if let selStart = normalizedSelStart, let selEnd = normalizedSelEnd {
                if vIdx >= selStart.visualLineIndex && vIdx <= selEnd.visualLineIndex {
                    var startChar = 0
                    var endChar = chars.count
                    if vIdx == selStart.visualLineIndex { startChar = min(selStart.charIndex, chars.count) }
                    if vIdx == selEnd.visualLineIndex { endChar = min(selEnd.charIndex, chars.count) }
                    if startChar < endChar {
                        let selX = floor(gutterWidth + contentOffsetX + Float(startChar) * monoAdvance)
                        let selWidth = floor(Float(endChar - startChar) * monoAdvance)
                        rects.append(RectInstance(
                            origin: [selX, currentY],
                            size: [selWidth, effectiveLineHeight],
                            color: colSelection
                        ))
                    }
                }
            }

            // Draw text
            var x: Float = floor(gutterWidth + contentOffsetX)
            let lineColors = charColorCache[vIdx]
            var charIdx = 0
            for char in chars {
                if char == " " { x += monoAdvance; charIdx += 1; continue }
                if char == "\t" { x += monoAdvance * 4; charIdx += 1; continue }

                let color = lineColors?[safe: charIdx] ?? colTextDefault

                let descriptor: FontAtlasManager.GlyphDescriptor?
                if let asciiValue = char.asciiValue, asciiValue < 128 {
                    descriptor = asciiGlyphs[Int(asciiValue)]
                } else if let glyphIndex = atlas.charToGlyph[char] {
                    descriptor = atlas.glyphDescriptors[glyphIndex]
                } else {
                    descriptor = nil
                }

                if let descriptor = descriptor {
                    let charBaselineY = baselineY - descriptor.sizeFloat.y
                    instances.append(InstanceData(
                        origin: [floor(x + textHorizontalOffset), charBaselineY],
                        size: descriptor.sizeFloat,
                        uvMin: descriptor.uvMin,
                        uvMax: descriptor.uvMax,
                        color: color
                    ))
                    x += descriptor.advanceFloat
                } else {
                    x += monoAdvance
                }
                charIdx += 1
            }
        }

        // Cache for scroll-only updates
        self.cachedInstances = instances
        self.cachedRects = rects
        self.cachedVisibleRange = validStart..<validEnd

        renderer.updateInstances(instances, rects: rects)
    }

    // MARK: - Selection

    func screenToTextPosition(screenX: Float, screenY: Float, scrollY: Float, monoAdvance: Float) -> TextPosition? {
        let adjustedY = screenY + scrollY
        let visualLineIndex = Int(adjustedY / lineHeight)
        guard visualLineIndex >= 0 && visualLineIndex < visualLines.count else { return nil }
        guard screenX >= gutterWidth else { return nil }
        let contentX = screenX - gutterWidth - contentOffsetX
        let charIndex = max(0, Int(contentX / monoAdvance))
        return TextPosition(visualLineIndex: visualLineIndex, charIndex: charIndex)
    }

    func setSelection(start: TextPosition?, end: TextPosition?) {
        self.selectionStart = start
        self.selectionEnd = end
        invalidateRenderCache()
        objectWillChange.send()
    }

    func clearSelection() {
        selectionStart = nil
        selectionEnd = nil
        invalidateRenderCache()
        objectWillChange.send()
    }

    public func getSelectedText() -> String? {
        guard let start = selectionStart, let end = selectionEnd, let diff = diffResult else { return nil }
        let (normalStart, normalEnd) = start.visualLineIndex <= end.visualLineIndex ||
            (start.visualLineIndex == end.visualLineIndex && start.charIndex <= end.charIndex)
            ? (start, end) : (end, start)

        var selectedText = ""
        for vIdx in normalStart.visualLineIndex...normalEnd.visualLineIndex {
            guard vIdx < visualLines.count else { break }
            let vLine = visualLines[vIdx]
            if vLine.isFold { continue }
            let line = diff.lines[vLine.diffLineIndex]
            let chars = Array(line.content)
            if vIdx == normalStart.visualLineIndex && vIdx == normalEnd.visualLineIndex {
                let s = min(normalStart.charIndex, chars.count)
                let e = min(normalEnd.charIndex, chars.count)
                if s < e { selectedText += String(chars[s..<e]) }
            } else if vIdx == normalStart.visualLineIndex {
                let s = min(normalStart.charIndex, chars.count)
                selectedText += String(chars[s...]) + "\n"
            } else if vIdx == normalEnd.visualLineIndex {
                let e = min(normalEnd.charIndex, chars.count)
                selectedText += String(chars[..<e])
            } else {
                selectedText += line.content + "\n"
            }
        }
        return selectedText.isEmpty ? nil : selectedText
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

