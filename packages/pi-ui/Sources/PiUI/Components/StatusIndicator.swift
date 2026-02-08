import SwiftUI

/// Display status for a session. Separate from PiCore's session status
/// so PiUI has no dependency on PiCore.
public enum SessionStatusDisplay {
    case active   // agent is streaming
    case idle     // waiting for user input
    case archived // suspended
}

/// Colored dot indicating session status. Pulses when active.
public struct StatusIndicator: View {
    let status: SessionStatusDisplay

    public init(_ status: SessionStatusDisplay) {
        self.status = status
    }

    @State private var isPulsing = false

    public var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .opacity(opacity)
            .animation(
                status == .active
                    ? .easeInOut(duration: 0.8).repeatForever(autoreverses: true)
                    : .default,
                value: isPulsing
            )
            .onAppear {
                if status == .active {
                    isPulsing = true
                }
            }
            .onChange(of: status) {
                isPulsing = status == .active
            }
    }

    private var color: Color {
        switch status {
        case .active: .green
        case .idle: .gray
        case .archived: .gray
        }
    }

    private var opacity: Double {
        switch status {
        case .active: isPulsing ? 0.4 : 1.0
        case .idle: 1.0
        case .archived: 0.4
        }
    }
}

#Preview("Active (pulsing)") {
    StatusIndicator(.active)
        .padding(40)
}

#Preview("Idle") {
    StatusIndicator(.idle)
        .padding(40)
}

#Preview("Archived") {
    StatusIndicator(.archived)
        .padding(40)
}

#Preview("All states side by side") {
    HStack(spacing: 16) {
        VStack(spacing: 8) {
            StatusIndicator(.active)
            Text("Active")
                .font(.caption)
        }
        VStack(spacing: 8) {
            StatusIndicator(.idle)
            Text("Idle")
                .font(.caption)
        }
        VStack(spacing: 8) {
            StatusIndicator(.archived)
            Text("Archived")
                .font(.caption)
        }
    }
}
