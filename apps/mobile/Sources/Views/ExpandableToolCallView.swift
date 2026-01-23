//
//  ExpandableToolCallView.swift
//  Pi
//
//  Expandable tool call view with inline chart support
//

import SwiftUI
import PiCore
import PiUI

// TODO: Harmonize this component with macOS ToolCallItemView (apps/desktop/Sources/Views/SessionDetailView.swift)
struct ExpandableToolCallView: View {
    let name: String
    let args: String?
    let output: String?
    let status: ToolCallStatus

    @State private var isExpanded: Bool

    /// Parsed chart data from output, if any
    private var chartData: ChartDisplayData? {
        guard let output else { return nil }
        return Self.parseChartFromOutput(output)
    }

    /// Whether this is a display_chart tool
    private var isChartTool: Bool {
        name == "display_chart"
    }

    init(name: String, args: String?, output: String?, status: ToolCallStatus) {
        self.name = name
        self.args = args
        self.output = output
        self.status = status
        // Charts expanded by default, others collapsed
        self._isExpanded = State(initialValue: name == "display_chart")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header (always visible, tappable)
            // Using contentShape for full-row tap target
            ToolCallHeader(
                toolName: name,
                args: args,
                status: status,
                showChevron: hasExpandableContent,
                isExpanded: isExpanded
            )
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
            .onTapGesture {
                guard hasExpandableContent else { return }
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            }

            // Expanded content
            if isExpanded && hasExpandableContent {
                expandedContent
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
            }
        }
        .background(Theme.toolStatusBg(status))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 16)
    }

    private var hasExpandableContent: Bool {
        // Show chevron while running (output coming) or when we have content
        status == .running || chartData != nil || (output != nil && !output!.isEmpty)
    }

    @ViewBuilder
    private var expandedContent: some View {
        if let chart = chartData {
            // Render chart inline with title shown above chart (not in header)
            VStack(alignment: .leading, spacing: 8) {
                Divider()
                    .padding(.bottom, 4)

                // Show chart title here since header just says "display_chart"
                if let title = chart.title {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.text)
                }

                // Chart without title to avoid duplication
                let chartNoTitle = ChartDisplayData(
                    chartType: chart.chartType,
                    title: nil,
                    data: chart.data,
                    xAxisLabel: chart.xAxisLabel,
                    yAxisLabel: chart.yAxisLabel
                )
                ChartView(data: chartNoTitle)
                    .frame(height: 200)
            }
        } else if let output, !output.isEmpty {
            // Render output (truncated for inline view - full view coming later)
            VStack(alignment: .leading, spacing: 8) {
                Divider()
                    .padding(.bottom, 4)

                ScrollView(.horizontal, showsIndicators: false) {
                    Text(Self.formatOutput(output))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(Theme.muted)
                        .textSelection(.enabled)
                }
                .frame(maxHeight: 150)
            }
        } else if status == .running {
            // Show loading indicator while tool is running
            VStack(alignment: .leading, spacing: 8) {
                Divider()
                    .padding(.bottom, 4)

                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Running...")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(Theme.muted)
                }
            }
        }
    }

    // MARK: - Parsing Helpers

    /// Parse chart data from tool output JSON
    static func parseChartFromOutput(_ output: String) -> ChartDisplayData? {
        guard let data = output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let display = json["_display"] as? [String: Any],
              let type = display["type"] as? String,
              type == "chart",
              let chartTypeString = display["chartType"] as? String,
              let chartType = ChartType(rawValue: chartTypeString),
              let dataArray = display["data"] as? [[String: Any]] else {
            return nil
        }

        let dataPoints: [ChartDataPoint] = dataArray.compactMap { item in
            guard let label = item["label"] as? String else { return nil }
            let value: Double
            if let doubleValue = item["value"] as? Double {
                value = doubleValue
            } else if let intValue = item["value"] as? Int {
                value = Double(intValue)
            } else {
                return nil
            }
            let color = item["color"] as? String
            return ChartDataPoint(label: label, value: value, color: color)
        }

        guard !dataPoints.isEmpty else { return nil }

        return ChartDisplayData(
            chartType: chartType,
            title: display["title"] as? String,
            data: dataPoints,
            xAxisLabel: display["xAxisLabel"] as? String,
            yAxisLabel: display["yAxisLabel"] as? String
        )
    }

    /// Format output for display (pretty print JSON)
    /// Truncated for inline view - will add navigation to full view later
    static func formatOutput(_ output: String) -> String {
        // Try to pretty print JSON
        if let data = output.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data),
           let pretty = try? JSONSerialization.data(withJSONObject: json, options: .prettyPrinted),
           let prettyString = String(data: pretty, encoding: .utf8) {
            return prettyString
        }
        return output
    }
}

// MARK: - Previews

#Preview("Chart Tool - Expanded") {
    let chartOutput = """
    {"_display":{"type":"chart","chartType":"bar","title":"Running Distances","data":[{"label":"Mon","value":5.2},{"label":"Tue","value":3.8},{"label":"Wed","value":6.1}]},"summary":"Chart displayed"}
    """

    VStack(spacing: 16) {
        ExpandableToolCallView(
            name: "display_chart",
            args: nil,
            output: chartOutput,
            status: .success
        )
    }
    .padding()
    .background(Theme.pageBg)
}

#Preview("Regular Tool - Collapsed") {
    let output = """
    {"workouts":[{"type":"running","dateTime":"Friday, 2026-01-17 at 07:30","durationMinutes":45}],"count":1}
    """

    VStack(spacing: 16) {
        ExpandableToolCallView(
            name: "get_workouts",
            args: "{\"workoutType\": \"running\"}",
            output: output,
            status: .success
        )
    }
    .padding()
    .background(Theme.pageBg)
}

#Preview("Tool Running") {
    ExpandableToolCallView(
        name: "bash",
        args: "{\"command\": \"npm run build\"}",
        output: nil,
        status: .running
    )
    .padding()
    .background(Theme.pageBg)
}
