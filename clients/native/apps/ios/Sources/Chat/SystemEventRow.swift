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
