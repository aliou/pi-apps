//
//  DisplayChartTool.swift
//  Pi
//
//  Tool for displaying charts inline in conversation
//

import Foundation
import PiCore

/// Tool for displaying charts inline in the conversation.
/// The LLM provides the chart type and data; the tool returns display content.
public struct DisplayChartTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "display_chart",
        description: """
            Display a chart inline in the conversation. Use this to visualize data \
            for the user. Supports bar charts for comparing categories and line charts \
            for showing trends over time.
            """,
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([
                "chartType": [
                    "type": "string",
                    "enum": ["bar", "line"],
                    "description": "Type of chart to display"
                ],
                "title": [
                    "type": "string",
                    "description": "Chart title (optional)"
                ],
                "data": [
                    "type": "array",
                    "items": [
                        "type": "object",
                        "properties": [
                            "label": [
                                "type": "string",
                                "description": "Data point label (x-axis)"
                            ],
                            "value": [
                                "type": "number",
                                "description": "Data point value (y-axis)"
                            ],
                            "color": [
                                "type": "string",
                                "description": "Optional hex color (e.g., #FF5733)"
                            ]
                        ],
                        "required": ["label", "value"]
                    ],
                    "description": "Array of data points to chart"
                ],
                "xAxisLabel": [
                    "type": "string",
                    "description": "Label for x-axis (optional)"
                ],
                "yAxisLabel": [
                    "type": "string",
                    "description": "Label for y-axis (optional)"
                ]
            ]),
            "required": AnyCodable(["chartType", "data"])
        ]
    )

    /// Display tools are always available (no permissions needed)
    public static func isAvailable() -> Bool {
        true
    }

    public init() {}

    public func execute(
        args: [String: AnyCodable],
        onCancel: @escaping @Sendable () -> Void
    ) async throws -> [String: Any] {
        // Parse chart type
        guard let chartTypeString = args["chartType"]?.value as? String,
              let chartType = ChartType(rawValue: chartTypeString) else {
            throw NativeToolError.executionFailed(
                "Invalid chartType. Must be 'bar' or 'line'."
            )
        }

        // Parse data array
        guard let dataArray = args["data"]?.value as? [[String: Any]] else {
            throw NativeToolError.executionFailed(
                "Invalid data format. Expected array of objects with 'label' and 'value'."
            )
        }

        // Convert to ChartDataPoint
        var dataPoints: [ChartDataPoint] = []
        for (index, item) in dataArray.enumerated() {
            guard let label = item["label"] as? String else {
                throw NativeToolError.executionFailed(
                    "Data point \(index) missing 'label' string."
                )
            }

            let value: Double
            if let doubleValue = item["value"] as? Double {
                value = doubleValue
            } else if let intValue = item["value"] as? Int {
                value = Double(intValue)
            } else {
                throw NativeToolError.executionFailed(
                    "Data point \(index) missing numeric 'value'."
                )
            }

            let color = item["color"] as? String
            dataPoints.append(ChartDataPoint(label: label, value: value, color: color))
        }

        guard !dataPoints.isEmpty else {
            throw NativeToolError.executionFailed("Data array cannot be empty.")
        }

        // Parse optional fields
        let title = args["title"]?.value as? String
        let xAxisLabel = args["xAxisLabel"]?.value as? String
        let yAxisLabel = args["yAxisLabel"]?.value as? String

        // Generate summary for LLM
        let summary = generateSummary(chartType: chartType, title: title, dataPoints: dataPoints)

        // Return with _display envelope
        return [
            "_display": [
                "type": "chart",
                "chartType": chartType.rawValue,
                "title": title as Any,
                "data": dataPoints.map { point in
                    var dict: [String: Any] = [
                        "label": point.label,
                        "value": point.value
                    ]
                    if let color = point.color {
                        dict["color"] = color
                    }
                    return dict
                },
                "xAxisLabel": xAxisLabel as Any,
                "yAxisLabel": yAxisLabel as Any
            ],
            "summary": summary
        ]
    }

    private func generateSummary(
        chartType: ChartType,
        title: String?,
        dataPoints: [ChartDataPoint]
    ) -> String {
        let chartName = chartType == .bar ? "bar chart" : "line chart"

        if let title {
            return "Displayed \(chartName): \(title) (\(dataPoints.count) data points)"
        }
        return "Displayed \(chartName) with \(dataPoints.count) data points"
    }
}
