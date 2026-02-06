import Foundation
import Metal
import CoreText
import CoreGraphics

#if os(macOS)
import AppKit
#else
import UIKit
#endif

@MainActor
public class FontAtlasManager {
    let device: MTLDevice
    private(set) var texture: MTLTexture?
    private(set) var glyphDescriptors: [CGGlyph: GlyphDescriptor] = [:]

    // Bold font atlas for header text
    private(set) var boldTexture: MTLTexture?
    private(set) var boldGlyphDescriptors: [CGGlyph: GlyphDescriptor] = [:]
    private(set) var boldCharToGlyph: [Character: CGGlyph] = [:]
    private(set) var boldAsciiGlyphs: [GlyphDescriptor?] = Array(repeating: nil, count: 128)

    // Character Map (Char -> GlyphIndex)
    private(set) var charToGlyph: [Character: CGGlyph] = [:]

    // OPTIMIZATION: Direct ASCII lookup table for O(1) access without dictionary hashing
    // Indices 0-127 map directly to ASCII values, nil means character not in atlas
    private(set) var asciiGlyphs: [GlyphDescriptor?] = Array(repeating: nil, count: 128)

    // Hardcoded default font size
    private let defaultFontSize: CGFloat = 13.0

    // Config
    private(set) var baseFontSize: CGFloat
    let fontName: String = "SF Mono" // Monospaced is key

    // Scale factor (e.g. 2.0 for Retina)
    private(set) var scale: CGFloat = 1.0

    public struct GlyphDescriptor: Sendable {
        let glyphIndex: CGGlyph
        let topLeft: CGPoint
        let bottomRight: CGPoint
        let size: CGSize // In Points
        let bearing: CGPoint
        let advance: CGFloat // In Points

        // OPTIMIZATION: Pre-computed Float values for O(1) rendering without conversion
        let sizeFloat: SIMD2<Float>
        let uvMin: SIMD2<Float>
        let uvMax: SIMD2<Float>
        let advanceFloat: Float
    }

    // MARK: - Phase 4: Convenience Properties

    /// Cached mono-spaced advance width (from 'M' character)
    /// Used for efficient O(1) lookup during rendering
    public private(set) var monoAdvance: Float = 8.0

    /// Line height in points for current font configuration
    var lineHeight: CGFloat {
        return baseFontSize * 1.5 // Standard line height ratio
    }

    init(device: MTLDevice) {
        self.device = device
        self.baseFontSize = defaultFontSize

        // Initial build with default scale. Will be updated by Renderer.
        buildAtlas(scale: 2.0) // Start with 2x for Retina
        buildBoldAtlas(scale: 2.0) // Also build bold atlas
    }

    func updateScale(_ newScale: CGFloat) {
        // Clamp scale to [1.0, maxScale] to prevent texture overflow
        let targetScale = min(Self.maxScale, max(1.0, newScale))
        // FIXED: Add threshold to avoid rebuilding for tiny scale changes
        if abs(self.scale - targetScale) > 0.1 {
            buildAtlas(scale: targetScale)
            buildBoldAtlas(scale: targetScale)
        }
    }

    public func updateFontSize(_ newFontSize: CGFloat) {
        // Clamp font size to prevent texture overflow from corrupted values
        let clampedFontSize = min(Self.maxFontSize, max(1.0, newFontSize))
        if abs(self.baseFontSize - clampedFontSize) > 0.1 {
            self.baseFontSize = clampedFontSize
            buildAtlas(scale: self.scale)
            buildBoldAtlas(scale: self.scale)
        }
    }

    // Metal's maximum texture dimension
    private static let maxTextureSize = 16384

    // Maximum allowed scale factor (prevents texture overflow on unusual display configurations)
    private static let maxScale: CGFloat = 4.0

    // Maximum allowed font size for atlas generation (synced with FontSizeManager.maxFontSize)
    private static let maxFontSize: CGFloat = 24.0

