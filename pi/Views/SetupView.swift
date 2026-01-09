//
//  SetupView.swift
//  pi
//
//  Shown on first launch when pi binary needs to be downloaded
//

import SwiftUI

struct SetupView: View {
    @State private var downloadProgress: Double = 0
    @State private var statusMessage: String = "Preparing..."
    @State private var isDownloading: Bool = false
    @State private var error: String?
    
    let onComplete: () -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            
            // App icon / logo
            Image(systemName: "terminal.fill")
                .font(.system(size: 64))
                .foregroundColor(Theme.accent)
            
            Text("Pi Desktop")
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(Theme.text)
            
            Text("Setting up for first use")
                .font(.system(size: 14))
                .foregroundColor(Theme.textSecondary)
            
            Spacer()
            
            // Progress section
            VStack(spacing: 16) {
                if let error = error {
                    // Error state
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 32))
                            .foregroundColor(Theme.error)
                        
                        Text("Download Failed")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(Theme.text)
                        
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                        
                        Button("Retry") {
                            startDownload()
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .padding(.top, 8)
                    }
                } else if isDownloading {
                    // Downloading state
                    VStack(spacing: 12) {
                        ProgressView(value: downloadProgress)
                            .progressViewStyle(.linear)
                            .frame(width: 300)
                            .tint(Theme.accent)
                        
                        Text(statusMessage)
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                    }
                } else {
                    // Initial state
                    VStack(spacing: 12) {
                        Text("Pi needs to download its CLI component")
                            .font(.system(size: 14))
                            .foregroundColor(Theme.textSecondary)
                        
                        Button("Download") {
                            startDownload()
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                }
            }
            .frame(height: 120)
            
            Spacer()
            
            // Footer
            Text("Downloading from github.com/badlogic/pi-mono")
                .font(.system(size: 11))
                .foregroundColor(Theme.dim)
                .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
        .onAppear {
            // Auto-start download
            startDownload()
        }
    }
    
    private func startDownload() {
        error = nil
        isDownloading = true
        downloadProgress = 0
        statusMessage = "Preparing..."
        
        Task {
            do {
                try await BinaryUpdateService.shared.downloadLatestBinary { progress, message in
                    Task { @MainActor in
                        self.downloadProgress = progress
                        self.statusMessage = message
                    }
                }
                
                await MainActor.run {
                    onComplete()
                }
            } catch {
                await MainActor.run {
                    self.error = error.localizedDescription
                    self.isDownloading = false
                }
            }
        }
    }
}

// MARK: - Primary Button Style

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
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

// MARK: - Update Available Banner

struct UpdateAvailableBanner: View {
    let version: String
    let onUpdate: () -> Void
    let onDismiss: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.down.circle.fill")
                .foregroundColor(Theme.accent)
            
            Text("Update available: \(version)")
                .font(.system(size: 13))
                .foregroundColor(Theme.text)
            
            Spacer()
            
            Button("Update") {
                onUpdate()
            }
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(Theme.accent)
            
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Theme.dim)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.cardBg)
        .overlay(
            Rectangle()
                .fill(Theme.borderMuted)
                .frame(height: 1),
            alignment: .bottom
        )
    }
}

// MARK: - Update Sheet

struct UpdateSheet: View {
    @Environment(\.dismiss) private var dismiss
    
    @State private var downloadProgress: Double = 0
    @State private var statusMessage: String = "Preparing..."
    @State private var isDownloading: Bool = false
    @State private var error: String?
    @State private var completed: Bool = false
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Update Pi")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(Theme.text)
            
            if let error = error {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(Theme.error)
                    
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                    
                    HStack(spacing: 12) {
                        Button("Cancel") {
                            dismiss()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        
                        Button("Retry") {
                            startUpdate()
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                }
            } else if completed {
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(Theme.success)
                    
                    Text("Update complete!")
                        .font(.system(size: 14))
                        .foregroundColor(Theme.text)
                    
                    Text("The new version will be used for new sessions.")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textSecondary)
                    
                    Button("Done") {
                        dismiss()
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.top, 8)
                }
            } else if isDownloading {
                VStack(spacing: 12) {
                    ProgressView(value: downloadProgress)
                        .progressViewStyle(.linear)
                        .frame(width: 250)
                        .tint(Theme.accent)
                    
                    Text(statusMessage)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textSecondary)
                }
            } else {
                VStack(spacing: 12) {
                    Text("Download and install the latest version?")
                        .font(.system(size: 14))
                        .foregroundColor(Theme.textSecondary)
                    
                    HStack(spacing: 12) {
                        Button("Cancel") {
                            dismiss()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        
                        Button("Update") {
                            startUpdate()
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                }
            }
        }
        .padding(32)
        .frame(width: 350)
        .background(Theme.cardBg)
    }
    
    private func startUpdate() {
        error = nil
        isDownloading = true
        downloadProgress = 0
        statusMessage = "Preparing..."
        
        Task {
            do {
                try await BinaryUpdateService.shared.applyUpdate { progress, message in
                    Task { @MainActor in
                        self.downloadProgress = progress
                        self.statusMessage = message
                    }
                }
                
                await MainActor.run {
                    self.isDownloading = false
                    self.completed = true
                }
            } catch {
                await MainActor.run {
                    self.error = error.localizedDescription
                    self.isDownloading = false
                }
            }
        }
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
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

// MARK: - Preview

#Preview("Setup View") {
    SetupView(onComplete: {})
        .frame(width: 500, height: 400)
}

#Preview("Update Banner") {
    UpdateAvailableBanner(version: "v0.43.0", onUpdate: {}, onDismiss: {})
        .frame(width: 400)
}
