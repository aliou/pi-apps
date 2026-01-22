//
//  RichContentView.swift
//  PiUI
//
//  Renders rich content inline in conversation
//

import SwiftUI
import PiCore

/// Renders rich content inline in conversation
public struct RichContentView: View {
    public let content: RichContentType
    public let summary: String

    public init(content: RichContentType, summary: String) {
        self.content = content
        self.summary = summary
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            contentView

            // Summary text (always shown below rich content)
            Text(summary)
                .font(.caption)
                .foregroundStyle(Theme.textMuted)
        }
        .padding(12)
        .background(Theme.cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private var contentView: some View {
        switch content {
        case .chart(let data):
            ChartView(data: data)

        case .map(let data):
            // Placeholder until Phase 8
            MapPlaceholderView(data: data)
        }
    }
}

// MARK: - Placeholder Views

/// Temporary placeholder for charts until Phase 2
struct ChartPlaceholderView: View {
    let data: ChartDisplayData

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "chart.bar.fill")
                .font(.largeTitle)
                .foregroundStyle(Theme.accent)

            if let title = data.title {
                Text(title)
                    .font(.headline)
            }

            Text("\(data.chartType.rawValue.capitalized) chart with \(data.data.count) data points")
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 150)
        .background(Theme.pageBg)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

/// Temporary placeholder for maps until Phase 8
struct MapPlaceholderView: View {
    let data: MapDisplayData

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "map.fill")
                .font(.largeTitle)
                .foregroundStyle(Theme.accent)

            if let pins = data.pins, !pins.isEmpty {
                Text("\(pins.count) location(s)")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 150)
        .background(Theme.pageBg)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

#if DEBUG
#Preview("Chart Placeholder") {
    RichContentView(
        content: .chart(ChartDisplayData(
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
    .background(Theme.pageBg)
}

#Preview("Map Placeholder") {
    RichContentView(
        content: .map(MapDisplayData(
            pins: [MapPin(coordinate: Coordinate(latitude: 37.7749, longitude: -122.4194), title: "San Francisco")]
        )),
        summary: "Showing 1 location on map"
    )
    .background(Theme.pageBg)
}
#endif
