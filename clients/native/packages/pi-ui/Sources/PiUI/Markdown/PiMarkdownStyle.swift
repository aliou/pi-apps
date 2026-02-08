import SwiftUI
import Textual

/// Pi-flavored structured text style. Based on the GitHub style with minor tweaks.
extension StructuredText {
    public struct PiStyle: Style {
        public let inlineStyle: InlineStyle = .gitHub
        public let headingStyle: GitHubHeadingStyle = .gitHub
        public let paragraphStyle: GitHubParagraphStyle = .gitHub
        public let blockQuoteStyle: GitHubBlockQuoteStyle = .gitHub
        public let codeBlockStyle: GitHubCodeBlockStyle = .gitHub
        public let listItemStyle: DefaultListItemStyle = .default
        public let unorderedListMarker: HierarchicalSymbolListMarker = .hierarchical(
            .disc, .circle, .square)
        public let orderedListMarker: DecimalListMarker = .decimal
        public let tableStyle: GitHubTableStyle = .gitHub
        public let tableCellStyle: GitHubTableCellStyle = .gitHub
        public let thematicBreakStyle: GitHubThematicBreakStyle = .gitHub

        public init() {}
    }
}

extension StructuredText.Style where Self == StructuredText.PiStyle {
    /// Pi's structured text style.
    public static var piStyle: Self { .init() }
}
