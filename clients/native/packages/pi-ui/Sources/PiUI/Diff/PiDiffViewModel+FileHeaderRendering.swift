import Foundation
import simd

/// File header rendering helpers for PiDiffViewModel
extension PiDiffViewModel {

    func renderFileHeaderLine(
        layout: FileHeaderLayout,
        context: RenderContext,
        instances: inout [InstanceData],
        rects: inout [RectInstance]
    ) {
        let colFileHeaderBg = DiffColors.fileHeaderBg.simd4

        rects.append(RectInstance(
            origin: [0, layout.currentY],
            size: [1500, layout.effectiveLineHeight],
            color: colFileHeaderBg
        ))

        var contentXPosition: Float = floor(gutterWidth + contentOffsetX)
        let baselineY = floor(layout.currentY + (lineHeight * baselineRatio) + textVerticalOffset)

        renderFileHeaderIndicator(
            line: layout.line,
            baselineY: baselineY,
            contentXPosition: &contentXPosition,
            context: context,
            instances: &instances
        )

        renderFileHeaderFileName(
            line: layout.line,
            baselineY: baselineY,
            contentXPosition: &contentXPosition,
            context: context,
            instances: &instances
        )

        renderFileHeaderStats(
            line: layout.line,
            baselineY: baselineY,
            contentXPosition: &contentXPosition,
            context: context,
            instances: &instances
        )
    }

    private func renderFileHeaderIndicator(
        line: DiffLine,
        baselineY: Float,
        contentXPosition: inout Float,
        context: RenderContext,
        instances: inout [InstanceData]
    ) {
        let colModifiedIndicator = DiffColors.modifiedIndicator.simd4
        let asciiGlyphs = context.atlas.asciiGlyphs

        if !line.isNewFile && ((line.linesAdded ?? 0) > 0 || (line.linesRemoved ?? 0) > 0) {
            if let descriptor = asciiGlyphs[Int(Character("M").asciiValue!)] {
                let charBaselineY = baselineY - descriptor.sizeFloat.y
                instances.append(InstanceData(
                    origin: [floor(contentXPosition + textHorizontalOffset), charBaselineY],
                    size: descriptor.sizeFloat,
                    uvMin: descriptor.uvMin,
                    uvMax: descriptor.uvMax,
                    color: colModifiedIndicator
                ))
                contentXPosition += descriptor.advanceFloat + 10.0
            }
        }
    }

    private func renderFileHeaderFileName(
        line: DiffLine,
        baselineY: Float,
        contentXPosition: inout Float,
        context: RenderContext,
        instances: inout [InstanceData]
    ) {
        let colFileHeaderText = DiffColors.fileHeaderText.simd4
        let asciiGlyphs = context.atlas.asciiGlyphs

        if let fileName = line.fileName {
            for char in fileName {
                if let asciiValue = char.asciiValue, asciiValue < 128,
                   let descriptor = asciiGlyphs[Int(asciiValue)] {
                    let charBaselineY = baselineY - descriptor.sizeFloat.y
                    instances.append(InstanceData(
                        origin: [floor(contentXPosition + textHorizontalOffset), charBaselineY],
                        size: descriptor.sizeFloat,
                        uvMin: descriptor.uvMin,
                        uvMax: descriptor.uvMax,
                        color: colFileHeaderText
                    ))
                    contentXPosition += descriptor.advanceFloat
                } else {
                    contentXPosition += context.monoAdvance
                }
            }
        }
    }

    private func renderFileHeaderStats(
        line: DiffLine,
        baselineY: Float,
        contentXPosition: inout Float,
        context: RenderContext,
        instances: inout [InstanceData]
    ) {
        let colAddedText = DiffColors.addedText.simd4
        let colRemovedText = DiffColors.removedText.simd4
        let asciiGlyphs = context.atlas.asciiGlyphs

        guard let added = line.linesAdded, let removed = line.linesRemoved else { return }

        contentXPosition += 20.0
        for char in "+\(added)" {
            if let asciiValue = char.asciiValue, asciiValue < 128,
               let descriptor = asciiGlyphs[Int(asciiValue)] {
                let charBaselineY = baselineY - descriptor.sizeFloat.y
                instances.append(InstanceData(
                    origin: [floor(contentXPosition + textHorizontalOffset), charBaselineY],
                    size: descriptor.sizeFloat,
                    uvMin: descriptor.uvMin,
                    uvMax: descriptor.uvMax,
                    color: colAddedText
                ))
                contentXPosition += descriptor.advanceFloat
            } else { contentXPosition += context.monoAdvance }
        }

        contentXPosition += 10.0
        for char in "-\(removed)" {
            if let asciiValue = char.asciiValue, asciiValue < 128,
               let descriptor = asciiGlyphs[Int(asciiValue)] {
                let charBaselineY = baselineY - descriptor.sizeFloat.y
                instances.append(InstanceData(
                    origin: [floor(contentXPosition + textHorizontalOffset), charBaselineY],
                    size: descriptor.sizeFloat,
                    uvMin: descriptor.uvMin,
                    uvMax: descriptor.uvMax,
                    color: colRemovedText
                ))
                contentXPosition += descriptor.advanceFloat
            } else { contentXPosition += context.monoAdvance }
        }
    }
}
