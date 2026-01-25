//
//  PromptInputField.swift
//  pi
//
//  Always-visible input field with submit button for WelcomeView
//

import SwiftUI

struct PromptInputField: View {
    @Binding var text: String
    let placeholder: String
    let canSubmit: Bool
    let onSubmit: () -> Void

    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Text field - taller with more padding
            TextField(placeholder, text: $text, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...6)
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 8)
                .focused($isFocused)
                .onSubmit {
                    if canSubmit {
                        onSubmit()
                    }
                }

            // Bottom row with submit button
            HStack {
                Spacer()

                // Submit button
                Button {
                    onSubmit()
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(canSubmit ? .white : .secondary)
                        .frame(width: 32, height: 32)
                        .background(canSubmit ? Color.accentColor : Color.secondary.opacity(0.2))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
        }
        .frame(minHeight: 100)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(16)
    }
}

// MARK: - Preview

#Preview("Empty - Can't Submit") {
    PromptInputField(
        text: .constant(""),
        placeholder: "What would you like to do?",
        canSubmit: false
    ) {}
    .frame(width: 400)
    .padding()
}

#Preview("With Text - Can Submit") {
    PromptInputField(
        text: .constant("Help me refactor this function"),
        placeholder: "What would you like to do?",
        canSubmit: true
    ) {}
    .frame(width: 400)
    .padding()
}

#Preview("Multiline") {
    PromptInputField(
        text: .constant("This is a longer prompt that might span multiple lines to see how the text field handles wrapping and vertical expansion."),
        placeholder: "What would you like to do?",
        canSubmit: true
    ) {}
    .frame(width: 400)
    .padding()
}
