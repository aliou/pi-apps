import SwiftUI

/// Animated background showing pi digits scrolling in alternating directions.
/// Each row scrolls opposite to the one above it, creating a marquee effect.
struct PiDigitsBackground: View {
    var velocity: Double = 25
    /// When true, rows appear one by one with a staggered fade-in.
    var staggeredReveal: Bool = false

    private static let piDigits: String =
        "14159265358979323846264338327950288419716939937510"
        + "58209749445923078164062862089986280348253421170679"
        + "82148086513282306647093844609550582231725359408128"
        + "48111745028410270193852110555964462294895493038196"
        + "44288109756659334461284756482337867831652712019091"
        + "45648566923460348610454326648213393607260249141273"
        + "72458700660631558817488152092096282925409171536436"
        + "78925903600113305305488204665213841469519415116094"
        + "33057270365759591953092186117381932611793105118548"
        + "07446237996274956735188575272489122793818301194912"
        + "98336733624406566430860213949463952247371907021798"
        + "60943702770539217176293176752384674818467669405132"
        + "00056812714526356082778577134275778960917363717872"
        + "14684409012249534301465495853710507922796892589235"
        + "42019956112129021960864034418159813629774771309960"
        + "51870721134999999837297804995105973173281609631859"
        + "50244594553469083026425223082533446850352619311881"
        + "71010003137838752886587533208381420617177669147303"
        + "59825349042875546873115956286388235378759375195778"
        + "18577805321712268066130019278766111959092164201989"

    private static let rowCount = 24
    private static let charsPerRow = 30

    @State private var visibleRows: Int = 0

    var body: some View {
        GeometryReader { geometry in
            let rowHeight = geometry.size.height / CGFloat(Self.rowCount)
            VStack(spacing: 0) {
                ForEach(0..<Self.rowCount, id: \.self) { row in
                    Marquee(
                        velocity: velocity + Double(row % 5) * 3,
                        reverse: !row.isMultiple(of: 2)
                    ) {
                        Text(Self.rowDigits(for: row))
                            .font(.system(size: 20, weight: .medium, design: .monospaced))
                            .foregroundStyle(.primary.opacity(0.12))
                    }
                    .frame(height: rowHeight)
                    .opacity(staggeredReveal ? (row < visibleRows ? 1 : 0) : 1)
                }
            }
        }
        .clipped()
        .task {
            guard staggeredReveal else { return }
            for row in 0...Self.rowCount {
                try? await Task.sleep(for: .milliseconds(60))
                withAnimation(.easeOut(duration: 0.3)) {
                    visibleRows = row + 1
                }
            }
        }
    }

    private static func rowDigits(for row: Int) -> String {
        let start = (row * charsPerRow) % piDigits.count
        let end = min(start + charsPerRow, piDigits.count)
        let slice = piDigits[
            piDigits.index(piDigits.startIndex, offsetBy: start)
                ..< piDigits.index(piDigits.startIndex, offsetBy: end)
        ]
        return slice.map { String($0) }.joined(separator: "  ")
    }
}

// MARK: - Generic Marquee (based on objc.io S01E374)

/// A continuously scrolling marquee that replicates its content to fill the
/// container and loops seamlessly using `formTruncatingRemainder`.
private struct Marquee<Content: View>: View {
    var velocity: Double = 50
    var reverse: Bool = false
    var spacing: CGFloat = 40
    @ViewBuilder var content: Content

    @State private var startDate = Date.now
    @State private var contentWidth: CGFloat?
    @State private var containerWidth: CGFloat?

    var body: some View {
        TimelineView(.animation) { context in
            HStack(spacing: spacing) {
                // Primary copy (used for measurement).
                HStack(spacing: spacing) {
                    content
                }
                .measureWidth { contentWidth = $0 }

                // Extra copies to fill the container.
                let count = numberOfCopies()
                ForEach(0..<count, id: \.self) { _ in
                    content
                }
            }
            .offset(x: offset(at: context.date))
            .fixedSize()
        }
        .onAppear { startDate = .now }
        .frame(maxWidth: .infinity, alignment: .leading)
        .measureWidth { containerWidth = $0 }
    }

    private func offset(at time: Date) -> CGFloat {
        guard let cps = contentPlusSpacing(), cps > 0 else { return 0 }

        let elapsed = time.timeIntervalSince(startDate) * velocity
        var phase = elapsed.truncatingRemainder(dividingBy: cps)
        if phase < 0 { phase += cps }

        if reverse {
            // Scroll right: offset goes from -cps to 0, then wraps to -cps.
            // Seamless because the next copy slides in from the left.
            return phase - cps
        } else {
            // Scroll left: offset goes from 0 to -cps, then wraps to 0.
            return -phase
        }
    }

    private func contentPlusSpacing() -> Double? {
        guard let contentWidth, contentWidth > 0 else { return nil }
        return contentWidth + spacing
    }

    private func numberOfCopies() -> Int {
        guard let cps = contentPlusSpacing(), cps > 0,
              let containerWidth, containerWidth > 0 else {
            return 1
        }
        // +1 extra copy to cover the gap during reverse scrolling.
        return Int((containerWidth / cps).rounded(.up)) + 1
    }
}

// MARK: - Width measurement helper

private struct WidthPreferenceKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

extension View {
    fileprivate func measureWidth(
        _ onChange: @escaping (CGFloat) -> Void
    ) -> some View {
        background {
            GeometryReader { proxy in
                Color.clear
                    .preference(key: WidthPreferenceKey.self, value: proxy.size.width)
            }
        }
        .onPreferenceChange(WidthPreferenceKey.self, perform: onChange)
    }
}

#Preview {
    @Previewable @State var velocity: Double = 25

    ZStack(alignment: .bottom) {
        PiDigitsBackground(velocity: velocity)
            .ignoresSafeArea()

        VStack {
            Text("Velocity: \(Int(velocity))")
                .font(.caption.monospaced())
            Slider(value: $velocity, in: 5...120, step: 5)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding()
    }
}
