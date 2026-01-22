//
//  RichContent.swift
//  PiUI
//
//  Rich content types for conversation display
//

import Foundation
import PiCore

/// Rich content types for conversation display
public enum RichContentType: Sendable, Equatable {
    case chart(ChartDisplayData)
    case map(MapDisplayData)

    /// Create from DisplayContent
    public init(from displayContent: DisplayContent) {
        switch displayContent {
        case .chart(let data):
            self = .chart(data)
        case .map(let data):
            self = .map(data)
        }
    }
}
