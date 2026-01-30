import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const XCODECONTROL = "npx -y xcodemcp@latest";

const XCODE_TOOLS_GUIDANCE = `
## Xcode Tools

Use the xcode_* tools to build, test, and run iOS/macOS projects.

**Workflow:**
1. Use \`xcode_get_schemes\` to discover available schemes
2. Use \`xcode_get_destinations\` to find simulators/devices
3. Use \`xcode_build\` to compile (check for errors)
4. Use \`xcode_test\` to run tests
5. Use \`xcode_run\` to launch on simulator/device

**Tips:**
- Always specify \`scheme\` for build/test/run operations
- Use \`xcode_health_check\` to diagnose environment issues
- Builds can take several minutes - the tools have a 5 min timeout
- If a project has both .xcodeproj and .xcworkspace, prefer workspace
`;

interface XcodeResult {
  stdout: string;
  stderr: string;
  code: number;
}

export default function (pi: ExtensionAPI) {
  // Inject guidance into system prompt
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n${XCODE_TOOLS_GUIDANCE}`,
    };
  });

  async function runXcode(
    args: string[],
    signal?: AbortSignal,
  ): Promise<XcodeResult> {
    const result = await pi.exec(
      "bash",
      ["-c", `${XCODECONTROL} ${args.join(" ")}`],
      {
        signal,
        timeout: 300_000, // 5 min for builds
      },
    );
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code ?? 0,
    };
  }

  function formatResult(result: XcodeResult): string {
    let output = "";
    if (result.stdout) output += result.stdout;
    if (result.stderr) output += (output ? "\n" : "") + result.stderr;
    if (result.code !== 0) output += `\nExit code: ${result.code}`;
    return output || "OK";
  }

  // Health check
  pi.registerTool({
    name: "xcode_health_check",
    label: "Xcode Health Check",
    description:
      "Check Xcode environment: installation, XCLogParser, JXA availability",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _onUpdate, _ctx, signal) {
      const result = await runXcode(["health-check"], signal);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { code: result.code },
      };
    },
  });

  // Build
  pi.registerTool({
    name: "xcode_build",
    label: "Xcode Build",
    description: "Build an Xcode project or workspace",
    parameters: Type.Object({
      xcodeproj: Type.Optional(
        Type.String({ description: "Path to .xcodeproj" }),
      ),
      workspace: Type.Optional(
        Type.String({ description: "Path to .xcworkspace" }),
      ),
      scheme: Type.Optional(Type.String({ description: "Scheme to build" })),
      destination: Type.Optional(
        Type.String({
          description: "Build destination (e.g., 'iPhone 16 Simulator')",
        }),
      ),
    }),
    async execute(_toolCallId, params, onUpdate, _ctx, signal) {
      const args = ["build"];
      if (params.xcodeproj) args.push("--xcodeproj", params.xcodeproj);
      if (params.workspace) args.push("--workspace", params.workspace);
      if (params.scheme) args.push("--scheme", params.scheme);
      if (params.destination) args.push("--destination", params.destination);

      onUpdate?.({ content: [{ type: "text", text: "Building..." }] });
      const result = await runXcode(args, signal);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { code: result.code },
      };
    },
  });

  // Clean
  pi.registerTool({
    name: "xcode_clean",
    label: "Xcode Clean",
    description: "Clean build artifacts for an Xcode project",
    parameters: Type.Object({
      xcodeproj: Type.Optional(
        Type.String({ description: "Path to .xcodeproj" }),
      ),
      workspace: Type.Optional(
        Type.String({ description: "Path to .xcworkspace" }),
      ),
    }),
    async execute(_toolCallId, params, _onUpdate, _ctx, signal) {
      const args = ["clean"];
      if (params.xcodeproj) args.push("--xcodeproj", params.xcodeproj);
      if (params.workspace) args.push("--workspace", params.workspace);

      const result = await runXcode(args, signal);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { code: result.code },
      };
    },
  });

  // Test
  pi.registerTool({
    name: "xcode_test",
    label: "Xcode Test",
    description: "Run tests for an Xcode project",
    parameters: Type.Object({
      xcodeproj: Type.Optional(
        Type.String({ description: "Path to .xcodeproj" }),
      ),
      workspace: Type.Optional(
        Type.String({ description: "Path to .xcworkspace" }),
      ),
      scheme: Type.Optional(Type.String({ description: "Scheme to test" })),
      destination: Type.Optional(
        Type.String({ description: "Test destination" }),
      ),
    }),
    async execute(_toolCallId, params, onUpdate, _ctx, signal) {
      const args = ["test"];
      if (params.xcodeproj) args.push("--xcodeproj", params.xcodeproj);
      if (params.workspace) args.push("--workspace", params.workspace);
      if (params.scheme) args.push("--scheme", params.scheme);
      if (params.destination) args.push("--destination", params.destination);

      onUpdate?.({ content: [{ type: "text", text: "Running tests..." }] });
      const result = await runXcode(args, signal);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { code: result.code },
      };
    },
  });

  // Run
  pi.registerTool({
    name: "xcode_run",
    label: "Xcode Run",
    description: "Build and run an Xcode project on a simulator or device",
    parameters: Type.Object({
      xcodeproj: Type.Optional(
        Type.String({ description: "Path to .xcodeproj" }),
      ),
      workspace: Type.Optional(
        Type.String({ description: "Path to .xcworkspace" }),
      ),
      scheme: Type.Optional(Type.String({ description: "Scheme to run" })),
    }),
    async execute(_toolCallId, params, onUpdate, _ctx, signal) {
      const args = ["run"];
      if (params.xcodeproj) args.push("--xcodeproj", params.xcodeproj);
      if (params.workspace) args.push("--workspace", params.workspace);
      if (params.scheme) args.push("--scheme", params.scheme);

      onUpdate?.({
        content: [{ type: "text", text: "Building and running..." }],
      });
      const result = await runXcode(args, signal);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { code: result.code },
      };
    },
  });

  // Get schemes
  pi.registerTool({
    name: "xcode_get_schemes",
    label: "Xcode Get Schemes",
    description: "List available schemes in an Xcode project or workspace",
    parameters: Type.Object({
      xcodeproj: Type.Optional(
        Type.String({ description: "Path to .xcodeproj" }),
      ),
      workspace: Type.Optional(
        Type.String({ description: "Path to .xcworkspace" }),
      ),
    }),
    async execute(_toolCallId, params, _onUpdate, _ctx, signal) {
      const args = ["get-schemes"];
      if (params.xcodeproj) args.push("--xcodeproj", params.xcodeproj);
      if (params.workspace) args.push("--workspace", params.workspace);

      const result = await runXcode(args, signal);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { code: result.code },
      };
    },
  });

  // Get run destinations (simulators/devices)
  pi.registerTool({
    name: "xcode_get_destinations",
    label: "Xcode Get Destinations",
    description: "List available run destinations (simulators and devices)",
    parameters: Type.Object({
      xcodeproj: Type.Optional(
        Type.String({ description: "Path to .xcodeproj" }),
      ),
      workspace: Type.Optional(
        Type.String({ description: "Path to .xcworkspace" }),
      ),
    }),
    async execute(_toolCallId, params, _onUpdate, _ctx, signal) {
      const args = ["get-run-destinations"];
      if (params.xcodeproj) args.push("--xcodeproj", params.xcodeproj);
      if (params.workspace) args.push("--workspace", params.workspace);

      const result = await runXcode(args, signal);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { code: result.code },
      };
    },
  });

  // Stop running app
  pi.registerTool({
    name: "xcode_stop",
    label: "Xcode Stop",
    description: "Stop the currently running app",
    parameters: Type.Object({
      xcodeproj: Type.Optional(
        Type.String({ description: "Path to .xcodeproj" }),
      ),
      workspace: Type.Optional(
        Type.String({ description: "Path to .xcworkspace" }),
      ),
    }),
    async execute(_toolCallId, params, _onUpdate, _ctx, signal) {
      const args = ["stop"];
      if (params.xcodeproj) args.push("--xcodeproj", params.xcodeproj);
      if (params.workspace) args.push("--workspace", params.workspace);

      const result = await runXcode(args, signal);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { code: result.code },
      };
    },
  });
}
