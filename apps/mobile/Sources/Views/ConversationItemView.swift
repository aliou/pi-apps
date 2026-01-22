//
//  ConversationItemView.swift
//  Pi
//
//  View for rendering a single conversation item (message or tool call)
//

import SwiftUI
import PiCore
import PiUI

struct ConversationItemView: View {
    let item: ConversationItem

    var body: some View {
        switch item {
        case .userMessage(_, let text, let queuedBehavior):
            userMessageView(text: text, queuedBehavior: queuedBehavior)

        case .assistantText(_, let text):
            MessageBubbleView(role: .assistant, text: text)

        case .toolCall(_, let name, let args, _, let status):
            toolCallView(name: name, args: args, status: status)

        case .systemEvent(_, let event):
            systemEventView(event: event)

        case .richContent(_, let content, let summary):
            RichContentView(content: content, summary: summary)
        }
    }

    // MARK: - Subviews

    @ViewBuilder
    private func userMessageView(text: String, queuedBehavior: StreamingBehavior?) -> some View {
        if let queuedBehavior {
            VStack(alignment: .trailing, spacing: 4) {
                HStack {
                    Spacer()
                    Text(queuedBehavior == .steer ? "steer" : "follow-up")
                        .font(.caption2)
                        .foregroundStyle(Theme.textSecondary)
                }
                .padding(.horizontal, 16)

                MessageBubbleView(role: .user, text: text, isQueued: true)
            }
        } else {
            MessageBubbleView(role: .user, text: text)
        }
    }

    private func toolCallView(name: String, args: String?, status: ToolCallStatus) -> some View {
        ToolCallHeader(
            toolName: name,
            args: args,
            status: status,
            showChevron: false
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.toolStatusBg(status))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func systemEventView(event: SystemEventType) -> some View {
        switch event {
        case .modelSwitch(let fromModel, let toModel):
            HStack(spacing: 8) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)

                if let from = fromModel {
                    Text("Switched from \(from) to \(toModel)")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                } else {
                    Text("Model set to \(toModel)")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
    }
}

// MARK: - Previews

#Preview("User Message") {
    VStack(spacing: 16) {
        ConversationItemView(item: .userMessage(id: "1", text: "Hello, how can I help you?", queuedBehavior: nil))
        ConversationItemView(item: .userMessage(id: "2", text: "This is queued", queuedBehavior: .steer))
        ConversationItemView(item: .userMessage(id: "3", text: "Follow-up message", queuedBehavior: .followUp))
    }
    .padding()
    .background(Theme.pageBg)
}

#Preview("Assistant Text") {
    ConversationItemView(item: .assistantText(id: "1", text: "Here's my response to your question."))
        .padding()
        .background(Theme.pageBg)
}

#Preview("Tool Calls") {
    VStack(spacing: 16) {
        ConversationItemView(item: .toolCall(id: "1", name: "Read", args: "{\"path\": \"file.txt\"}", output: nil, status: .running))
        ConversationItemView(item: .toolCall(id: "2", name: "Bash", args: "{\"command\": \"ls -la\"}", output: "success", status: .success))
        ConversationItemView(item: .toolCall(id: "3", name: "Write", args: nil, output: "error", status: .error))
    }
    .padding()
    .background(Theme.pageBg)
}

#Preview("System Events") {
    VStack(spacing: 16) {
        ConversationItemView(item: .modelSwitch(from: nil, to: "Claude Sonnet 4.5"))
        ConversationItemView(item: .modelSwitch(from: "Claude Sonnet 4.5", to: "GPT-5.2"))
    }
    .padding()
    .background(Theme.pageBg)
}

#Preview("Rich Content") {
    VStack(spacing: 16) {
        if let chartItem = ConversationItem.rich(
            from: DisplayEnvelope(
                display: .chart(ChartDisplayData(
                    chartType: .bar,
                    title: "Sleep Stages",
                    data: [
                        ChartDataPoint(label: "REM", value: 90),
                        ChartDataPoint(label: "Deep", value: 45),
                        ChartDataPoint(label: "Core", value: 180)
                    ]
                )),
                summary: "Displayed bar chart showing sleep stages"
            )
        ) {
            ConversationItemView(item: chartItem)
        }

        if let mapItem = ConversationItem.rich(
            from: DisplayEnvelope(
                display: .map(MapDisplayData(
                    pins: [MapPin(coordinate: Coordinate(latitude: 37.7749, longitude: -122.4194), title: "San Francisco")]
                )),
                summary: "Showing 1 location on map"
            )
        ) {
            ConversationItemView(item: mapItem)
        }
    }
    .padding()
    .background(Theme.pageBg)
}
