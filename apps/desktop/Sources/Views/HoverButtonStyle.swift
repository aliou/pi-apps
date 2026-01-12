//
//  HoverButtonStyle.swift
//  pi
//
//  Reusable hover effects for interactive elements
//

import SwiftUI
import AppKit

// MARK: - Hover Effect (background + cursor)

struct HoverEffect: ViewModifier {
    var cornerRadius: CGFloat = 6
    var hoverBackground = Color.white.opacity(0.1)
    var showPointer = true

    @State private var isHovered = false

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(isHovered ? hoverBackground : Color.clear)
            )
            .onHover { hovering in
                isHovered = hovering
                if showPointer {
                    if hovering {
                        NSCursor.pointingHand.push()
                    } else {
                        NSCursor.pop()
                    }
                }
            }
    }
}

// MARK: - Pointer Cursor (cursor only)

struct PointerCursor: ViewModifier {
    var onHover: ((Bool) -> Void)?

    func body(content: Content) -> some View {
        content
            .onHover { hovering in
                if hovering {
                    NSCursor.pointingHand.push()
                } else {
                    NSCursor.pop()
                }
                onHover?(hovering)
            }
    }
}

// MARK: - View Extensions

extension View {
    /// Adds hover background effect and pointer cursor
    func hoverEffect(
        cornerRadius: CGFloat = 6,
        hoverBackground: Color = Color.white.opacity(0.1),
        showPointer: Bool = true
    ) -> some View {
        modifier(HoverEffect(
            cornerRadius: cornerRadius,
            hoverBackground: hoverBackground,
            showPointer: showPointer
        ))
    }

    /// Adds pointer cursor on hover (no background change)
    func pointerCursor(onHover: ((Bool) -> Void)? = nil) -> some View {
        modifier(PointerCursor(onHover: onHover))
    }
}
