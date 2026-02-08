import Foundation
import simd

// MARK: - Line Layout Cache

/// LineManager provides O(1) access to line layout information during rendering.
/// It caches the y-offset and height of every line, enabling efficient visible line range queries.
///
/// Usage:
/// 1. Call `rebuild(lineCount:lineHeight:)` when diff changes or line height changes
/// 2. Call `visibleLineRange(viewportTop:viewportBottom:)` to get visible line indices
/// 3. Access individual line layouts via `lineY(_:)` for O(1) position lookup
@MainActor
final class LineManager {

    // MARK: - Layout Data

    /// Cached y-offset for each line (cumulative)
    /// lineOffsets[i] = y position of line i's top edge
    private var lineOffsets: [Float] = []

    /// Cached line height (uniform for monospaced fonts)
    private(set) var lineHeight: Float = 20.0

    /// Total number of lines
    private(set) var lineCount: Int = 0

    /// Total content height (for scroll bounds)
    var totalHeight: Float {
        return Float(lineCount) * lineHeight
    }

    // MARK: - Initialization

    init() {}

    // MARK: - Layout Building

    /// Rebuild the layout cache for a new line count and height.
    /// Call this when the diff result changes or font size changes.
    ///
    /// - Parameters:
    ///   - lineCount: Total number of visual lines
    ///   - lineHeight: Height of each line in points
    func rebuild(lineCount: Int, lineHeight: Float) {
        self.lineCount = lineCount
        self.lineHeight = lineHeight

        // Pre-compute all line offsets for O(1) access
        // For uniform line heights, this is simple multiplication
        // but caching avoids repeated Float calculations during render
        lineOffsets = [Float](repeating: 0, count: lineCount)

        for index in 0..<lineCount {
            lineOffsets[index] = Float(index) * lineHeight
        }
    }

    // MARK: - Visible Range Queries

    /// Returns the range of line indices that are visible within the given viewport.
    /// Uses binary search for O(log n) lookup, though for uniform heights this is O(1).
    ///
    /// - Parameters:
    ///   - viewportTop: Top edge of visible area (scroll offset)
    ///   - viewportBottom: Bottom edge of visible area
    ///   - buffer: Number of extra lines to include as buffer for smooth scrolling
    /// - Returns: Range of visible line indices (clamped to valid bounds)
    func visibleLineRange(viewportTop: Float, viewportBottom: Float, buffer: Int = 50) -> Range<Int> {
        guard lineCount > 0 else { return 0..<0 }

        // For uniform line heights, simple division gives us the line index
        let firstVisible = Int(floor(viewportTop / lineHeight))
        let lastVisible = Int(ceil(viewportBottom / lineHeight))

        // Add buffer for smooth scrolling
        let bufferedFirst = max(0, firstVisible - buffer)
        let bufferedLast = min(lineCount, lastVisible + buffer)

        return bufferedFirst..<bufferedLast
    }

    /// Returns the y-offset for a given line index.
    /// O(1) lookup from cached values.
    ///
    /// - Parameter lineIndex: The visual line index
    /// - Returns: Y offset in points, or 0 if out of bounds
    @inline(__always)
    func lineY(_ lineIndex: Int) -> Float {
        guard lineIndex >= 0 && lineIndex < lineOffsets.count else {
            return 0
        }
        return lineOffsets[lineIndex]
    }

    /// Returns the line index at a given y-coordinate.
    /// O(1) lookup for uniform heights.
    ///
    /// - Parameter yPosition: Y coordinate in points
    /// - Returns: Line index, clamped to valid range
    @inline(__always)
    func lineIndex(at yPosition: Float) -> Int {
        let index = Int(floor(yPosition / lineHeight))
        return max(0, min(lineCount - 1, index))
    }

    // MARK: - GPU Data Export

    /// Exports line layout data for GPU upload (compute shader culling).
    /// Returns a buffer-friendly array of line bounds.
    ///
    /// - Returns: Array of (yMin, yMax) pairs for each line
    func exportForGPU() -> [SIMD2<Float>] {
        return lineOffsets.map { yOffset in
            SIMD2<Float>(yOffset, yOffset + lineHeight)
        }
    }
}

// MARK: - Visible Line Info

/// Compact struct for passing visible line information to shaders
struct VisibleLineInfo {
    let lineIndex: Int32
    let yOffset: Float
    let lineHeight: Float
    let padding: Float  // For alignment

    init(lineIndex: Int, yOffset: Float, lineHeight: Float) {
        self.lineIndex = Int32(lineIndex)
        self.yOffset = yOffset
        self.lineHeight = lineHeight
        self.padding = 0
    }
}
