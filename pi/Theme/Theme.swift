//
//  Theme.swift
//  pi
//
//  Color palette based on pi-cli themes (dark/light)
//

import SwiftUI

enum Theme {
    // MARK: - Core UI Colors
    
    static let accent = Color("accent")
    static let border = Color("border")
    static let borderAccent = Color("borderAccent")
    static let borderMuted = Color("borderMuted")
    static let success = Color("success")
    static let error = Color("error")
    static let warning = Color("warning")
    static let muted = Color("muted")
    static let dim = Color("dim")
    static let darkGray = Color("darkGray")
    
    // MARK: - Text Colors
    
    static let text = Color("text")
    static let textSecondary = Color("muted")
    static let textMuted = Color("dim")
    
    // MARK: - Backgrounds
    
    static let pageBg = Color("pageBg")
    static let cardBg = Color("cardBg")
    static let sidebarBg = Color("sidebarBg")
    static let inputBg = Color("inputBg")
    static let selectedBg = Color("selectedBg")
    static let hoverBg = Color("hoverBg")
    
    static let userMessageBg = Color("userMessageBg")
    static let toolPendingBg = Color("toolPendingBg")
    static let toolSuccessBg = Color("toolSuccessBg")
    static let toolErrorBg = Color("toolErrorBg")
    
    // MARK: - Markdown Colors
    
    static let mdHeading = Color("mdHeading")
    static let mdLink = Color("mdLink")
    static let mdCode = Color("mdCode")
    static let mdCodeBlock = Color("mdCodeBlock")
    static let mdCodeBlockBg = Color("mdCodeBlockBg")
    static let mdQuote = Color("mdQuote")
    static let mdQuoteBorder = Color("mdQuoteBorder")
    
    // MARK: - Tool Diff Colors
    
    static let diffAdded = Color("success")
    static let diffRemoved = Color("error")
    static let diffContext = Color("muted")
    
    // MARK: - Status Colors
    
    static func toolStatusColor(_ status: ToolCallStatus) -> Color {
        switch status {
        case .running: return warning
        case .success: return success
        case .error: return error
        }
    }
    
    static func toolStatusBg(_ status: ToolCallStatus) -> Color {
        switch status {
        case .running: return toolPendingBg
        case .success: return toolSuccessBg
        case .error: return toolErrorBg
        }
    }
}
