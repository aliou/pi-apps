import Foundation
import Metal
import MetalKit

// MARK: - Rendering Context

private struct RenderContext {
    let renderer: PiDiffRenderer
    let view: MTKView
    let encoder: MTLRenderCommandEncoder
    let drawable: CAMetalDrawable
    let commandBuffer: MTLCommandBuffer
    let textPipeline: MTLRenderPipelineState
    let rectPipeline: MTLRenderPipelineState
    let quad: MTLBuffer
}

// MARK: - Rendering Helper Extension

private enum RenderingHelper {
    static func drawFrame(_ context: RenderContext) {
        updateScaleAndViewport(context.renderer, context.view)
        drawBackgrounds(context.renderer, context.encoder, context.rectPipeline, context.quad)
        drawText(context.renderer, context.encoder, context.textPipeline, context.quad)
        drawBoldText(context.renderer, context.encoder, context.textPipeline, context.quad)

        context.encoder.endEncoding()
        presentDrawable(context.drawable, context.commandBuffer, context.view)
    }

    private static func updateScaleAndViewport(
        _ renderer: PiDiffRenderer,
        _ view: MTKView
    ) {
        #if os(macOS)
        let scale = view.layer?.contentsScale ?? 1.0
        #else
        let scale = view.contentScaleFactor
        #endif
        if scale != renderer.lastScale {
            renderer.lastScale = scale
            renderer.fontAtlasManager.updateScale(scale)
        }

        let viewportPointsW = Float(view.drawableSize.width / scale)
        let viewportPointsH = Float(view.drawableSize.height / scale)

        renderer.uniforms.viewportSize = SIMD2<Float>(
            viewportPointsW,
            viewportPointsH
        )
        renderer.uniforms.scale = Float(scale)
    }

    private static func drawBackgrounds(
        _ renderer: PiDiffRenderer,
        _ encoder: MTLRenderCommandEncoder,
        _ rectPipeline: MTLRenderPipelineState,
        _ quad: MTLBuffer
    ) {
        guard renderer.rectCount > 0,
              let buf = renderer.rectInstanceBuffer else { return }
        encoder.setRenderPipelineState(rectPipeline)
        encoder.setVertexBuffer(quad, offset: 0, index: 0)
        encoder.setVertexBuffer(buf, offset: 0, index: 1)
        encoder.setVertexBytes(
            &renderer.uniforms,
            length: MemoryLayout<Uniforms>.size,
            index: 2
        )
        encoder.drawPrimitives(
            type: .triangle,
            vertexStart: 0,
            vertexCount: 6,
            instanceCount: renderer.rectCount
        )
    }

    private static func drawText(
        _ renderer: PiDiffRenderer,
        _ encoder: MTLRenderCommandEncoder,
        _ textPipeline: MTLRenderPipelineState,
        _ quad: MTLBuffer
    ) {
        guard renderer.instanceCount > 0,
              let buf = renderer.instanceBuffer,
              let atlas = renderer.fontAtlasManager.texture else { return }
        encoder.setRenderPipelineState(textPipeline)
        encoder.setVertexBuffer(quad, offset: 0, index: 0)
        encoder.setVertexBuffer(buf, offset: 0, index: 1)
        encoder.setVertexBytes(
            &renderer.uniforms,
            length: MemoryLayout<Uniforms>.size,
            index: 2
        )
        encoder.setFragmentTexture(atlas, index: 0)
        encoder.drawPrimitives(
            type: .triangle,
            vertexStart: 0,
            vertexCount: 6,
            instanceCount: renderer.instanceCount
        )
    }

    private static func drawBoldText(
        _ renderer: PiDiffRenderer,
        _ encoder: MTLRenderCommandEncoder,
        _ textPipeline: MTLRenderPipelineState,
        _ quad: MTLBuffer
    ) {
        guard renderer.boldInstanceCount > 0,
              let buf = renderer.boldInstanceBuffer,
              let boldAtlas = renderer.fontAtlasManager.boldTexture else { return }
        encoder.setRenderPipelineState(textPipeline)
        encoder.setVertexBuffer(quad, offset: 0, index: 0)
        encoder.setVertexBuffer(buf, offset: 0, index: 1)
        encoder.setVertexBytes(
            &renderer.uniforms,
            length: MemoryLayout<Uniforms>.size,
            index: 2
        )
        encoder.setFragmentTexture(boldAtlas, index: 0)
        encoder.drawPrimitives(
            type: .triangle,
            vertexStart: 0,
            vertexCount: 6,
            instanceCount: renderer.boldInstanceCount
        )
    }

    private static func presentDrawable(
        _ drawable: CAMetalDrawable,
        _ commandBuffer: MTLCommandBuffer,
        _ view: MTKView
    ) {
        if let metalLayer = view.layer as? CAMetalLayer,
           metalLayer.presentsWithTransaction {
            commandBuffer.commit()
            commandBuffer.waitUntilScheduled()
            drawable.present()
        } else {
            commandBuffer.present(drawable)
            commandBuffer.commit()
        }
    }
}
