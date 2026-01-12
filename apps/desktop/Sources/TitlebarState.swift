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

    @AppStorage("showSidebar") var showSidebar = true
    @AppStorage("showDebugPanel") var showDebugPanel = false

    private init() {}
}
