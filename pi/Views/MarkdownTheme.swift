//
//  MarkdownTheme.swift
//  pi
//

import SwiftUI
import Textual

struct PiMarkdownStyle: StructuredText.Style {
    let inlineStyle = InlineStyle()
        .code(.monospaced, .fontScale(0.9))
        .strong(.fontWeight(.semibold))
        .emphasis(.italic)
        .link(.foregroundColor(Theme.mdLink))

    let headingStyle = PiHeadingStyle()
    let paragraphStyle = StructuredText.DefaultParagraphStyle.default
    let blockQuoteStyle = PiBlockQuoteStyle()
    let codeBlockStyle = PiCodeBlockStyle()
    let listItemStyle = StructuredText.DefaultListItemStyle.default
    let unorderedListMarker = StructuredText.SymbolListMarker.disc
    let orderedListMarker = StructuredText.DecimalListMarker.decimal
    let tableStyle = StructuredText.DefaultTableStyle.default
    let tableCellStyle = StructuredText.DefaultTableCellStyle.default
    let thematicBreakStyle = StructuredText.DividerThematicBreakStyle.divider
}

struct PiHeadingStyle: StructuredText.HeadingStyle {
    private static let fontScales: [CGFloat] = [1.5, 1.3, 1.15, 1, 0.9, 0.85]

    func makeBody(configuration: Configuration) -> some View {
        let level = min(configuration.headingLevel, 6)
        configuration.label
            .textual.fontScale(Self.fontScales[level - 1])
            .fontWeight(.semibold)
            .foregroundStyle(Theme.mdHeading)
            .textual.blockSpacing(.fontScaled(top: 1.0, bottom: 0.4))
    }
}

struct PiCodeBlockStyle: StructuredText.CodeBlockStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, design: .monospaced))
            .foregroundStyle(Theme.mdCodeBlock)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.mdCodeBlockBg)
            .cornerRadius(8)
            .textual.blockSpacing(.fontScaled(top: 0.5, bottom: 0.5))
    }
}

struct PiBlockQuoteStyle: StructuredText.BlockQuoteStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(Theme.mdQuoteBorder)
                .frame(width: 3)

            configuration.label
                .padding(.leading, 12)
                .foregroundStyle(Theme.mdQuote)
        }
        .textual.blockSpacing(.fontScaled(top: 0.5, bottom: 0.5))
    }
}
