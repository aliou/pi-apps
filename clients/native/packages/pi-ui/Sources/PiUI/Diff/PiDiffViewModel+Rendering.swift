import Foundation
import Metal
import CoreGraphics
import SwiftUI
import simd

/// Rendering helper structures and methods for PiDiffViewModel
extension PiDiffViewModel {

    // MARK: - Rendering Helpers

    func normalizeSelection() -> NormalizedSelection {
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
        return NormalizedSelection(start: normalizedSelStart, end: normalizedSelEnd)
    }

    func renderLine(
        vIdx: Int,
        context: RenderContext,
        instances: inout [InstanceData],
        rects: inout [RectInstance]
    ) {
        let vLine = context.visualLines[vIdx]
        let currentY: Float = context.lineManager.lineY(vIdx)
        let nextLineY = vIdx + 1 < context.lineManager.lineCount
            ? context.lineManager.lineY(vIdx + 1)
            : context.totalContentHeight
        let effectiveLineHeight = nextLineY - currentY

        let line = context.diffLines[vLine.diffLineIndex]

        if line.type == .fileHeader {
            let layout = FileHeaderLayout(
                line: line,
                currentY: currentY,
                effectiveLineHeight: effectiveLineHeight
            )
            renderFileHeaderLine(layout: layout, context: context, instances: &instances, rects: &rects)
        } else if line.type == .spacer {
            // Spacer lines have no visual content
            return
        } else {
            let layout = LineLayout(
                visualLineIndex: vIdx,
                line: line,
                currentY: currentY,
                effectiveLineHeight: effectiveLineHeight
            )
            renderNormalLine(layout: layout, context: context, instances: &instances, rects: &rects)
        }
    }

    private func renderNormalLine(
        layout: LineLayout,
        context: RenderContext,
        instances: inout [InstanceData],
        rects: inout [RectInstance]
    ) {
        let chars = Array(layout.line.content)
        let baselineY = floor(layout.currentY + (lineHeight * baselineRatio) + textVerticalOffset)

        renderLineBackground(layout: layout, rects: &rects)
        renderLineNumbers(
            line: layout.line,
            baselineY: baselineY,
            context: context,
            instances: &instances
        )
        renderCharacterDiffHighlights(layout: layout, context: context, rects: &rects)
        renderSelectionHighlight(
            vIdx: layout.visualLineIndex,
            chars: chars,
            layout: layout,
            context: context,
            rects: &rects
        )
        renderLineText(
            vIdx: layout.visualLineIndex,
            chars: chars,
            baselineY: baselineY,
            context: context,
            instances: &instances
        )
    }

    private func renderLineBackground(
        layout: LineLayout,
        rects: inout [RectInstance]
    ) {
        if layout.line.type == .common { return }

        let bgColor = layout.line.type == .added ? DiffColors.addedBg.simd4 : DiffColors.removedBg.simd4
        rects.append(RectInstance(
            origin: [0, layout.currentY],
            size: [1500, layout.effectiveLineHeight],
            color: bgColor
        ))
    }

    private func renderLineNumbers(
        line: DiffLine,
        baselineY: Float,
        context: RenderContext,
        instances: inout [InstanceData]
    ) {
        let colGutterText = DiffColors.gutterText.simd4
        let asciiGlyphs = context.atlas.asciiGlyphs

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
    }

    private func renderCharacterDiffHighlights(
        layout: LineLayout,
        context: RenderContext,
        rects: inout [RectInstance]
    ) {
        let colHighlight = DiffColors.highlight.simd4
        guard let changes = layout.line.tokenChanges, !changes.isEmpty else { return }

        for range in changes {
            let startX = floor(gutterWidth + contentOffsetX + Float(range.lowerBound) * context.monoAdvance)
            let rangeWidth = floor(Float(range.count) * context.monoAdvance)
            rects.append(RectInstance(
                origin: [startX, layout.currentY],
                size: [rangeWidth, layout.effectiveLineHeight],
                color: colHighlight
            ))
        }
    }

    private func renderSelectionHighlight(
        vIdx: Int,
        chars: [Character],
        layout: LineLayout,
        context: RenderContext,
        rects: inout [RectInstance]
    ) {
        let colSelection = DiffColors.selection.simd4

        guard let selStart = context.normalizedSelStart, let selEnd = context.normalizedSelEnd else { return }
        guard vIdx >= selStart.visualLineIndex && vIdx <= selEnd.visualLineIndex else { return }

        var startChar = 0
        var endChar = chars.count
        if vIdx == selStart.visualLineIndex { startChar = min(selStart.charIndex, chars.count) }
        if vIdx == selEnd.visualLineIndex { endChar = min(selEnd.charIndex, chars.count) }

        guard startChar < endChar else { return }

        let selX = floor(gutterWidth + contentOffsetX + Float(startChar) * context.monoAdvance)
        let selWidth = floor(Float(endChar - startChar) * context.monoAdvance)
        rects.append(RectInstance(
            origin: [selX, layout.currentY],
            size: [selWidth, layout.effectiveLineHeight],
            color: colSelection
        ))
    }

    private func renderLineText(
        vIdx: Int,
        chars: [Character],
        baselineY: Float,
        context: RenderContext,
        instances: inout [InstanceData]
    ) {
        let colTextDefault = DiffColors.text.simd4
        let asciiGlyphs = context.atlas.asciiGlyphs
        let lineColors = context.charColorCache[vIdx]

        var textXPosition: Float = floor(gutterWidth + contentOffsetX)
        var charIdx = 0

        for char in chars {
            if char == " " {
                textXPosition += context.monoAdvance
                charIdx += 1
                continue
            }
            if char == "\t" {
                textXPosition += context.monoAdvance * 4
                charIdx += 1
                continue
            }

            let color = lineColors?[safe: charIdx] ?? colTextDefault

            let descriptor: FontAtlasManager.GlyphDescriptor?
            if let asciiValue = char.asciiValue, asciiValue < 128 {
                descriptor = asciiGlyphs[Int(asciiValue)]
            } else if let glyphIndex = context.atlas.charToGlyph[char] {
                descriptor = context.atlas.glyphDescriptors[glyphIndex]
            } else {
                descriptor = nil
            }

            if let descriptor = descriptor {
                let charBaselineY = baselineY - descriptor.sizeFloat.y
                instances.append(InstanceData(
                    origin: [floor(textXPosition + textHorizontalOffset), charBaselineY],
                    size: descriptor.sizeFloat,
                    uvMin: descriptor.uvMin,
                    uvMax: descriptor.uvMax,
                    color: color
                ))
                textXPosition += descriptor.advanceFloat
            } else {
                textXPosition += context.monoAdvance
            }
            charIdx += 1
        }
    }
}
