//
//  ChartView.swift
//  PiUI
//
//  Renders charts using Swift Charts
//

import SwiftUI
import Charts
import PiCore

/// Renders a chart using Swift Charts framework
public struct ChartView: View {
    public let data: ChartDisplayData

    public init(data: ChartDisplayData) {
        self.data = data
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Title
            if let title = data.title {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Theme.text)
            }

            // Chart
            chartContent
                .frame(height: 200)

            // Legend (only for distinct color categories, not per-item colors)
            if hasLegendColors {
                legendView
            }
        }
    }

    @ViewBuilder
    private var chartContent: some View {
        switch data.chartType {
        case .bar:
            barChart
        case .line:
            lineChart
        case .pie, .area:
            // Future: implement these
            unsupportedChart
        }
    }

    private var barChart: some View {
        Chart(data.data, id: \.label) { point in
            BarMark(
                x: .value(data.xAxisLabel ?? "Category", point.label),
                y: .value(data.yAxisLabel ?? "Value", point.value)
            )
            .foregroundStyle(color(for: point))
            .cornerRadius(4)
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: min(data.data.count, 6))) { _ in
                AxisValueLabel(orientation: .verticalReversed)
                    .font(.caption2)
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .chartYAxis {
            AxisMarks { _ in
                AxisGridLine()
                    .foregroundStyle(Theme.border)
                AxisValueLabel()
                    .font(.caption2)
                    .foregroundStyle(Theme.textSecondary)
            }
        }
    }

    private var lineChart: some View {
        Chart(data.data, id: \.label) { point in
            LineMark(
                x: .value(data.xAxisLabel ?? "Category", point.label),
                y: .value(data.yAxisLabel ?? "Value", point.value)
            )
            .foregroundStyle(Theme.accent)
            .lineStyle(StrokeStyle(lineWidth: 2))

            PointMark(
                x: .value(data.xAxisLabel ?? "Category", point.label),
                y: .value(data.yAxisLabel ?? "Value", point.value)
            )
            .foregroundStyle(color(for: point))
            .symbolSize(40)
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: min(data.data.count, 6))) { _ in
                AxisValueLabel(orientation: .verticalReversed)
                    .font(.caption2)
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .chartYAxis {
            AxisMarks { _ in
                AxisGridLine()
                    .foregroundStyle(Theme.border)
                AxisValueLabel()
                    .font(.caption2)
                    .foregroundStyle(Theme.textSecondary)
            }
        }
    }

    private var unsupportedChart: some View {
        VStack {
            Image(systemName: "chart.pie.fill")
                .font(.largeTitle)
                .foregroundStyle(Theme.textMuted)
            Text("Chart type '\(data.chartType.rawValue)' coming soon")
                .font(.caption)
                .foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }

    // MARK: - Colors

    /// Only show legend when there are distinct color categories (not one color per data point)
    private var hasLegendColors: Bool {
        let colors = Set(data.data.compactMap { $0.color })
        // Show legend only if there are 2+ distinct colors AND fewer colors than data points
        // (meaning colors represent categories, not individual items)
        return colors.count >= 2 && colors.count < data.data.count
    }

    private func color(for point: ChartDataPoint) -> Color {
        if let hexColor = point.color {
            return Color(hex: hexColor) ?? Theme.accent
        }
        return Theme.accent
    }

    @ViewBuilder
    private var legendView: some View {
        let coloredPoints = data.data.filter { $0.color != nil }
        if !coloredPoints.isEmpty {
            FlowLayout(spacing: 8) {
                ForEach(coloredPoints, id: \.label) { point in
                    HStack(spacing: 4) {
                        Circle()
                            .fill(color(for: point))
                            .frame(width: 8, height: 8)
                        Text(point.label)
                            .font(.caption2)
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
            }
        }
    }
}

// MARK: - Color Extension

extension Color {
    /// Initialize from hex string (e.g., "#FF5733" or "FF5733")
    init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        guard hexSanitized.count == 6 else { return nil }

        var rgb: UInt64 = 0
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else { return nil }

        let red = Double((rgb & 0xFF0000) >> 16) / 255.0
        let green = Double((rgb & 0x00FF00) >> 8) / 255.0
        let blue = Double(rgb & 0x0000FF) / 255.0

        self.init(red: red, green: green, blue: blue)
    }
}

// MARK: - Flow Layout (Simple horizontal wrapping)

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x,
                                       y: bounds.minY + result.positions[index].y),
                         proposal: .unspecified)
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)

            if currentX + size.width > maxWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }

            positions.append(CGPoint(x: currentX, y: currentY))
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }

        let totalHeight = currentY + lineHeight
        return (CGSize(width: maxWidth, height: totalHeight), positions)
    }
}

// MARK: - Previews

#if DEBUG
#Preview("Bar Chart") {
    ChartView(data: ChartDisplayData(
        chartType: .bar,
        title: "Sleep Stages",
        data: [
            ChartDataPoint(label: "REM", value: 90, color: "#5B8DEF"),
            ChartDataPoint(label: "Deep", value: 45, color: "#8B5CF6"),
            ChartDataPoint(label: "Core", value: 180, color: "#10B981")
        ],
        yAxisLabel: "Minutes"
    ))
    .padding()
    .background(Theme.pageBg)
}

#Preview("Line Chart") {
    ChartView(data: ChartDisplayData(
        chartType: .line,
        title: "Weekly Steps",
        data: [
            ChartDataPoint(label: "Mon", value: 8500),
            ChartDataPoint(label: "Tue", value: 10200),
            ChartDataPoint(label: "Wed", value: 7800),
            ChartDataPoint(label: "Thu", value: 9100),
            ChartDataPoint(label: "Fri", value: 11500),
            ChartDataPoint(label: "Sat", value: 6200),
            ChartDataPoint(label: "Sun", value: 4500)
        ],
        xAxisLabel: "Day",
        yAxisLabel: "Steps"
    ))
    .padding()
    .background(Theme.pageBg)
}

#Preview("Simple Bar Chart") {
    ChartView(data: ChartDisplayData(
        chartType: .bar,
        data: [
            ChartDataPoint(label: "A", value: 10),
            ChartDataPoint(label: "B", value: 25),
            ChartDataPoint(label: "C", value: 15)
        ]
    ))
    .padding()
    .background(Theme.pageBg)
}
#endif