    /// Calculates a safe scale factor that won't exceed Metal's maximum texture size.
    /// The atlas size grows roughly linearly with scale, so we can estimate the max safe scale.
    private static func calculateSafeScale(baseFontSize: CGFloat, requestedScale: CGFloat) -> CGFloat {
        // Estimate cell height at requested scale
        // Cell height ≈ (fontSize * scale * lineHeightMultiplier) + (padding * 2)
        // padding = 4.0 * scale
        // For 95 ASCII chars, gridSize = 10
        // atlasHeight = 10 * cellHeight

        let gridSize: CGFloat = 10 // ceil(sqrt(95))
        // Use very conservative lineHeightMultiplier (2.0) to account for fonts with larger metrics
        // SF Mono can have metrics that exceed 1.5x, especially with certain rendering modes
        let lineHeightMultiplier: CGFloat = 2.0
        let paddingBase: CGFloat = 4.0

        // Estimate atlas height at requested scale
        let estimatedCellHeight = (baseFontSize * requestedScale * lineHeightMultiplier) + (paddingBase * requestedScale * 2)
        let estimatedAtlasHeight = gridSize * estimatedCellHeight

        // Apply 50% safety limit to leave ample headroom for actual font metrics variations
        let safeLimit = CGFloat(maxTextureSize) * 0.50

        if estimatedAtlasHeight <= safeLimit {
            return requestedScale
        }

        // Calculate max safe scale with the safe limit
        // safeLimit = gridSize * scale * (baseFontSize * lineHeightMultiplier + paddingBase * 2)
        // scale = safeLimit / (gridSize * (baseFontSize * lineHeightMultiplier + paddingBase * 2))
        let maxSafeScale = safeLimit / (gridSize * (baseFontSize * lineHeightMultiplier + paddingBase * 2))

        return min(requestedScale, max(1.0, maxSafeScale))
    }

