//
//  NavigationPillView.swift
//  Pi
//
//  Top-left pill with Settings, Chat History, and Code Sessions buttons.
//

import SwiftUI

struct NavigationPillView: View {
    @Binding var showSettings: Bool
    @Binding var showChatHistory: Bool
    @Binding var showCodeSessions: Bool

    @Namespace private var navigationPill

    var body: some View {
        GlassEffectContainer {
            HStack(spacing: 0) {
                Button {
                    showSettings = true
                } label: {
                    Image(systemName: "gearshape")
                        .padding(10)
                }
                .glassEffect(.regular.interactive())
                .glassEffectUnion(id: "nav", namespace: navigationPill)

                Button {
                    showChatHistory = true
                } label: {
                    Image(systemName: "bubble.left")
                        .padding(10)
                }
                .glassEffect(.regular.interactive())
                .glassEffectUnion(id: "nav", namespace: navigationPill)

                Button {
                    showCodeSessions = true
                } label: {
                    Image(systemName: "chevron.left.forwardslash.chevron.right")
                        .padding(10)
                }
                .glassEffect(.regular.interactive())
                .glassEffectUnion(id: "nav", namespace: navigationPill)
            }
        }
    }
}

// MARK: - Previews

#Preview("Navigation Pill") {
    ZStack {
        Color.black.ignoresSafeArea()

        NavigationPillView(
            showSettings: .constant(false),
            showChatHistory: .constant(false),
            showCodeSessions: .constant(false)
        )
    }
}

#Preview("Navigation Pill - Light") {
    ZStack {
        Color.white.ignoresSafeArea()

        NavigationPillView(
            showSettings: .constant(false),
            showChatHistory: .constant(false),
            showCodeSessions: .constant(false)
        )
    }
}
