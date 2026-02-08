import MetalKit

/// Manages shared Metal resources with lazy loading.
@MainActor
public final class SharedMetalResources {
    public static let shared = SharedMetalResources()

    private var _device: MTLDevice?
    private var _commandQueue: MTLCommandQueue?
    private var _fontAtlasManager: FontAtlasManager?

    private init() {}

    public var device: MTLDevice? {
        if _device == nil {
            _device = MTLCreateSystemDefaultDevice()
        }
        return _device
    }

    public var commandQueue: MTLCommandQueue? {
        if _commandQueue == nil, let device = device {
            _commandQueue = device.makeCommandQueue()
        }
        return _commandQueue
    }

    public var fontAtlasManager: FontAtlasManager? {
        if _fontAtlasManager == nil, let device = device {
            _fontAtlasManager = FontAtlasManager(device: device)
        }
        return _fontAtlasManager
    }
}