    private func buildAtlas(scale: CGFloat, recursionDepth: Int = 0) {
        // Guard against infinite recursion - use minimum scale as fallback
        let scaleToUse: CGFloat
        if recursionDepth >= 5 {
            print("FontAtlasManager: Max recursion depth reached, forcing scale to 1.0")
            scaleToUse = 1.0
        } else {
            scaleToUse = scale
        }

        // FIXED: Explicitly release old texture before creating new one
        let oldTexture = self.texture
        self.texture = nil
        // oldTexture will be deallocated when this method exits
        _ = oldTexture // Silence unused warning

        // Calculate the effective scale, potentially clamping to avoid exceeding Metal limits
        let effectiveScale = Self.calculateSafeScale(baseFontSize: baseFontSize, requestedScale: scaleToUse)
        self.scale = effectiveScale
        let scaledFontSize = baseFontSize * effectiveScale

        // 0. Create Font - use system monospaced font to ensure SF Mono is properly resolved
        #if os(macOS)
        let nsFont = NSFont.monospacedSystemFont(ofSize: scaledFontSize, weight: .regular)
        #else
        let nsFont = UIFont.monospacedSystemFont(ofSize: scaledFontSize, weight: .regular)
        #endif
        let font = nsFont as CTFont

        // 1. Define Character Set (ASCII + Common Symbols)
        var characters = [UniChar]()
        // ASCII
        for i in 32...126 { characters.append(UniChar(i)) }

        // 2. Get Glyphs
        var glyphs = [CGGlyph](repeating: 0, count: characters.count)
        CTFontGetGlyphsForCharacters(font, characters, &glyphs, characters.count)

        charToGlyph.removeAll()
        for (i, charCode) in characters.enumerated() {
            if let scalar = UnicodeScalar(charCode) {
                charToGlyph[Character(scalar)] = glyphs[i]
            }
        }

        // 3. Atlas Layout
        let gridSize = Int(ceil(sqrt(Double(glyphs.count))))
        let ascent = CTFontGetAscent(font)
        let descent = CTFontGetDescent(font)
        let leading = CTFontGetLeading(font)
        let lineHeight = ascent + descent + leading

        // Get max advance for any character (for consistent cell sizing)
        var advances = [CGSize](repeating: .zero, count: glyphs.count)
        CTFontGetAdvancesForGlyphs(font, .horizontal, glyphs, &advances, glyphs.count)
        let maxAdvance = advances.map { $0.width }.max() ?? scaledFontSize

        // Padding (scaled)
        let padding: CGFloat = 4.0 * effectiveScale
        let cellWidth = Int(ceil(maxAdvance + (padding * 2)))
        let cellHeight = Int(ceil(lineHeight + (padding * 2)))

        var atlasWidth = gridSize * cellWidth
        var atlasHeight = gridSize * cellHeight

        // CRITICAL: Validate actual dimensions against Metal's limit
        // The estimation in calculateSafeScale may not match actual font metrics
        let maxDimension = max(atlasWidth, atlasHeight)
        if maxDimension > Self.maxTextureSize {
            if recursionDepth >= 5 {
                // Safety fallback: clamp dimensions directly rather than crash
                // This ensures we ALWAYS create a valid texture even in pathological cases
                print("FontAtlasManager: Max recursion depth reached at scale \(effectiveScale), clamping dimensions to \(Self.maxTextureSize)")
                atlasWidth = min(atlasWidth, Self.maxTextureSize)
                atlasHeight = min(atlasHeight, Self.maxTextureSize)
            } else {
                // Calculate the reduction factor needed with very aggressive safety margin
                let reductionFactor = CGFloat(Self.maxTextureSize) / CGFloat(maxDimension)
                // Apply 50% safety margin (0.50) to ensure we don't barely miss the limit on retry
                let reducedScale = effectiveScale * reductionFactor * 0.50
                let safeReducedScale = max(1.0, reducedScale)

                print("FontAtlasManager: Texture size \(maxDimension) exceeds limit, reducing scale from \(effectiveScale) to \(safeReducedScale)")

                // Retry with reduced scale
                buildAtlas(scale: safeReducedScale, recursionDepth: recursionDepth + 1)
                return
            }
        }

        // 4. Draw - Use standard bottom-left origin, then flip when we upload
        let colorSpace = CGColorSpaceCreateDeviceGray()
        guard let context = CGContext(data: nil,
                                      width: atlasWidth,
                                      height: atlasHeight,
                                      bitsPerComponent: 8,
                                      bytesPerRow: atlasWidth,
                                      space: colorSpace,
                                      bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return }

        // Fill Black background
        context.setFillColor(gray: 0.0, alpha: 1.0)
        context.fill(CGRect(x: 0, y: 0, width: atlasWidth, height: atlasHeight))

        // Set Text White
        context.setFillColor(gray: 1.0, alpha: 1.0)
        context.setTextDrawingMode(.fill)
        context.setAllowsAntialiasing(true)
        context.setShouldAntialias(true)
        context.setShouldSmoothFonts(false) // Disable LCD smoothing for clearer atlas

        glyphDescriptors.removeAll()

        for (index, glyph) in glyphs.enumerated() {
            let row = index / gridSize
            let col = index % gridSize

            // Calculate position in atlas (standard CG coordinates - bottom-left origin)
            let x = CGFloat(col * cellWidth) + padding
            // Y position: from bottom of cell, accounting for descent
            let y = CGFloat(row * cellHeight) + padding + descent

            var position = CGPoint(x: x, y: y)
            CTFontDrawGlyphs(font, [glyph], &position, 1, context)

            // UV Calculations (Normalized 0..1)
            // CG uses bottom-left origin, Metal uses top-left
            // Since we're NOT flipping the buffer, we need to flip V coordinates
            let cellLeft = CGFloat(col * cellWidth)
            let cellTop = CGFloat(row * cellHeight)
            let cellRight = cellLeft + CGFloat(cellWidth)
            let cellBottom = cellTop + CGFloat(cellHeight)

            let uMin = cellLeft / CGFloat(atlasWidth)
            // Flip V: CG has Y=0 at bottom, Metal has Y=0 at top
            let vMin = 1.0 - (cellBottom / CGFloat(atlasHeight))
            let uMax = cellRight / CGFloat(atlasWidth)
            let vMax = 1.0 - (cellTop / CGFloat(atlasHeight))

            // Normalize metrics back to Points for Layout
            let sizePoints = CGSize(width: CGFloat(cellWidth) / scale,
                                    height: CGFloat(cellHeight) / scale)
            let advancePoints = advances[index].width / scale

            glyphDescriptors[glyph] = GlyphDescriptor(
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
        }

        // 5. Upload to Metal Texture
        // CRITICAL: Absolute final safety - clamp dimensions to Metal's limit NO MATTER WHAT
        // This prevents crashes even if all earlier validation somehow fails
        let safeAtlasWidth = min(atlasWidth, Self.maxTextureSize)
        let safeAtlasHeight = min(atlasHeight, Self.maxTextureSize)

        if atlasWidth > Self.maxTextureSize || atlasHeight > Self.maxTextureSize {
            print("FontAtlasManager: CRITICAL - Clamping texture dimensions from (\(atlasWidth)x\(atlasHeight)) to (\(safeAtlasWidth)x\(safeAtlasHeight))")
        }

        // Don't flip the buffer - instead we'll use flipped V coordinates
        let textureDescriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .r8Unorm,
            width: safeAtlasWidth,
            height: safeAtlasHeight,
            mipmapped: false
        )
        textureDescriptor.usage = [.shaderRead]

        guard let mtlTexture = device.makeTexture(descriptor: textureDescriptor),
              let data = context.data else { return }

        // Upload directly without flipping - Metal will handle coordinate conversion via UV mapping
        // Use safe dimensions for the texture upload region
        mtlTexture.replace(
            region: MTLRegionMake2D(0, 0, safeAtlasWidth, safeAtlasHeight),
            mipmapLevel: 0,
            withBytes: data,
            bytesPerRow: atlasWidth  // bytesPerRow uses original context width for correct memory layout
        )

        self.texture = mtlTexture

        // Phase 4: Update cached monoAdvance from 'M' character
        if let mGlyph = charToGlyph["M"], let desc = glyphDescriptors[mGlyph] {
            monoAdvance = Float(desc.advance)
        } else {
            // Fallback to estimated value based on font size
            monoAdvance = Float(baseFontSize * 0.6)
        }

        // OPTIMIZATION: Build ASCII fast-path lookup table
        // This allows O(1) array access instead of two dictionary lookups
        asciiGlyphs = Array(repeating: nil, count: 128)
        for i in 32...126 {
            if let scalar = UnicodeScalar(i),
               let glyph = charToGlyph[Character(scalar)],
               let descriptor = glyphDescriptors[glyph] {
                asciiGlyphs[i] = descriptor
            }
        }

        // FIXED: Ensure context is released by going out of scope
        // (Swift should handle this automatically, but being explicit)
    }

