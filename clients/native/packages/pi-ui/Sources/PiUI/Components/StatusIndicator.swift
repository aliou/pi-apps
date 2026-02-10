import SwiftUI

/// Display status for a session, matching the backend session lifecycle.
public enum SessionDisplayStatus: Sendable, Equatable {
    case creating
    case active
    case idle
    case archived
    case error
}

/// Colored dot indicating session status. Pulses when active.
public struct StatusIndicator: View {
    let status: SessionDisplayStatus

    public init(_ status: SessionDisplayStatus) {
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
        case .creating: .blue
        case .active: .green
        case .idle: .gray
        case .archived: .gray
        case .error: .red
        }
    }

    private var opacity: Double {
        switch status {
        case .creating: 1.0
        case .active: isPulsing ? 0.4 : 1.0
        case .idle: 1.0
        case .archived: 0.4
        case .error: 1.0
        }
    }
}

#Preview("Creating") {
    StatusIndicator(.creating)
        .padding(40)
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

#Preview("Error") {
    StatusIndicator(.error)
        .padding(40)
}

#Preview("All states side by side") {
    HStack(spacing: 16) {
        VStack(spacing: 8) {
            StatusIndicator(.creating)
            Text("Creating")
                .font(.caption)
        }
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
        VStack(spacing: 8) {
            StatusIndicator(.error)
            Text("Error")
                .font(.caption)
        }
    }
}
