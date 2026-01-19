//
//  ButtonStyles.swift
//  PiUI
//
//  Shared button styles for iOS and macOS
//

import SwiftUI

// MARK: - Primary Button Style

public struct PrimaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(configuration.isPressed ? Theme.accent.opacity(0.8) : Theme.accent)
            )
    }
}

// MARK: - Secondary Button Style

public struct SecondaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(Theme.text)
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Theme.border, lineWidth: 1)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(configuration.isPressed ? Theme.hoverBg : Color.clear)
                    )
            )
    }
}
