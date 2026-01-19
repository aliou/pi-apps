//
//  MarkdownTheme.swift
//  PiUI
//

import SwiftUI
import Textual

public struct PiMarkdownStyle: StructuredText.Style {
    public init() {}

    public let inlineStyle = InlineStyle()
        .code(.monospaced, .fontScale(0.9))
        .strong(.fontWeight(.semibold))
        .emphasis(.italic)
        .link(.foregroundColor(Theme.mdLink))

    public let headingStyle = PiHeadingStyle()
    public let paragraphStyle = StructuredText.DefaultParagraphStyle.default
    public let blockQuoteStyle = PiBlockQuoteStyle()
    public let codeBlockStyle = PiCodeBlockStyle()
    public let listItemStyle = StructuredText.DefaultListItemStyle.default
    public let unorderedListMarker = StructuredText.SymbolListMarker.disc
    public let orderedListMarker = StructuredText.DecimalListMarker.decimal
    public let tableStyle = StructuredText.DefaultTableStyle.default
    public let tableCellStyle = StructuredText.DefaultTableCellStyle.default
    public let thematicBreakStyle = StructuredText.DividerThematicBreakStyle.divider
}

public struct PiHeadingStyle: StructuredText.HeadingStyle {
    public init() {}

    private static let fontScales: [CGFloat] = [1.5, 1.3, 1.15, 1, 0.9, 0.85]

    public func makeBody(configuration: Configuration) -> some View {
        let level = min(configuration.headingLevel, 6)
        configuration.label
            .textual.fontScale(Self.fontScales[level - 1])
            .fontWeight(.semibold)
            .foregroundStyle(Theme.mdHeading)
            .textual.blockSpacing(.fontScaled(top: 1.0, bottom: 0.4))
    }
}

public struct PiCodeBlockStyle: StructuredText.CodeBlockStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
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

public struct PiBlockQuoteStyle: StructuredText.BlockQuoteStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
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
