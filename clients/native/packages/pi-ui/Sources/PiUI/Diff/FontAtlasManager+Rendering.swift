import Foundation
import Metal
import CoreText
import CoreGraphics

#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - Rendering and Glyph Handling

extension FontAtlasManager {
    /// Draws glyphs to a CGContext and builds glyph descriptors
    func drawGlyphsToContext(config: AtlasDrawingConfig) {
        // Create drawing context
        let colorSpace = CGColorSpaceCreateDeviceGray()
        guard let context = CGContext(
            data: nil,
            width: config.atlasWidth,
            height: config.atlasHeight,
            bitsPerComponent: 8,
            bytesPerRow: config.atlasWidth,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return }

        // Fill Black background
        context.setFillColor(gray: 0.0, alpha: 1.0)
        context.fill(CGRect(x: 0, y: 0, width: config.atlasWidth,
                            height: config.atlasHeight))

        // Set Text White
        context.setFillColor(gray: 1.0, alpha: 1.0)
        context.setTextDrawingMode(.fill)
        context.setAllowsAntialiasing(true)
        context.setShouldAntialias(true)
        context.setShouldSmoothFonts(false) // Disable LCD smoothing

        if config.isBold {
            boldGlyphDescriptors.removeAll()
        } else {
            glyphDescriptors.removeAll()
        }

        for (index, glyph) in config.glyphs.enumerated() {
            let row = index / config.gridSize
            let col = index % config.gridSize

            // Draw glyph
            drawGlyph(glyph: glyph, in: context, config: config, row: row, col: col)

            // Build descriptor
            buildGlyphDescriptor(glyph: glyph, index: index, row: row, col: col,
                                config: config)
        }
    }

    /// Draws a single glyph to the context
    func drawGlyph(
        glyph: CGGlyph,
        in context: CGContext,
        config: AtlasDrawingConfig,
        row: Int,
        col: Int
    ) {
        // Calculate position in atlas (standard CG coordinates - bottom-left origin)
        let xPosition = CGFloat(col * config.cellWidth) + config.padding
        // Y position: from bottom of cell, accounting for descent
        let yPosition = CGFloat(row * config.cellHeight) + config.padding + config.descent

        var position = CGPoint(x: xPosition, y: yPosition)
        CTFontDrawGlyphs(config.font, [glyph], &position, 1, context)
    }

    /// Builds a glyph descriptor with UV coordinates and metrics
    func buildGlyphDescriptor(
        glyph: CGGlyph,
        index: Int,
        row: Int,
        col: Int,
        config: AtlasDrawingConfig
    ) {
        // UV Calculations (Normalized 0..1)
        // CG uses bottom-left origin, Metal uses top-left
        // Since we're NOT flipping the buffer, we need to flip V coordinates
        let cellLeft = CGFloat(col * config.cellWidth)
        let cellTop = CGFloat(row * config.cellHeight)
        let cellRight = cellLeft + CGFloat(config.cellWidth)
        let cellBottom = cellTop + CGFloat(config.cellHeight)

        let uMin = cellLeft / CGFloat(config.atlasWidth)
        // Flip V: CG has Y=0 at bottom, Metal has Y=0 at top
        let vMin = 1.0 - (cellBottom / CGFloat(config.atlasHeight))
        let uMax = cellRight / CGFloat(config.atlasWidth)
        let vMax = 1.0 - (cellTop / CGFloat(config.atlasHeight))

        // Normalize metrics back to Points for Layout
        let sizePoints = CGSize(
            width: CGFloat(config.cellWidth) / config.scale,
            height: CGFloat(config.cellHeight) / config.scale
        )
        let advancePoints = config.advances[index].width / config.scale

        let descriptor = GlyphDescriptor(
            glyphIndex: glyph,
            topLeft: CGPoint(x: uMin, y: vMin),
            bottomRight: CGPoint(x: uMax, y: vMax),
            size: sizePoints,
            bearing: .zero,
            advance: advancePoints,
            // Pre-compute Float values for fast rendering
            sizeFloat: SIMD2<Float>(Float(sizePoints.width), Float(sizePoints.height)),
            uvMin: SIMD2<Float>(Float(uMin), Float(vMin)),
            uvMax: SIMD2<Float>(Float(uMax), Float(vMax)),
            advanceFloat: Float(advancePoints)
        )

        if config.isBold {
            boldGlyphDescriptors[glyph] = descriptor
        } else {
            glyphDescriptors[glyph] = descriptor
        }
    }

