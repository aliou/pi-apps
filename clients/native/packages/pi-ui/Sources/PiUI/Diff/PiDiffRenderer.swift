import Foundation
import Metal
import MetalKit

public struct VertexIn: Sendable {
    let position: SIMD2<Float>
}

public struct Uniforms: Sendable {
    var viewportSize: SIMD2<Float>
    var cameraX: Float
    var cameraY: Float
    var scale: Float  // Retina scale factor for proper anti-aliasing
    var padding: Float = 0  // Padding to align struct to 16 bytes
}

public struct InstanceData: Sendable {
    var origin: SIMD2<Float>
    var size: SIMD2<Float>
    var uvMin: SIMD2<Float>
    var uvMax: SIMD2<Float>
    var color: SIMD4<Float>
}

public struct RectInstance: Sendable {
    var origin: SIMD2<Float>
    var size: SIMD2<Float>
    var color: SIMD4<Float>
    var cornerRadius: Float = 0         // Corner radius for rounded rects
    var borderWidth: Float = 0          // Border width (0 = no border)
    var borderColor: SIMD4<Float> = [0, 0, 0, 0]  // Border color
    var padding: Float = 0              // Padding for memory alignment
}

@MainActor
public class PiDiffRenderer: NSObject, MTKViewDelegate {
    let device: MTLDevice
    let commandQueue: MTLCommandQueue
    let fontAtlasManager: FontAtlasManager

    // Pipelines
    var textPipelineState: MTLRenderPipelineState!
    var rectPipelineState: MTLRenderPipelineState!

    // MARK: - Buffer Sizing Constants
    /// Page size for buffer alignment (4KB is typical VM page size)
    static let pageSize = 4096
    /// Headroom multiplier to avoid frequent reallocation (1.5x)
    static let bufferHeadroomMultiplier: Double = 1.5
    /// Shrink threshold - only recreate if buffer is more than 2x needed size (50% utilization)
    static let shrinkThreshold = 2

    // Data Buffers
    var quadBuffer: MTLBuffer!
    var instanceBuffer: MTLBuffer?
    var boldInstanceBuffer: MTLBuffer?  // Bold text instances (for header filenames)
    var rectInstanceBuffer: MTLBuffer?

    var instanceCount: Int = 0
    var boldInstanceCount: Int = 0
    var rectCount: Int = 0

    var uniforms = Uniforms(viewportSize: [100, 100], cameraX: 0, cameraY: 0, scale: 1.0)

    // Track last drawable size to avoid redundant scale updates
    private var lastDrawableSize: CGSize = .zero
    var lastScale: CGFloat = 0

    init?(device: MTLDevice, commandQueue: MTLCommandQueue, fontAtlasManager: FontAtlasManager) {
        self.device = device
        self.commandQueue = commandQueue
        self.fontAtlasManager = fontAtlasManager
        super.init()
        buildPipelines()
        buildResources()
    }

    private func buildPipelines() {
        // Try default library first (Xcode compiles .metal natively).
        // Fall back to runtime compilation for Xcode Previews where the
        // app bundle's default metallib isn't available.
        guard let library = device.makeDefaultLibrary()
            ?? (try? device.makeLibrary(
                source: PiDiffRenderer.shaderSource,
                options: nil
            ))
        else { return }

        // Text Pipeline
        let textDesc = MTLRenderPipelineDescriptor()
        textDesc.label = "Text Pipeline"
        textDesc.vertexFunction = library.makeFunction(name: "text_vertex")
        textDesc.fragmentFunction = library.makeFunction(name: "text_fragment")
        textDesc.colorAttachments[0].pixelFormat = .bgra8Unorm
        textDesc.colorAttachments[0].isBlendingEnabled = true
        textDesc.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
        textDesc.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha

        // Vertex Layout
        let vertexDesc = MTLVertexDescriptor()
        vertexDesc.attributes[0].format = .float2
        vertexDesc.attributes[0].offset = 0
        vertexDesc.attributes[0].bufferIndex = 0
        vertexDesc.layouts[0].stride = MemoryLayout<VertexIn>.stride
        textDesc.vertexDescriptor = vertexDesc

        do {
            self.textPipelineState = try device.makeRenderPipelineState(descriptor: textDesc)
        } catch {
            print("Failed to create text pipeline: \(error)")
        }

        // Rect Pipeline
        let rectDesc = MTLRenderPipelineDescriptor()
        rectDesc.label = "Rect Pipeline"
        rectDesc.vertexFunction = library.makeFunction(name: "rect_vertex")
        rectDesc.fragmentFunction = library.makeFunction(name: "rect_fragment")
        rectDesc.colorAttachments[0].pixelFormat = .bgra8Unorm
        rectDesc.colorAttachments[0].isBlendingEnabled = true
        rectDesc.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
        rectDesc.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        rectDesc.vertexDescriptor = vertexDesc

        do {
            self.rectPipelineState = try device.makeRenderPipelineState(descriptor: rectDesc)
        } catch {
            print("Failed to create rect pipeline: \(error)")
        }
    }

