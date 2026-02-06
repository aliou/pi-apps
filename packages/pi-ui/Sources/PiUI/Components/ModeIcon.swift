import SwiftUI

/// Display mode for a session (chat vs code). Separate from PiCore's SessionMode
/// so PiUI has no dependency on PiCore.
public enum SessionModeDisplay {
    case chat
    case code
}

/// SF Symbol icon representing a session mode.
public struct ModeIcon: View {
    let mode: SessionModeDisplay

    public init(_ mode: SessionModeDisplay) {
        self.mode = mode
    }

    public var body: some View {
        Image(systemName: systemName)
            .imageScale(.medium)
    }

    private var systemName: String {
        switch mode {
        case .chat: "bubble.left"
        case .code: "chevron.left.forwardslash.chevron.right"
        }
    }
}

#Preview("Chat mode") {
    ModeIcon(.chat)
}

#Preview("Code mode") {
    ModeIcon(.code)
}

#Preview("Both modes side by side") {
    HStack(spacing: 16) {
        ModeIcon(.chat)
        ModeIcon(.code)
    }
}
