import SwiftUI
import PiCore

struct SystemEventRow: View {
    let item: Client.SystemItem

    var body: some View {
        HStack {
            Spacer()
            Text(item.text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(.quaternary, in: Capsule())
            Spacer()
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    SystemEventRow(
        item: Client.SystemItem(
            id: "s1",
            text: "Retrying (1/3): rate limited",
            timestamp: "2025-01-01T00:00:00Z"
        )
    )
    .padding()
}