    private func buildResources() {
        let vertices: [VertexIn] = [
            VertexIn(position: [0, 0]),
            VertexIn(position: [1, 0]),
            VertexIn(position: [0, 1]),

            VertexIn(position: [1, 0]),
            VertexIn(position: [0, 1]),
            VertexIn(position: [1, 1])
        ]

        // Phase 5: Use storageModeShared for UMA optimization
        // On Apple Silicon, this allows CPU writes and GPU reads without explicit blits
        // The Unified Memory Architecture (UMA) means CPU and GPU share the same memory pool
        quadBuffer = device.makeBuffer(
            bytes: vertices,
            length: vertices.count * MemoryLayout<VertexIn>.stride,
            options: .storageModeShared
        )
        quadBuffer?.label = "PiDiffRenderer.QuadBuffer"
    }

    /// Calculate optimal buffer size with headroom and page alignment.
    /// This reduces buffer recreation frequency by:
    /// 1. Adding 1.5x headroom so small size increases don't trigger reallocation
    /// 2. Aligning to page boundaries for efficient memory allocation
    static func optimalBufferSize(for dataSize: Int) -> Int {
        guard dataSize > 0 else { return 0 }
        // Add headroom to avoid frequent reallocation
        let withHeadroom = Int(Double(dataSize) * bufferHeadroomMultiplier)
        // Round up to next page boundary
        let pages = (withHeadroom + pageSize - 1) / pageSize
        return pages * pageSize
    }

    func updateInstances(
        _ instances: [InstanceData],
        boldInstances: [InstanceData] = [],
        rects: [RectInstance]
    ) {
        self.instanceCount = instances.count
        self.boldInstanceCount = boldInstances.count
        self.rectCount = rects.count

        BufferUpdateHelper.updateInstanceBuffer(
            for: self,
            instances: instances
        )
        BufferUpdateHelper.updateBoldInstanceBuffer(
            for: self,
            boldInstances: boldInstances
        )
        BufferUpdateHelper.updateRectBuffer(
            for: self,
            rects: rects
        )
    }

    func setScroll(xPosition: Float, yPosition: Float) {
        uniforms.cameraX = xPosition
        uniforms.cameraY = yPosition
    }

