import Foundation
import Metal

// MARK: - Buffer Update Helper Extension

@MainActor enum BufferUpdateHelper {
    static func updateInstanceBuffer(
        for renderer: PiDiffRenderer,
        instances: [InstanceData]
    ) {
        guard renderer.instanceCount > 0 else {
            renderer.instanceBuffer = nil
            return
        }

        let size = renderer.instanceCount * MemoryLayout<InstanceData>.stride
        updateOrCreateBuffer(
            for: renderer,
            buffer: &renderer.instanceBuffer,
            size: size,
            label: "PiDiffRenderer.InstanceBuffer"
        )

        if let buffer = renderer.instanceBuffer {
            copyDataToBuffer(buffer, from: instances, size: size)
        }
    }

    static func updateBoldInstanceBuffer(
        for renderer: PiDiffRenderer,
        boldInstances: [InstanceData]
    ) {
        guard renderer.boldInstanceCount > 0 else {
            renderer.boldInstanceBuffer = nil
            return
        }

        let size = renderer.boldInstanceCount * MemoryLayout<InstanceData>.stride
        updateOrCreateBuffer(
            for: renderer,
            buffer: &renderer.boldInstanceBuffer,
            size: size,
            label: "PiDiffRenderer.BoldInstanceBuffer"
        )

        if let buffer = renderer.boldInstanceBuffer {
            copyDataToBuffer(buffer, from: boldInstances, size: size)
        }
    }

    static func updateRectBuffer(
        for renderer: PiDiffRenderer,
        rects: [RectInstance]
    ) {
        guard renderer.rectCount > 0 else {
            renderer.rectInstanceBuffer = nil
            return
        }

        let size = renderer.rectCount * MemoryLayout<RectInstance>.stride
        updateOrCreateBuffer(
            for: renderer,
            buffer: &renderer.rectInstanceBuffer,
            size: size,
            label: "PiDiffRenderer.RectBuffer"
        )

        if let buffer = renderer.rectInstanceBuffer {
            copyDataToBuffer(buffer, from: rects, size: size)
        }
    }

    private static func updateOrCreateBuffer(
        for renderer: PiDiffRenderer,
        buffer: inout MTLBuffer?,
        size: Int,
        label: String
    ) {
        let shouldRecreate: Bool
        if let existing = buffer {
            let currentSize = existing.length
            if size > currentSize {
                shouldRecreate = true
            } else {
                shouldRecreate = currentSize > size * PiDiffRenderer.shrinkThreshold
            }
        } else {
            shouldRecreate = true
        }

        if shouldRecreate {
            let optimalSize = PiDiffRenderer.optimalBufferSize(for: size)
            let newBuffer = renderer.device.makeBuffer(
                length: optimalSize,
                options: .storageModeShared
            )
            newBuffer?.label = label
            buffer = newBuffer
        }
    }

    private static func copyDataToBuffer<T>(
        _ buffer: MTLBuffer,
        from data: [T],
        size: Int
    ) {
        data.withUnsafeBytes { bufferPointer in
            guard let baseAddress = bufferPointer.baseAddress,
                  bufferPointer.count >= size,
                  buffer.length >= size else {
                print(
                    "⚠️ Invalid buffer - " +
                    "source: \(bufferPointer.count), " +
                    "dest: \(buffer.length), expected: \(size)"
                )
                return
            }
            buffer.contents().copyMemory(from: baseAddress, byteCount: size)
        }
    }
}
