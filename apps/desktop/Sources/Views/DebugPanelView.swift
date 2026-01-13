//
//  DebugPanelView.swift
//  pi
//

import SwiftUI
import Combine
import AppKit
import PiCore

// MARK: - Debug Event

struct DebugEvent: Identifiable {
    let id = UUID()
    let timestamp: Date
    let type: EventType
    let summary: String
    let details: String?

    enum EventType {
        case sent
        case received
        case error

        var color: Color {
            switch self {
            case .sent: return Theme.border
            case .received: return Theme.success
            case .error: return Theme.error
            }
        }

        var icon: String {
            switch self {
            case .sent: return "arrow.up.circle.fill"
            case .received: return "arrow.down.circle.fill"
            case .error: return "exclamationmark.triangle.fill"
            }
        }
    }
}

// MARK: - Debug Event Store

@MainActor
class DebugEventStore: ObservableObject {
    @Published var events: [DebugEvent] = []
    private let maxEvents = 500

    // Throttling for batch updates
    private var pendingEvents: [DebugEvent] = []
    private var flushTask: Task<Void, Never>?
    private let flushInterval: UInt64 = 100_000_000 // 100ms in nanoseconds

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task {
            try? await Task.sleep(nanoseconds: flushInterval)
            guard !Task.isCancelled else { return }
            flush()
        }
    }

    private func flush() {
        guard !pendingEvents.isEmpty else { return }

        events.append(contentsOf: pendingEvents)
        pendingEvents.removeAll()

        if events.count > maxEvents {
            events.removeFirst(events.count - maxEvents)
        }
    }

    func addEvent(_ event: DebugEvent) {
        pendingEvents.append(event)
        scheduleFlush()
    }

    func addSent(command: String, details: String? = nil) {
        addEvent(DebugEvent(
            timestamp: Date(),
            type: .sent,
            summary: command,
            details: details
        ))
    }

    func addReceived(type: String, summary: String, details: String? = nil) {
        addEvent(DebugEvent(
            timestamp: Date(),
            type: .received,
            summary: "\(type): \(summary)",
            details: details
        ))
    }

    func addError(_ message: String, details: String? = nil) {
        addEvent(DebugEvent(
            timestamp: Date(),
            type: .error,
            summary: message,
            details: details
        ))
    }

    func clear() {
        pendingEvents.removeAll()
        events.removeAll()
    }
}

// MARK: - Debug Panel View

struct DebugPanelView: View {
    @ObservedObject var store: DebugEventStore
    @State private var selectedEventId: UUID?
    @State private var autoScroll = true

    private let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return f
    }()

    @State private var logPath = ""

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("RPC Debug")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Theme.muted)

                Spacer()

                Toggle("Auto-scroll", isOn: $autoScroll)
                    .toggleStyle(.checkbox)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.dim)

                Button("Clear") {
                    store.clear()
                }
                .font(.system(size: 10))
                .foregroundColor(Theme.dim)
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .padding(.top, 28) // Account for titlebar area
            .background(Theme.cardBg)

            // Log file path (clickable)
            if !logPath.isEmpty {
                Button {
                    NSWorkspace.shared.selectFile(logPath, inFileViewerRootedAtPath: "")
                } label: {
                    Text("Log: \((logPath as NSString).lastPathComponent)")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(Theme.dim)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                }
                .buttonStyle(.plain)
                .help(logPath)
            }

            Divider()
                .background(Theme.borderMuted)

            // Events list
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(store.events) { event in
                            eventRow(event)
                                .id(event.id)
                        }

                        Color.clear
                            .frame(height: 1)
                            .id("bottom")
                    }
                    .padding(4)
                }
                .onChange(of: store.events.count) { oldCount, newCount in
                    guard autoScroll, newCount > oldCount else { return }
                    DispatchQueue.main.async {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
            }

            // Selected event details
            if let selectedId = selectedEventId,
               let event = store.events.first(where: { $0.id == selectedId }),
               let details = event.details {
                Divider()
                    .background(Theme.borderMuted)

                ScrollView {
                    Text(details)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(Theme.muted)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(6)
                }
                .frame(maxHeight: 150)
                .background(Theme.pageBg)
            }
        }
        .background(Theme.sidebarBg)
        .task {
            logPath = await Logger.shared.logFilePath
        }
    }

    private func eventRow(_ event: DebugEvent) -> some View {
        Button {
            if selectedEventId == event.id {
                selectedEventId = nil
            } else {
                selectedEventId = event.id
            }
        } label: {
            HStack(alignment: .top, spacing: 4) {
                Image(systemName: event.type.icon)
                    .font(.system(size: 8))
                    .foregroundColor(event.type.color)
                    .frame(width: 12)

                Text(timeFormatter.string(from: event.timestamp))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(Theme.dim)

                Text(event.summary)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.text)
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer(minLength: 0)

                if event.details != nil {
                    Image(systemName: selectedEventId == event.id ? "chevron.down" : "chevron.right")
                        .font(.system(size: 8))
                        .foregroundColor(Theme.dim)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(selectedEventId == event.id ? Theme.selectedBg : Color.clear)
            .cornerRadius(3)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

#Preview {
    let store = DebugEventStore()
    store.addSent(command: "prompt", details: "{\"type\": \"prompt\", \"message\": \"Hello world\"}")
    store.addReceived(type: "response", summary: "prompt success")
    store.addReceived(type: "agent_start", summary: "")
    store.addReceived(type: "message_update", summary: "text_delta: Hello")
    store.addReceived(type: "tool_execution_start", summary: "bash", details: "{\"toolCallId\": \"abc123\", \"toolName\": \"bash\", \"args\": {\"command\": \"ls -la\"}}")
    store.addReceived(type: "tool_execution_end", summary: "bash success")
    store.addReceived(type: "agent_end", summary: "")
    store.addError("Connection lost", details: "Process terminated with exit code 1")

    return DebugPanelView(store: store)
        .frame(width: 300, height: 400)
}