    /// Uploads glyph context data to Metal texture
    func uploadGlyphsToTexture(width: Int, height: Int, isBold: Bool) {
        // Recreate context to get the data
        let colorSpace = CGColorSpaceCreateDeviceGray()
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return }

        context.setFillColor(gray: 0.0, alpha: 1.0)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.setFillColor(gray: 1.0, alpha: 1.0)

        // Get font for drawing
        let fontSizeScaled = baseFontSize * scale
        #if os(macOS)
        let weight: NSFont.Weight = isBold ? .bold : .regular
        let nsFont = NSFont.monospacedSystemFont(ofSize: fontSizeScaled, weight: weight)
        #else
        let weight: UIFont.Weight = isBold ? .bold : .regular
        let nsFont = UIFont.monospacedSystemFont(ofSize: fontSizeScaled, weight: weight)
        #endif
        let font = nsFont as CTFont

        // Redraw all glyphs
        let charToGlyphMap = isBold ? boldCharToGlyph : charToGlyph
        let descriptors = isBold ? boldGlyphDescriptors : glyphDescriptors
        for (_, glyph) in charToGlyphMap {
            guard let descriptor = descriptors[glyph] else { continue }
            let cellRow = Int(descriptor.topLeft.y / CGFloat(height))
            let cellCol = Int(descriptor.topLeft.x / CGFloat(width))
            let cellSize = CGSize(width: descriptor.size.width * scale,
                                  height: descriptor.size.height * scale)
            let xPos = CGFloat(cellCol) * cellSize.width + 4.0 * scale
            let yPos = CGFloat(cellRow) * cellSize.height + 4.0 * scale
            var position = CGPoint(x: xPos, y: yPos)
            CTFontDrawGlyphs(font, [glyph], &position, 1, context)
        }

        createAndUploadTexture(from: context, width: width, height: height, isBold: isBold)
    }

    /// Creates Metal texture and uploads glyph data
    func createAndUploadTexture(
        from context: CGContext,
        width: Int,
        height: Int,
        isBold: Bool
    ) {
        // CRITICAL: Absolute final safety - clamp dimensions to Metal's limit
        // This prevents crashes even if all earlier validation somehow fails
        let safeWidth = min(width, Self.maxTextureSize)
        let safeHeight = min(height, Self.maxTextureSize)

        if width > Self.maxTextureSize || height > Self.maxTextureSize {
            print("""
                FontAtlasManager: CRITICAL - Clamping texture dimensions from \
                (\(width)x\(height)) to (\(safeWidth)x\(safeHeight))
                """)
        }

        // Don't flip the buffer - instead we'll use flipped V coordinates
        let textureDescriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .r8Unorm,
            width: safeWidth,
            height: safeHeight,
            mipmapped: false
        )
        textureDescriptor.usage = [.shaderRead]

        guard let mtlTexture = device.makeTexture(descriptor: textureDescriptor),
              let data = context.data else { return }

        // Upload directly without flipping - Metal will handle coordinate conversion
        // via UV mapping. Use safe dimensions for the texture upload region.
        mtlTexture.replace(
            region: MTLRegionMake2D(0, 0, safeWidth, safeHeight),
            mipmapLevel: 0,
            withBytes: data,
            bytesPerRow: width  // bytesPerRow uses original context width
        )

        if isBold {
            self.boldTexture = mtlTexture
        } else {
            self.texture = mtlTexture
        }
    }
}
