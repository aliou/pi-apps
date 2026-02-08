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
    var texture: MTLTexture?
    var glyphDescriptors: [CGGlyph: GlyphDescriptor] = [:]

    // Bold font atlas for header text
    var boldTexture: MTLTexture?
    var boldGlyphDescriptors: [CGGlyph: GlyphDescriptor] = [:]
    var boldCharToGlyph: [Character: CGGlyph] = [:]
    var boldAsciiGlyphs: [GlyphDescriptor?] = Array(repeating: nil, count: 128)

    // Character Map (Char -> GlyphIndex)
    var charToGlyph: [Character: CGGlyph] = [:]

    // OPTIMIZATION: Direct ASCII lookup table for O(1) access without dictionary hashing
    // Indices 0-127 map directly to ASCII values, nil means character not in atlas
    var asciiGlyphs: [GlyphDescriptor?] = Array(repeating: nil, count: 128)

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

    // MARK: - Convenience Properties

    /// Cached mono-spaced advance width (from 'M' character)
    /// Used for efficient O(1) lookup during rendering
    public var monoAdvance: Float = 8.0

    /// Line height in points for current font configuration
    var lineHeight: CGFloat {
        return baseFontSize * 1.5 // Standard line height ratio
    }

    // Metal's maximum texture dimension
    static let maxTextureSize = 16384

    // Maximum allowed scale factor (prevents texture overflow on unusual display configurations)
    static let maxScale: CGFloat = 4.0

    // Maximum allowed font size for atlas generation (synced with FontSizeManager.maxFontSize)
    static let maxFontSize: CGFloat = 24.0

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

    /// Calculates a safe scale factor that won't exceed Metal's maximum texture size.
    /// The atlas size grows roughly linearly with scale, so we can estimate the max safe scale.
    private static func calculateSafeScale(
        baseFontSize: CGFloat,
        requestedScale: CGFloat
    ) -> CGFloat {
        // Estimate cell height at requested scale
        // Cell height ≈ (fontSize * scale * lineHeightMultiplier) + (padding * 2)
        // padding = 4.0 * scale
        // For 95 ASCII chars, gridSize = 10
        // atlasHeight = 10 * cellHeight

        let gridSize: CGFloat = 10 // ceil(sqrt(95))
        // Use very conservative lineHeightMultiplier (2.0) to account for fonts with
        // larger metrics. SF Mono can have metrics that exceed 1.5x, especially with
        // certain rendering modes
        let lineHeightMultiplier: CGFloat = 2.0
        let paddingBase: CGFloat = 4.0

        // Estimate atlas height at requested scale
        let estimatedCellHeight = (baseFontSize * requestedScale * lineHeightMultiplier)
            + (paddingBase * requestedScale * 2)
        let estimatedAtlasHeight = gridSize * estimatedCellHeight

        // Apply 50% safety limit to leave ample headroom for actual font metrics variations
        let safeLimit = CGFloat(maxTextureSize) * 0.50

        if estimatedAtlasHeight <= safeLimit {
            return requestedScale
        }

        // Calculate max safe scale with the safe limit
        // safeLimit = gridSize * scale * (baseFontSize * lineHeightMultiplier
        //                                  + paddingBase * 2)
        // scale = safeLimit / (gridSize * (baseFontSize * lineHeightMultiplier
        //                                   + paddingBase * 2))
        let maxSafeScale = safeLimit / (gridSize * (baseFontSize * lineHeightMultiplier
                                                     + paddingBase * 2))

        return min(requestedScale, max(1.0, maxSafeScale))
    }

    private func buildAtlas(scale: CGFloat, recursionDepth: Int = 0) {
        let scaleToUse = resolveRecursionScale(recursionDepth: recursionDepth, scale: scale)
        releaseTexture(isBold: false)

        let effectiveScale = Self.calculateSafeScale(baseFontSize: baseFontSize,
                                                     requestedScale: scaleToUse)
        self.scale = effectiveScale

        let font = createRegularFont(scaledFontSize: baseFontSize * effectiveScale)
        let (_, glyphs) = buildCharacterGlyphMaps(font: font, isBold: false)
        var atlasLayout = calculateAtlasLayout(
            font: font,
            glyphs: glyphs,
            effectiveScale: effectiveScale
        )

        // Validate dimensions or retry with reduced scale
        let maxDimension = max(atlasLayout.width, atlasLayout.height)
        if validateAtlasDimensions(maxDimension: maxDimension, recursionDepth: recursionDepth,
                                   effectiveScale: effectiveScale) {
            buildAtlas(scale: calculateReducedScale(maxDimension: maxDimension,
                                                     effectiveScale: effectiveScale),
                       recursionDepth: recursionDepth + 1)
            return
        }

        // Clamp if exceeded max dimension
        if maxDimension > Self.maxTextureSize {
            atlasLayout.width = min(atlasLayout.width, Self.maxTextureSize)
            atlasLayout.height = min(atlasLayout.height, Self.maxTextureSize)
        }

        finalizeBuildAtlas(atlasLayout: atlasLayout, font: font, glyphs: glyphs,
                           effectiveScale: effectiveScale, isBold: false)
    }

    /// Build a bold font atlas for header text rendering
    /// This uses SF Mono Bold (.bold weight) instead of synthetic bold
    private func buildBoldAtlas(scale: CGFloat) {
        releaseTexture(isBold: true)

        let effectiveScale = Self.calculateSafeScale(baseFontSize: baseFontSize,
                                                     requestedScale: scale)

        let font = createBoldFont(scaledFontSize: baseFontSize * effectiveScale)
        let (_, glyphs) = buildCharacterGlyphMaps(font: font, isBold: true)
        var atlasLayout = calculateAtlasLayout(
            font: font,
            glyphs: glyphs,
            effectiveScale: effectiveScale
        )

        // Clamp dimensions if needed
        let maxDimension = max(atlasLayout.width, atlasLayout.height)
        if maxDimension > Self.maxTextureSize {
            atlasLayout.width = min(atlasLayout.width, Self.maxTextureSize)
            atlasLayout.height = min(atlasLayout.height, Self.maxTextureSize)
        }

        finalizeBuildAtlas(atlasLayout: atlasLayout, font: font, glyphs: glyphs,
                           effectiveScale: effectiveScale, isBold: true)
    }
}

// MARK: - Configuration Structures

struct AtlasDrawingConfig {
    let font: CTFont
    let glyphs: [CGGlyph]
    let advances: [CGSize]
    let gridSize: Int
    let cellWidth: Int
    let cellHeight: Int
    let atlasWidth: Int
    let atlasHeight: Int
    let padding: CGFloat
    let descent: CGFloat
    let scale: CGFloat
    let isBold: Bool
}

struct AtlasLayout {
    var width: Int
    var height: Int
    let gridSize: Int
    let cellWidth: Int
    let cellHeight: Int
    let padding: CGFloat
    let descent: CGFloat
    let advances: [CGSize]
}
