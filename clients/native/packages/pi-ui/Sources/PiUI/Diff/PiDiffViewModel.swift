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
        for index in 0..<diff.lines.count {
            let line = diff.lines[index]
            if line.type == .fileHeader || line.type == .spacer {
                visual.append(VisualLine(isFold: false, diffLineIndex: index, foldCount: 0))
            } else {
                visual.append(VisualLine(isFold: false, diffLineIndex: index, foldCount: 0))
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

    private func buildRenderContext(
        diff: DiffResult,
        atlas: FontAtlasManager,
        normalizedSelection: NormalizedSelection
    ) -> RenderContext {
        RenderContext(
            visualLines: visualLines,
            diffLines: diff.lines,
            atlas: atlas,
            monoAdvance: atlas.monoAdvance,
            charColorCache: charColorCache,
            normalizedSelStart: normalizedSelection.start,
            normalizedSelEnd: normalizedSelection.end,
            lineManager: lineManager,
            totalContentHeight: totalContentHeight
        )
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

        // Normalize selection
        let normalizedSelection = normalizeSelection()

        // Add gutter separator
        rects.append(RectInstance(
            origin: [gutterWidth - 2, 0],
            size: [1, totalContentHeight],
            color: DiffColors.gutterSeparator.simd4
        ))

        let renderContext = buildRenderContext(
            diff: diff,
            atlas: atlas,
            normalizedSelection: normalizedSelection
        )

        for vIdx in validStart..<validEnd {
            renderLine(vIdx: vIdx, context: renderContext, instances: &instances, rects: &rects)
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
                let startIndex = min(normalStart.charIndex, chars.count)
                let endIndex = min(normalEnd.charIndex, chars.count)
                if startIndex < endIndex { selectedText += String(chars[startIndex..<endIndex]) }
            } else if vIdx == normalStart.visualLineIndex {
                let startIndex = min(normalStart.charIndex, chars.count)
                selectedText += String(chars[startIndex...]) + "\n"
            } else if vIdx == normalEnd.visualLineIndex {
                let endIndex = min(normalEnd.charIndex, chars.count)
                selectedText += String(chars[..<endIndex])
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
