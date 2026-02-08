#include <metal_stdlib>
using namespace metal;

struct VertexIn {
    float2 position [[attribute(0)]];
};

struct InstanceData {
    float2 origin;
    float2 size;
    float2 uvMin;
    float2 uvMax;
    float4 color;
};

struct Uniforms {
    float2 viewportSize;
    float cameraX;
    float cameraY;
    float scale;
    float padding;
};

struct VertexOut {
    float4 position [[position]];
    float2 uv;
    float4 color;
};

// ---------------------------
// Text Pass (Instanced Quads)
// ---------------------------

vertex VertexOut text_vertex(const VertexIn vertexIn [[stage_in]],
                             const device InstanceData* instances [[buffer(1)]],
                             constant Uniforms& uniforms [[buffer(2)]],
                             uint instanceID [[instance_id]]) {
    VertexOut out;
    InstanceData instance = instances[instanceID];

    float2 pixelPos = instance.origin + (vertexIn.position * instance.size);
    pixelPos.x -= uniforms.cameraX;
    pixelPos.y -= uniforms.cameraY;

    float x = (pixelPos.x / uniforms.viewportSize.x) * 2.0 - 1.0;
    float y = (1.0 - (pixelPos.y / uniforms.viewportSize.y) * 2.0);

    out.position = float4(x, y, 0.0, 1.0);
    out.uv = mix(instance.uvMin, instance.uvMax, vertexIn.position);
    out.color = instance.color;
    return out;
}

fragment float4 text_fragment(VertexOut in [[stage_in]],
                              texture2d<float> atlas [[texture(0)]]) {
    constexpr sampler s(coord::normalized, address::clamp_to_edge, filter::nearest);
    float alpha = atlas.sample(s, in.uv).r;
    return float4(in.color.rgb, in.color.a * alpha);
}

// ---------------------------
// Background Pass (Rounded Rects)
// ---------------------------

struct RectInstance {
    float2 origin;
    float2 size;
    float4 color;
    float cornerRadius;
    float borderWidth;
    float4 borderColor;
    float padding;
};

struct RectVertexOut {
    float4 position [[position]];
    float2 localPos;
    float2 size;
    float4 color;
    float cornerRadius;
    float borderWidth;
    float4 borderColor;
    float scale;
};

float sdRoundedRect(float2 p, float2 halfSize, float radius) {
    float2 q = abs(p) - halfSize + radius;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

vertex RectVertexOut rect_vertex(const VertexIn vertexIn [[stage_in]],
                                  const device RectInstance* instances [[buffer(1)]],
                                  constant Uniforms& uniforms [[buffer(2)]],
                                  uint instanceID [[instance_id]]) {
    RectVertexOut out;
    RectInstance instance = instances[instanceID];

    float2 pixelPos = instance.origin + (vertexIn.position * instance.size);
    pixelPos.x -= uniforms.cameraX;
    pixelPos.y -= uniforms.cameraY;

    float x = (pixelPos.x / uniforms.viewportSize.x) * 2.0 - 1.0;
    float y = (1.0 - (pixelPos.y / uniforms.viewportSize.y) * 2.0);

    out.position = float4(x, y, 0.0, 1.0);
    out.localPos = vertexIn.position * instance.size;
    out.size = instance.size;
    out.color = instance.color;
    out.cornerRadius = instance.cornerRadius;
    out.borderWidth = instance.borderWidth;
    out.borderColor = instance.borderColor;
    out.scale = uniforms.scale;
    return out;
}

fragment float4 rect_fragment(RectVertexOut in [[stage_in]]) {
    if (in.cornerRadius <= 0.0 && in.borderWidth <= 0.0) {
        return in.color;
    }

    float2 center = in.size * 0.5;
    float2 p = in.localPos - center;
    float2 halfSize = center;
    float radius = min(in.cornerRadius, min(halfSize.x, halfSize.y));
    float d = sdRoundedRect(p, halfSize, radius);
    float aa = 0.5 / in.scale;

    if (in.borderWidth > 0.0) {
        if (d > aa) { discard_fragment(); }
        float innerD = d + in.borderWidth;
        if (innerD < -aa) { return in.color; }
        else if (d < -aa) { return in.borderColor; }
        else {
            float alpha = 1.0 - smoothstep(-aa, aa, d);
            return float4(in.borderColor.rgb, in.borderColor.a * alpha);
        }
    } else {
        if (d > aa) { discard_fragment(); }
        float alpha = 1.0 - smoothstep(-aa, aa, d);
        return float4(in.color.rgb, in.color.a * alpha);
    }
}
