import MetalKit
import SwiftUI

/// Cross-platform MTKView subclass for rendering diffs with Metal.
@MainActor
class PiDiffMetalView: MTKView {
    var renderer: PiDiffRenderer?
    var viewModel: PiDiffViewModel?
    private var scrollOffsetY: Float = 0

    init(device: MTLDevice, commandQueue: MTLCommandQueue, fontAtlasManager: FontAtlasManager) {
        super.init(frame: .zero, device: device)
        self.colorPixelFormat = .bgra8Unorm
        self.clearColor = MTLClearColor(
            red: Double(DiffColors.background.simd4.x),
            green: Double(DiffColors.background.simd4.y),
            blue: Double(DiffColors.background.simd4.z),
            alpha: 1.0
        )
        self.renderer = PiDiffRenderer(device: device, commandQueue: commandQueue, fontAtlasManager: fontAtlasManager)
        self.delegate = renderer
        self.isPaused = true
        self.enableSetNeedsDisplay = true
    }

    @available(*, unavailable)
    required init(coder: NSCoder) { fatalError() }

    func updateContent(patches: [DiffPatchInput]) {
        let diffResult = DiffParser.fromPatches(patches.map {
            (patch: $0.patch, language: $0.language, filename: $0.filename)
        })
        if viewModel == nil {
            viewModel = PiDiffViewModel()
        }
        viewModel?.setDiffResult(diffResult)
        requestRedraw()
    }

    private func requestRedraw() {
        guard let viewModel = viewModel, let renderer = renderer else { return }

        #if os(macOS)
        let scale = layer?.contentsScale ?? 1.0
        #else
        let scale = contentScaleFactor
        #endif
        let viewportW = Float(bounds.width)
        let viewportH = Float(bounds.height)
        guard viewportW > 0 && viewportH > 0 else { return }

        viewModel.setViewport(height: viewportH, scrollY: scrollOffsetY)
        viewModel.update(renderer: renderer)
        renderer.setScroll(x: 0, y: scrollOffsetY)
        renderer.uniforms.viewportSize = SIMD2<Float>(viewportW, viewportH)
        renderer.uniforms.scale = Float(scale)

        #if os(macOS)
        setNeedsDisplay(bounds)
        #else
        setNeedsDisplay()
        #endif
    }

    // MARK: - Platform-specific scroll handling

    #if os(macOS)
    override func scrollWheel(with event: NSEvent) {
        let delta = Float(event.scrollingDeltaY)
        let maxScroll = max(0, (viewModel?.totalContentHeight ?? 0) - Float(bounds.height))
        scrollOffsetY = max(0, min(maxScroll, scrollOffsetY - delta))
        requestRedraw()
    }

    override func mouseDown(with event: NSEvent) {
        guard let viewModel = viewModel, let renderer = renderer else { return }
        let loc = convert(event.locationInWindow, from: nil)
        let flippedY = Float(bounds.height - loc.y)
        if let pos = viewModel.screenToTextPosition(
            screenX: Float(loc.x), screenY: flippedY,
            scrollY: scrollOffsetY, monoAdvance: renderer.fontAtlasManager.monoAdvance
        ) {
            viewModel.setSelection(start: pos, end: pos)
            requestRedraw()
        }
    }

    override func mouseDragged(with event: NSEvent) {
        guard let viewModel = viewModel, let renderer = renderer else { return }
        let loc = convert(event.locationInWindow, from: nil)
        let flippedY = Float(bounds.height - loc.y)
        if let pos = viewModel.screenToTextPosition(
            screenX: Float(loc.x), screenY: flippedY,
            scrollY: scrollOffsetY, monoAdvance: renderer.fontAtlasManager.monoAdvance
        ) {
            viewModel.setSelection(start: viewModel.selectionStart, end: pos)
            requestRedraw()
        }
    }

    override func keyDown(with event: NSEvent) {
        // Cmd+C to copy selection
        if event.modifierFlags.contains(.command) && event.charactersIgnoringModifiers == "c" {
            if let text = viewModel?.getSelectedText() {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(text, forType: .string)
            }
        } else {
            super.keyDown(with: event)
        }
    }

    override var acceptsFirstResponder: Bool { true }
    #else
    // iOS: read-only scroll via pan gesture
    private var panStartOffset: Float = 0

    func setupGestures() {
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        addGestureRecognizer(pan)
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        switch gesture.state {
        case .began:
            panStartOffset = scrollOffsetY
        case .changed:
            let translation = gesture.translation(in: self)
            let maxScroll = max(0, (viewModel?.totalContentHeight ?? 0) - Float(bounds.height))
            scrollOffsetY = max(0, min(maxScroll, panStartOffset - Float(translation.y)))
            requestRedraw()
        default:
            break
        }
    }
    #endif

    #if os(macOS)
    override func layout() {
        super.layout()
        requestRedraw()
    }
    #else
    override func layoutSubviews() {
        super.layoutSubviews()
        requestRedraw()
    }
    #endif
}
