import SwiftUI
import MetalKit

// MARK: - Public API

/// Input for a single diff patch to render.
public struct DiffPatchInput: Sendable {
    public let patch: String
    public let filename: String?
    public let language: String?

    public init(patch: String, filename: String? = nil, language: String? = nil) {
        self.patch = patch
        self.filename = filename
        self.language = language
    }
}

/// GPU-accelerated diff view using Metal.
/// Renders unified diffs with line numbers, colored backgrounds for additions/deletions,
/// and file headers with diff stats.
public struct DiffView: View {
    let patches: [DiffPatchInput]

    public init(patches: [DiffPatchInput]) {
        self.patches = patches
    }

    public var body: some View {
        if SharedMetalResources.shared.device != nil {
            #if os(macOS)
            DiffViewRepresentableMacOS(patches: patches)
                .frame(minHeight: 200)
            #else
            DiffViewRepresentableIOS(patches: patches)
                .frame(minHeight: 200)
            #endif
        } else {
            // Fallback if Metal is unavailable
            Text("Metal not available")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, minHeight: 200)
        }
    }
}

// MARK: - macOS Representable

#if os(macOS)
struct DiffViewRepresentableMacOS: NSViewRepresentable {
    let patches: [DiffPatchInput]

    func makeNSView(context: Context) -> PiDiffMetalView {
        let resources = SharedMetalResources.shared
        guard let device = resources.device,
              let queue = resources.commandQueue,
              let atlas = resources.fontAtlasManager else {
            fatalError("Metal resources unavailable")
        }
        let view = PiDiffMetalView(device: device, commandQueue: queue, fontAtlasManager: atlas)
        view.updateContent(patches: patches)
        return view
    }

    func updateNSView(_ nsView: PiDiffMetalView, context: Context) {
        nsView.updateContent(patches: patches)
    }
}
#endif

// MARK: - iOS Representable

#if os(iOS)
struct DiffViewRepresentableIOS: UIViewRepresentable {
    let patches: [DiffPatchInput]

    func makeUIView(context: Context) -> PiDiffMetalView {
        let resources = SharedMetalResources.shared
        guard let device = resources.device,
              let queue = resources.commandQueue,
              let atlas = resources.fontAtlasManager else {
            fatalError("Metal resources unavailable")
        }
        let view = PiDiffMetalView(device: device, commandQueue: queue, fontAtlasManager: atlas)
        view.setupGestures()
        view.updateContent(patches: patches)
        return view
    }

    func updateUIView(_ uiView: PiDiffMetalView, context: Context) {
        uiView.updateContent(patches: patches)
    }
}
#endif