    public func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        // Only update font atlas if scale actually changed
        // This avoids expensive atlas rebuilds during resize
        #if os(macOS)
        let scale = view.layer?.contentsScale ?? 1.0
        #else
        let scale = view.contentScaleFactor
        #endif
        if scale != lastScale {
            lastScale = scale
            fontAtlasManager.updateScale(scale)
        }
        lastDrawableSize = size
    }

    public func draw(in view: MTKView) {
        guard let descriptor = view.currentRenderPassDescriptor,
              let drawable = view.currentDrawable,
              let commandBuffer = commandQueue.makeCommandBuffer(),
              let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: descriptor),
              let textPipeline = textPipelineState,
              let rectPipeline = rectPipelineState,
              let quad = quadBuffer else { return }

        let context = RenderContext(
            renderer: self,
            view: view,
            encoder: encoder,
            drawable: drawable,
            commandBuffer: commandBuffer,
            textPipeline: textPipeline,
            rectPipeline: rectPipeline,
            quad: quad
        )
        RenderingHelper.drawFrame(context)
    }

    // MARK: - Memory Management

    /// Explicitly release all GPU resources to free memory.
    /// Call this when the view is being removed from the hierarchy.
    func releaseBuffers() {
        instanceBuffer = nil
        boldInstanceBuffer = nil
        rectInstanceBuffer = nil
        quadBuffer = nil
        textPipelineState = nil
        rectPipelineState = nil
        instanceCount = 0
        boldInstanceCount = 0
        rectCount = 0
    }

    // ARC handles cleanup of all Metal resources

    // MARK: - Embedded Shader Source (fallback for Xcode Previews)

    // swiftlint:disable line_length
    private static let shaderSource = """
#include <metal_stdlib>
using namespace metal;
struct VertexIn { float2 position [[attribute(0)]]; };
struct InstanceData { float2 origin; float2 size; float2 uvMin; float2 uvMax; float4 color; };
struct Uniforms { float2 viewportSize; float cameraX; float cameraY; float scale; float padding; };
struct VertexOut { float4 position [[position]]; float2 uv; float4 color; };
vertex VertexOut text_vertex(const VertexIn vertexIn [[stage_in]], const device InstanceData* instances [[buffer(1)]], constant Uniforms& uniforms [[buffer(2)]], uint instanceID [[instance_id]]) {
    VertexOut out; InstanceData inst = instances[instanceID];
    float2 pp = inst.origin + (vertexIn.position * inst.size); pp.x -= uniforms.cameraX; pp.y -= uniforms.cameraY;
    out.position = float4((pp.x / uniforms.viewportSize.x) * 2.0 - 1.0, 1.0 - (pp.y / uniforms.viewportSize.y) * 2.0, 0.0, 1.0);
    out.uv = mix(inst.uvMin, inst.uvMax, vertexIn.position); out.color = inst.color; return out; }
fragment float4 text_fragment(VertexOut in [[stage_in]], texture2d<float> atlas [[texture(0)]]) {
    constexpr sampler s(coord::normalized, address::clamp_to_edge, filter::nearest);
    return float4(in.color.rgb, in.color.a * atlas.sample(s, in.uv).r); }
struct RectInstance { float2 origin; float2 size; float4 color; float cornerRadius; float borderWidth; float4 borderColor; float padding; };
struct RectVertexOut { float4 position [[position]]; float2 localPos; float2 size; float4 color; float cornerRadius; float borderWidth; float4 borderColor; float scale; };
float sdRoundedRect(float2 p, float2 halfSize, float radius) { float2 q = abs(p) - halfSize + radius; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius; }
vertex RectVertexOut rect_vertex(const VertexIn vertexIn [[stage_in]], const device RectInstance* instances [[buffer(1)]], constant Uniforms& uniforms [[buffer(2)]], uint instanceID [[instance_id]]) {
    RectVertexOut out; RectInstance inst = instances[instanceID];
    float2 pp = inst.origin + (vertexIn.position * inst.size); pp.x -= uniforms.cameraX; pp.y -= uniforms.cameraY;
    out.position = float4((pp.x / uniforms.viewportSize.x) * 2.0 - 1.0, 1.0 - (pp.y / uniforms.viewportSize.y) * 2.0, 0.0, 1.0);
    out.localPos = vertexIn.position * inst.size; out.size = inst.size; out.color = inst.color;
    out.cornerRadius = inst.cornerRadius; out.borderWidth = inst.borderWidth; out.borderColor = inst.borderColor; out.scale = uniforms.scale; return out; }
fragment float4 rect_fragment(RectVertexOut in [[stage_in]]) {
    if (in.cornerRadius <= 0.0 && in.borderWidth <= 0.0) { return in.color; }
    float2 center = in.size * 0.5; float2 p = in.localPos - center; float radius = min(in.cornerRadius, min(center.x, center.y));
    float d = sdRoundedRect(p, center, radius); float aa = 0.5 / in.scale;
    if (in.borderWidth > 0.0) { if (d > aa) { discard_fragment(); } float innerD = d + in.borderWidth;
        if (innerD < -aa) { return in.color; } else if (d < -aa) { return in.borderColor; }
        else { float alpha = 1.0 - smoothstep(-aa, aa, d); return float4(in.borderColor.rgb, in.borderColor.a * alpha); }
    } else { if (d > aa) { discard_fragment(); } float alpha = 1.0 - smoothstep(-aa, aa, d); return float4(in.color.rgb, in.color.a * alpha); } }
"""
    // swiftlint:enable line_length
}
