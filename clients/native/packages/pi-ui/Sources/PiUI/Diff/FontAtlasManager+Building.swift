import Foundation
import Metal
import CoreText
import CoreGraphics

#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - Atlas Building

extension FontAtlasManager {
    /// Resolves the scale to use based on recursion depth
    func resolveRecursionScale(recursionDepth: Int, scale: CGFloat) -> CGFloat {
        if recursionDepth >= 5 {
            print("FontAtlasManager: Max recursion depth reached, forcing scale to 1.0")
            return 1.0
        }
        return scale
    }

    /// Releases the texture for a given font style
    func releaseTexture(isBold: Bool) {
        let oldTexture = isBold ? boldTexture : texture
        if isBold {
            boldTexture = nil
        } else {
            texture = nil
        }
        _ = oldTexture // Silence unused warning
    }

    /// Validates if atlas dimensions exceed limits and returns whether to retry
    func validateAtlasDimensions(
        maxDimension: Int,
        recursionDepth: Int,
        effectiveScale: CGFloat
    ) -> Bool {
        guard maxDimension > Self.maxTextureSize else { return false }
        guard recursionDepth < 5 else {
            print("""
                FontAtlasManager: Max recursion depth reached at scale \(effectiveScale), \
                clamping dimensions to \(Self.maxTextureSize)
                """)
            return false
        }
        return true
    }

    /// Calculates a reduced scale for retry when dimensions exceed limits
    func calculateReducedScale(maxDimension: Int, effectiveScale: CGFloat) -> CGFloat {
        let reductionFactor = CGFloat(Self.maxTextureSize) / CGFloat(maxDimension)
        let reducedScale = effectiveScale * reductionFactor * 0.50
        let safeReducedScale = max(1.0, reducedScale)

        print("""
            FontAtlasManager: Texture size \(maxDimension) exceeds limit, \
            reducing scale from \(effectiveScale) to \(safeReducedScale)
            """)

        return safeReducedScale
    }

    /// Finalizes atlas build process
    func finalizeBuildAtlas(
        atlasLayout: AtlasLayout,
        font: CTFont,
        glyphs: [CGGlyph],
        effectiveScale: CGFloat,
        isBold: Bool
    ) {
        let config = AtlasDrawingConfig(
            font: font,
            glyphs: glyphs,
            advances: atlasLayout.advances,
            gridSize: atlasLayout.gridSize,
            cellWidth: atlasLayout.cellWidth,
            cellHeight: atlasLayout.cellHeight,
            atlasWidth: atlasLayout.width,
            atlasHeight: atlasLayout.height,
            padding: atlasLayout.padding,
            descent: atlasLayout.descent,
            scale: effectiveScale,
            isBold: isBold
        )

        drawGlyphsToContext(config: config)

        if !isBold {
            updateMonoAdvance()
            buildAsciiGlyphsTable()
        } else {
            buildBoldAsciiGlyphsTable()
        }
    }

    /// Creates a regular-weight monospaced font
    func createRegularFont(scaledFontSize: CGFloat) -> CTFont {
        #if os(macOS)
        let nsFont = NSFont.monospacedSystemFont(ofSize: scaledFontSize, weight: .regular)
        #else
        let nsFont = UIFont.monospacedSystemFont(ofSize: scaledFontSize, weight: .regular)
        #endif
        return nsFont as CTFont
    }

    /// Creates a bold-weight monospaced font
    func createBoldFont(scaledFontSize: CGFloat) -> CTFont {
        #if os(macOS)
        let nsFont = NSFont.monospacedSystemFont(ofSize: scaledFontSize, weight: .bold)
        #else
        let nsFont = UIFont.monospacedSystemFont(ofSize: scaledFontSize, weight: .bold)
        #endif
        return nsFont as CTFont
    }

    /// Builds character-to-glyph mappings for a font
    func buildCharacterGlyphMaps(
        font: CTFont,
        isBold: Bool
    ) -> ([UniChar], [CGGlyph]) {
        var characters = [UniChar]()
        for charIndex in 32...126 {
            characters.append(UniChar(charIndex))
        }

        var glyphs = [CGGlyph](repeating: 0, count: characters.count)
        CTFontGetGlyphsForCharacters(font, characters, &glyphs, characters.count)

        if isBold {
            boldCharToGlyph.removeAll()
            for (index, charCode) in characters.enumerated() {
                if let scalar = UnicodeScalar(charCode) {
                    boldCharToGlyph[Character(scalar)] = glyphs[index]
                }
            }
        } else {
            charToGlyph.removeAll()
            for (index, charCode) in characters.enumerated() {
                if let scalar = UnicodeScalar(charCode) {
                    charToGlyph[Character(scalar)] = glyphs[index]
                }
            }
        }

        return (characters, glyphs)
    }

    /// Calculates the atlas layout (grid size, cell dimensions, padding)
    func calculateAtlasLayout(
        font: CTFont,
        glyphs: [CGGlyph],
        effectiveScale: CGFloat
    ) -> AtlasLayout {
        let gridSize = Int(ceil(sqrt(Double(glyphs.count))))
        let ascent = CTFontGetAscent(font)
        let descent = CTFontGetDescent(font)
        let leading = CTFontGetLeading(font)
        let lineHeight = ascent + descent + leading

        var advances = [CGSize](repeating: .zero, count: glyphs.count)
        CTFontGetAdvancesForGlyphs(font, .horizontal, glyphs, &advances, glyphs.count)
        let maxAdvance = advances.map { $0.width }.max() ?? (baseFontSize * effectiveScale)

        let padding: CGFloat = 4.0 * effectiveScale
        let cellWidth = Int(ceil(maxAdvance + (padding * 2)))
        let cellHeight = Int(ceil(lineHeight + (padding * 2)))

        let atlasWidth = gridSize * cellWidth
        let atlasHeight = gridSize * cellHeight

        return AtlasLayout(
            width: atlasWidth,
            height: atlasHeight,
            gridSize: gridSize,
            cellWidth: cellWidth,
            cellHeight: cellHeight,
            padding: padding,
            descent: descent,
            advances: advances
        )
    }

    /// Updates the cached mono advance from 'M' character
    func updateMonoAdvance() {
        if let mGlyph = charToGlyph["M"], let desc = glyphDescriptors[mGlyph] {
            monoAdvance = Float(desc.advance)
        } else {
            // Fallback to estimated value based on font size
            monoAdvance = Float(baseFontSize * 0.6)
        }
    }

    /// Builds ASCII fast-path lookup table for regular font
    func buildAsciiGlyphsTable() {
        asciiGlyphs = Array(repeating: nil, count: 128)
        for asciiValue in 32...126 {
            if let scalar = UnicodeScalar(asciiValue),
               let glyph = charToGlyph[Character(scalar)],
               let descriptor = glyphDescriptors[glyph] {
                asciiGlyphs[asciiValue] = descriptor
            }
        }
    }

    /// Builds ASCII fast-path lookup table for bold font
    func buildBoldAsciiGlyphsTable() {
        boldAsciiGlyphs = Array(repeating: nil, count: 128)
        for asciiValue in 32...126 {
            if let scalar = UnicodeScalar(asciiValue),
               let glyph = boldCharToGlyph[Character(scalar)],
               let descriptor = boldGlyphDescriptors[glyph] {
                boldAsciiGlyphs[asciiValue] = descriptor
            }
        }
    }
}