    /// Build a bold font atlas for header text rendering
    /// This uses SF Mono Bold (.bold weight) instead of synthetic bold
    private func buildBoldAtlas(scale: CGFloat) {
        // Release old texture
        let oldTexture = self.boldTexture
        self.boldTexture = nil
        _ = oldTexture

        let effectiveScale = Self.calculateSafeScale(baseFontSize: baseFontSize, requestedScale: scale)
        let scaledFontSize = baseFontSize * effectiveScale

        // Create Bold Font - use system monospaced font with bold weight
        #if os(macOS)
        let nsFont = NSFont.monospacedSystemFont(ofSize: scaledFontSize, weight: .bold)
        #else
        let nsFont = UIFont.monospacedSystemFont(ofSize: scaledFontSize, weight: .bold)
        #endif
        let font = nsFont as CTFont

        // Define Character Set (ASCII)
        var characters = [UniChar]()
        for i in 32...126 { characters.append(UniChar(i)) }

        // Get Glyphs
        var glyphs = [CGGlyph](repeating: 0, count: characters.count)
        CTFontGetGlyphsForCharacters(font, characters, &glyphs, characters.count)

        boldCharToGlyph.removeAll()
        for (i, charCode) in characters.enumerated() {
            if let scalar = UnicodeScalar(charCode) {
                boldCharToGlyph[Character(scalar)] = glyphs[i]
            }
        }

        // Atlas Layout
        let gridSize = Int(ceil(sqrt(Double(glyphs.count))))
        let ascent = CTFontGetAscent(font)
        let descent = CTFontGetDescent(font)
        let leading = CTFontGetLeading(font)
        let lineHeight = ascent + descent + leading

        var advances = [CGSize](repeating: .zero, count: glyphs.count)
        CTFontGetAdvancesForGlyphs(font, .horizontal, glyphs, &advances, glyphs.count)
        let maxAdvance = advances.map { $0.width }.max() ?? scaledFontSize

        let padding: CGFloat = 4.0 * effectiveScale
        let cellWidth = Int(ceil(maxAdvance + (padding * 2)))
        let cellHeight = Int(ceil(lineHeight + (padding * 2)))

        var atlasWidth = gridSize * cellWidth
        var atlasHeight = gridSize * cellHeight

        // Validate dimensions
        let maxDimension = max(atlasWidth, atlasHeight)
        if maxDimension > Self.maxTextureSize {
            atlasWidth = min(atlasWidth, Self.maxTextureSize)
            atlasHeight = min(atlasHeight, Self.maxTextureSize)
        }

        // Create drawing context
        let colorSpace = CGColorSpaceCreateDeviceGray()
        guard let context = CGContext(data: nil,
                                      width: atlasWidth,
                                      height: atlasHeight,
                                      bitsPerComponent: 8,
                                      bytesPerRow: atlasWidth,
                                      space: colorSpace,
                                      bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return }

        context.setFillColor(gray: 0.0, alpha: 1.0)
        context.fill(CGRect(x: 0, y: 0, width: atlasWidth, height: atlasHeight))
        context.setFillColor(gray: 1.0, alpha: 1.0)
        context.setTextDrawingMode(.fill)
        context.setAllowsAntialiasing(true)
        context.setShouldAntialias(true)
        context.setShouldSmoothFonts(false)

        boldGlyphDescriptors.removeAll()

        for (index, glyph) in glyphs.enumerated() {
            let row = index / gridSize
            let col = index % gridSize

            let x = CGFloat(col * cellWidth) + padding
            let y = CGFloat(row * cellHeight) + padding + descent

            var position = CGPoint(x: x, y: y)
            CTFontDrawGlyphs(font, [glyph], &position, 1, context)

            let cellLeft = CGFloat(col * cellWidth)
            let cellTop = CGFloat(row * cellHeight)
            let cellRight = cellLeft + CGFloat(cellWidth)
            let cellBottom = cellTop + CGFloat(cellHeight)

            let uMin = cellLeft / CGFloat(atlasWidth)
            let vMin = 1.0 - (cellBottom / CGFloat(atlasHeight))
            let uMax = cellRight / CGFloat(atlasWidth)
            let vMax = 1.0 - (cellTop / CGFloat(atlasHeight))

            let sizePoints = CGSize(width: CGFloat(cellWidth) / effectiveScale,
                                    height: CGFloat(cellHeight) / effectiveScale)
            let advancePoints = advances[index].width / effectiveScale

            boldGlyphDescriptors[glyph] = GlyphDescriptor(
                glyphIndex: glyph,
                topLeft: CGPoint(x: uMin, y: vMin),
                bottomRight: CGPoint(x: uMax, y: vMax),
                size: sizePoints,
                bearing: .zero,
                advance: advancePoints,
                sizeFloat: SIMD2<Float>(Float(sizePoints.width), Float(sizePoints.height)),
                uvMin: SIMD2<Float>(Float(uMin), Float(vMin)),
                uvMax: SIMD2<Float>(Float(uMax), Float(vMax)),
                advanceFloat: Float(advancePoints)
            )
        }

        // Upload to Metal Texture
        let safeAtlasWidth = min(atlasWidth, Self.maxTextureSize)
        let safeAtlasHeight = min(atlasHeight, Self.maxTextureSize)

        let textureDescriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .r8Unorm,
            width: safeAtlasWidth,
            height: safeAtlasHeight,
            mipmapped: false
        )
        textureDescriptor.usage = [.shaderRead]

        guard let mtlTexture = device.makeTexture(descriptor: textureDescriptor),
              let data = context.data else { return }

        mtlTexture.replace(
            region: MTLRegionMake2D(0, 0, safeAtlasWidth, safeAtlasHeight),
            mipmapLevel: 0,
            withBytes: data,
            bytesPerRow: atlasWidth
        )

        self.boldTexture = mtlTexture

        // Build bold ASCII fast-path lookup table
        boldAsciiGlyphs = Array(repeating: nil, count: 128)
        for i in 32...126 {
            if let scalar = UnicodeScalar(i),
               let glyph = boldCharToGlyph[Character(scalar)],
               let descriptor = boldGlyphDescriptors[glyph] {
                boldAsciiGlyphs[i] = descriptor
            }
        }
    }


}
