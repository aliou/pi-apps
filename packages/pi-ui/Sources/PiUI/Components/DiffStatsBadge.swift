import SwiftUI

/// Inline badge showing "+N -N" with green/red coloring.
public struct DiffStatsBadge: View {
    let added: Int
    let removed: Int

    public init(added: Int, removed: Int) {
        self.added = added
        self.removed = removed
    }

    public var body: some View {
        HStack(spacing: 4) {
            if added > 0 {
                Text("+\(added)")
                    .foregroundStyle(.green)
            }
            if removed > 0 {
                Text("-\(removed)")
                    .foregroundStyle(.red)
            }
        }
        .font(.caption.monospaced())
    }
}

#Preview("Both added and removed") {
    DiffStatsBadge(added: 5, removed: 3)
}

#Preview("Only added") {
    DiffStatsBadge(added: 12, removed: 0)
}

#Preview("Only removed") {
    DiffStatsBadge(added: 0, removed: 8)
}

#Preview("Large numbers") {
    DiffStatsBadge(added: 456, removed: 123)
}
