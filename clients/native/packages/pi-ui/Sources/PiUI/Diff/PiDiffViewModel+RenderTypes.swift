import Foundation
import simd

/// Helper types for rendering diff lines
extension PiDiffViewModel {

    /// Represents a normalized selection range
    internal struct NormalizedSelection {
        let start: TextPosition?
        let end: TextPosition?
    }

    /// Context data passed to rendering functions to reduce parameter counts
    internal struct RenderContext {
        let visualLines: [VisualLine]
        let diffLines: [DiffLine]
        let atlas: FontAtlasManager
        let monoAdvance: Float
        let charColorCache: [Int: [SIMD4<Float>]]
        let normalizedSelStart: TextPosition?
        let normalizedSelEnd: TextPosition?
        let lineManager: LineManager
        let totalContentHeight: Float
    }

    /// Output buffers for rendering
    internal struct RenderOutput {
        var instances: [InstanceData]
        var rects: [RectInstance]

        mutating func addInstance(_ instance: InstanceData) {
            instances.append(instance)
        }

        mutating func addRect(_ rect: RectInstance) {
            rects.append(rect)
        }
    }

    /// Immutable line layout data
    internal struct LineLayout {
        let visualLineIndex: Int
        let line: DiffLine
        let currentY: Float
        let effectiveLineHeight: Float
    }

    /// Immutable file header parameters
    internal struct FileHeaderLayout {
        let line: DiffLine
        let currentY: Float
        let effectiveLineHeight: Float
    }
}
