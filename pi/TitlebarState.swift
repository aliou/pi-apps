//
//  TitlebarState.swift
//  pi
//
//  Shared state for titlebar accessory buttons
//

import SwiftUI
import Combine

@MainActor
class TitlebarState: ObservableObject {
    static let shared = TitlebarState()
    
    @Published var showSidebar = true
    @Published var showDebugPanel = true
    
    private init() {}
}
