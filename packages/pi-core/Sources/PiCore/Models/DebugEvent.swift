//
//  DebugEvent.swift
//  PiCore
//
//  Model for tracking RPC events for debugging
//

import Foundation

/// A captured RPC event for debugging purposes
public struct DebugEvent: Identifiable, Sendable {
    public let id: UUID
    public let timestamp: Date
    public let eventType: String
    public let details: String?
    public let rawJSON: String?

    public init(
        id: UUID = UUID(),
        timestamp: Date = Date(),
        eventType: String,
        details: String? = nil,
        rawJSON: String? = nil
    ) {
        self.id = id
        self.timestamp = timestamp
        self.eventType = eventType
        self.details = details
        self.rawJSON = rawJSON
    }
}

// MARK: - RPCEvent to DebugEvent

extension DebugEvent {
    /// Create a debug event from an RPCEvent
    public static func from(_ event: RPCEvent) -> DebugEvent {
        switch event {
        case .agentStart:
            return DebugEvent(eventType: "agentStart")

        case .agentEnd(let success, let error):
            let details = error.map { "error: \($0.message)" } ?? (success ? "success" : "failed")
            return DebugEvent(eventType: "agentEnd", details: details)

        case .turnStart:
            return DebugEvent(eventType: "turnStart")

        case .turnEnd:
            return DebugEvent(eventType: "turnEnd")

        case .messageStart(let messageId):
            return DebugEvent(eventType: "messageStart", details: messageId)

        case .messageEnd(let stopReason):
            return DebugEvent(eventType: "messageEnd", details: stopReason)

        case .messageUpdate(_, let assistantEvent):
            let details = describeAssistantEvent(assistantEvent)
            return DebugEvent(eventType: "messageUpdate", details: details)

        case .toolExecutionStart(let toolCallId, let toolName, let args):
            let argsPreview = args?.jsonString?.prefix(100).description ?? "nil"
            return DebugEvent(
                eventType: "toolExecutionStart",
                details: "\(toolName) (\(toolCallId.prefix(8))...)",
                rawJSON: argsPreview
            )

        case .toolExecutionUpdate(let toolCallId, let output):
            return DebugEvent(
                eventType: "toolExecutionUpdate",
                details: "(\(toolCallId.prefix(8))...)",
                rawJSON: String(output.prefix(200))
            )

        case .toolExecutionEnd(let toolCallId, _, let status):
            return DebugEvent(
                eventType: "toolExecutionEnd",
                details: "\(status.rawValue) (\(toolCallId.prefix(8))...)"
            )

        case .autoCompactionStart:
            return DebugEvent(eventType: "autoCompactionStart")

        case .autoCompactionEnd:
            return DebugEvent(eventType: "autoCompactionEnd")

        case .autoRetryStart(let attempt, let maxAttempts, let delayMs, let errorMessage):
            return DebugEvent(
                eventType: "autoRetryStart",
                details: "attempt \(attempt)/\(maxAttempts), delay \(delayMs)ms",
                rawJSON: errorMessage
            )

        case .autoRetryEnd(let success, let attempt, let finalError):
            let details = success ? "success at attempt \(attempt)" : "failed: \(finalError ?? "unknown")"
            return DebugEvent(eventType: "autoRetryEnd", details: details)

        case .hookError(let extensionPath, let event, let error):
            return DebugEvent(
                eventType: "hookError",
                details: "\(extensionPath ?? "?") - \(event ?? "?")",
                rawJSON: error
            )

        case .extensionError(let extensionPath, let event, let error):
            return DebugEvent(
                eventType: "extensionError",
                details: "\(extensionPath) - \(event)",
                rawJSON: error
            )

        case .extensionUIRequest(let request):
            let methodDesc = "\(request.method.rawValue)"
            let titleDesc = request.title.map { " - \($0)" } ?? ""
            return DebugEvent(
                eventType: "extensionUIRequest",
                details: "\(methodDesc)\(titleDesc)",
                rawJSON: request.id
            )

        case .stateUpdate(let context):
            return DebugEvent(
                eventType: "stateUpdate",
                details: "messageCount: \(context.messageCount ?? 0)"
            )

        case .modelChanged(let model):
            return DebugEvent(eventType: "modelChanged", details: model.name)

        case .nativeToolRequest(let request):
            return DebugEvent(
                eventType: "nativeToolRequest",
                details: "\(request.toolName) (\(request.callId.prefix(8))...)"
            )

        case .nativeToolCancel(let callId):
            return DebugEvent(eventType: "nativeToolCancel", details: callId)

        case .unknown(let type, _):
            return DebugEvent(eventType: "unknown", details: type)
        }
    }

    private static func describeAssistantEvent(_ event: AssistantMessageEvent) -> String {
        switch event {
        case .textDelta(let delta):
            let preview = delta.prefix(50)
            return "text: \"\(preview)\(delta.count > 50 ? "..." : "")\""

        case .thinkingDelta(let delta):
            let preview = delta.prefix(50)
            return "thinking: \"\(preview)\(delta.count > 50 ? "..." : "")\""

        case .toolUseStart(let toolCallId, let toolName):
            return "toolUseStart: \(toolName) (\(toolCallId.prefix(8))...)"

        case .toolUseInputDelta(let toolCallId, let delta):
            return "toolInputDelta: (\(toolCallId.prefix(8))...) +\(delta.count) chars"

        case .toolUseEnd(let toolCallId):
            return "toolUseEnd: (\(toolCallId.prefix(8))...)"

        case .messageStart(let messageId):
            return "messageStart: \(messageId)"

        case .messageEnd(let stopReason):
            return "messageEnd: \(stopReason ?? "nil")"

        case .contentBlockStart(let index, let blockType):
            return "contentBlockStart: \(index) (\(blockType))"

        case .contentBlockEnd(let index):
            return "contentBlockEnd: \(index)"

        case .unknown(let type):
            return "unknown: \(type)"
        }
    }
}
