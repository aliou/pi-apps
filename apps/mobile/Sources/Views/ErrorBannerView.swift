//
//  ErrorBannerView.swift
//  Pi
//
//  Dismissible error banner for displaying errors to users
//

import SwiftUI
import PiUI

struct ErrorBannerView: View {
    let message: String
    let onDismiss: () -> Void
    var onRetry: (() -> Void)?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Theme.error)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(Theme.text)

            Spacer()

            if let onRetry {
                Button("Retry") { onRetry() }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.accent)
            }

            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.toolErrorBg)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 16)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

// MARK: - Previews

#Preview("Default") {
    VStack {
        ErrorBannerView(message: "Failed to load sessions") {}
        Spacer()
    }
    .padding(.top, 16)
    .background(Theme.pageBg)
}

#Preview("With Retry") {
    VStack {
        ErrorBannerView(
            message: "Connection lost. Please try again.",
            onDismiss: {},
            onRetry: {}
        )
        Spacer()
    }
    .padding(.top, 16)
    .background(Theme.pageBg)
}

#Preview("Dark Mode") {
    VStack {
        ErrorBannerView(
            message: "Failed to connect to server",
            onDismiss: {},
            onRetry: {}
        )
        Spacer()
    }
    .padding(.top, 16)
    .background(Theme.pageBg)
    .preferredColorScheme(.dark)
}
