//
//  DisplayContent.swift
//  PiCore
//
//  Codable types for rich content display in native tool results
//

import Foundation

/// Wrapper for the _display field in native tool results
public struct DisplayEnvelope: Codable, Sendable {
    public let display: DisplayContent?
    public let summary: String

    enum CodingKeys: String, CodingKey {
        case display = "_display"
        case summary
    }

    public init(display: DisplayContent?, summary: String) {
        self.display = display
        self.summary = summary
    }
}

/// Types of rich content that can be displayed inline
public enum DisplayContent: Codable, Sendable, Equatable {
    case chart(ChartDisplayData)
    case map(MapDisplayData)

    enum CodingKeys: String, CodingKey {
        case type
    }

    enum ContentType: String, Codable {
        case chart
        case map
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(ContentType.self, forKey: .type)

        switch type {
        case .chart:
            self = .chart(try ChartDisplayData(from: decoder))
        case .map:
            self = .map(try MapDisplayData(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .chart(let data):
            try data.encode(to: encoder)
        case .map(let data):
            try data.encode(to: encoder)
        }
    }
}

// MARK: - Chart Types

public struct ChartDisplayData: Codable, Sendable, Equatable {
    public let type: String  // Always "chart"
    public let chartType: ChartType
    public let title: String?
    public let data: [ChartDataPoint]
    public let xAxisLabel: String?
    public let yAxisLabel: String?

    public init(
        chartType: ChartType,
        title: String? = nil,
        data: [ChartDataPoint],
        xAxisLabel: String? = nil,
        yAxisLabel: String? = nil
    ) {
        self.type = "chart"
        self.chartType = chartType
        self.title = title
        self.data = data
        self.xAxisLabel = xAxisLabel
        self.yAxisLabel = yAxisLabel
    }
}

public enum ChartType: String, Codable, Sendable {
    case bar
    case line
    case pie
    case area
}

public struct ChartDataPoint: Codable, Sendable, Equatable {
    public let label: String
    public let value: Double
    public let color: String?  // Optional hex color like "#FF5733"

    public init(label: String, value: Double, color: String? = nil) {
        self.label = label
        self.value = value
        self.color = color
    }
}

// MARK: - Map Types (placeholder for Phase 8)

public struct MapDisplayData: Codable, Sendable, Equatable {
    public let type: String  // Always "map"
    public let center: Coordinate?
    public let pins: [MapPin]?
    public let zoom: Double?

    public init(
        center: Coordinate? = nil,
        pins: [MapPin]? = nil,
        zoom: Double? = nil
    ) {
        self.type = "map"
        self.center = center
        self.pins = pins
        self.zoom = zoom
    }
}

public struct Coordinate: Codable, Sendable, Equatable {
    public let latitude: Double
    public let longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

public struct MapPin: Codable, Sendable, Equatable {
    public let coordinate: Coordinate
    public let title: String?
    public let subtitle: String?

    public init(coordinate: Coordinate, title: String? = nil, subtitle: String? = nil) {
        self.coordinate = coordinate
        self.title = title
        self.subtitle = subtitle
    }
}
