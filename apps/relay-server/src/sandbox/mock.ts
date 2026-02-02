import readline from "node:readline";
import { PassThrough } from "node:stream";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
  SandboxStatus,
  SandboxStreams,
} from "./types";

/**
 * Mock sandbox handle that simulates pi RPC behavior.
 * Accepts commands on stdin, emits events on stdout.
 */
class MockSandboxHandle implements SandboxHandle {
  private readonly _stdin = new PassThrough();
  private readonly _stdout = new PassThrough();
  private readonly _stderr = new PassThrough();
  readonly providerId: string;

  private _status: SandboxStatus = "creating";
  private statusHandlers = new Set<(status: SandboxStatus) => void>();
  private abortController: AbortController | null = null;
  private bashAbortController: AbortController | null = null;

  // Mock state
  private currentModel: { provider: string; modelId: string } = {
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
  };
  private thinkingLevel: string = "off";
  private steeringMode: string = "all";
  private followUpMode: string = "all";
  private autoCompaction = true;
  private autoRetry = true;
  private sessionName = "Mock Session";
  private messages: Array<{
    role: string;
    content: Array<{ type: string; text: string }>;
  }> = [];
  private promptCount = 0;

  private static readonly AVAILABLE_MODELS = [
    { provider: "anthropic", modelId: "claude-sonnet-4-20250514" },
    { provider: "anthropic", modelId: "claude-opus-4-20250918" },
    { provider: "openai", modelId: "gpt-4.1" },
    { provider: "google", modelId: "gemini-2.5-pro" },
  ];

  private static readonly THINKING_LEVELS = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ] as const;

  constructor(readonly sessionId: string) {
    this.providerId = `mock-${sessionId}`;
    this.setupInputHandler();
    // Simulate sandbox starting up
    setTimeout(() => this.setStatus("running"), 100);
  }

  get status(): SandboxStatus {
    return this._status;
  }

  async resume(
    _secrets?: Record<string, string>,
    _githubToken?: string,
  ): Promise<void> {
    if (this._status === "paused") {
      this.setStatus("running");
    } else if (this._status === "stopped") {
      throw new Error(`Cannot resume: sandbox ${this.sessionId} is stopped`);
    } else if (this._status === "creating") {
      // Wait for it to transition to running
      await new Promise((resolve) => {
        const unsubscribe = this.onStatusChange((status) => {
          if (status === "running") {
            unsubscribe();
            resolve(undefined);
          }
        });
      });
    }
    // If already running, no-op
  }

  async attach(): Promise<SandboxStreams> {
    return {
      stdin: this._stdin,
      stdout: this._stdout,
      stderr: this._stderr,
      detach: () => {
        // No-op for mock — streams stay alive for re-attach
      },
    };
  }

  async pause(): Promise<void> {
    this.setStatus("paused");
  }

  async terminate(): Promise<void> {
    this.abortController?.abort();
    this.bashAbortController?.abort();
    this._stdin.end();
    this._stdout.end();
    this.setStatus("stopped");
  }

  onStatusChange(handler: (status: SandboxStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private setStatus(status: SandboxStatus): void {
    this._status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }

  private setupInputHandler(): void {
    const rl = readline.createInterface({ input: this._stdin });

    rl.on("line", (line) => {
      try {
        const command = JSON.parse(line);
        this.handleCommand(command);
      } catch {
        // Ignore invalid JSON
      }
    });
  }

  private handleCommand(command: {
    type: string;
    id?: string;
    [key: string]: unknown;
  }): void {
    switch (command.type) {
      // Prompting
      case "prompt":
        this.handlePrompt(
          command as { type: "prompt"; message: string; id?: string },
        );
        break;
      case "steer":
        this.handleSteer(
          command as { type: "steer"; message: string; id?: string },
        );
        break;
      case "follow_up":
        this.handleFollowUp(
          command as { type: "follow_up"; message: string; id?: string },
        );
        break;
      case "abort":
        this.handleAbort(command.id);
        break;
      case "new_session":
        this.handleNewSession(command.id);
        break;

      // State
      case "get_state":
        this.handleGetState(command.id);
        break;
      case "get_messages":
        this.handleGetMessages(command.id);
        break;

      // Model
      case "set_model":
        this.handleSetModel(
          command as {
            type: "set_model";
            provider: string;
            modelId: string;
            id?: string;
          },
        );
        break;
      case "cycle_model":
        this.handleCycleModel(command.id);
        break;
      case "get_available_models":
        this.handleGetAvailableModels(command.id);
        break;

      // Thinking
      case "set_thinking_level":
        this.handleSetThinkingLevel(
          command as { type: "set_thinking_level"; level: string; id?: string },
        );
        break;
      case "cycle_thinking_level":
        this.handleCycleThinkingLevel(command.id);
        break;

      // Queue mode
      case "set_steering_mode":
        this.handleSetSteeringMode(
          command as { type: "set_steering_mode"; mode: string; id?: string },
        );
        break;
      case "set_follow_up_mode":
        this.handleSetFollowUpMode(
          command as { type: "set_follow_up_mode"; mode: string; id?: string },
        );
        break;

      // Compaction
      case "compact":
        this.handleCompact(command.id);
        break;
      case "set_auto_compaction":
        this.handleSetAutoCompaction(
          command as {
            type: "set_auto_compaction";
            enabled: boolean;
            id?: string;
          },
        );
        break;

      // Retry
      case "set_auto_retry":
        this.handleSetAutoRetry(
          command as { type: "set_auto_retry"; enabled: boolean; id?: string },
        );
        break;
      case "abort_retry":
        this.handleAbortRetry(command.id);
        break;

      // Bash
      case "bash":
        this.handleBash(
          command as { type: "bash"; command: string; id?: string },
        );
        break;
      case "abort_bash":
        this.handleAbortBash(command.id);
        break;

      // Session
      case "get_session_stats":
        this.handleGetSessionStats(command.id);
        break;
      case "export_html":
        this.handleExportHtml(
          command as { type: "export_html"; outputPath?: string; id?: string },
        );
        break;
      case "switch_session":
        this.handleSwitchSession(
          command as {
            type: "switch_session";
            sessionPath: string;
            id?: string;
          },
        );
        break;
      case "fork":
        this.handleFork(
          command as { type: "fork"; entryId: string; id?: string },
        );
        break;
      case "get_fork_messages":
        this.handleGetForkMessages(command.id);
        break;
      case "get_last_assistant_text":
        this.handleGetLastAssistantText(command.id);
        break;
      case "set_session_name":
        this.handleSetSessionName(
          command as { type: "set_session_name"; name: string; id?: string },
        );
        break;

      // Discovery
      case "get_commands":
        this.handleGetCommands(command.id);
        break;

      // Native tool (relay-specific)
      case "native_tool_response":
        this.handleNativeToolResponse(
          command as {
            type: "native_tool_response";
            toolCallId: string;
            result: unknown;
            isError: boolean;
            id?: string;
          },
        );
        break;

      default:
        this.sendResponse(
          command.id,
          command.type,
          false,
          undefined,
          `Unknown command: ${command.type}`,
        );
    }
  }

  // -- Prompting --

  private handlePrompt(command: {
    type: "prompt";
    message: string;
    id?: string;
  }): void {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.generateResponse(
      command.message,
      command.id,
      this.abortController.signal,
    );
  }

  private handleSteer(command: {
    type: "steer";
    message: string;
    id?: string;
  }): void {
    // Steer behaves like prompt but adjusts the current generation.
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.generateResponse(
      `[Steered] ${command.message}`,
      command.id,
      this.abortController.signal,
    );
  }

  private handleFollowUp(command: {
    type: "follow_up";
    message: string;
    id?: string;
  }): void {
    // Follow-up is queued after the current generation.
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.generateResponse(
      command.message,
      command.id,
      this.abortController.signal,
    );
  }

  private handleAbort(commandId: string | undefined): void {
    this.abortController?.abort();
    this.sendResponse(commandId, "abort", true);
  }

  private handleNewSession(commandId: string | undefined): void {
    this.messages = [];
    this.promptCount = 0;
    this.sendResponse(commandId, "new_session", true, {
      sessionId: `mock-session-${Date.now()}`,
    });
  }

  // -- State --

  private handleGetState(commandId: string | undefined): void {
    this.sendResponse(commandId, "get_state", true, {
      state: "idle",
      currentModel: this.currentModel,
      thinkingLevel: this.thinkingLevel,
      steeringMode: this.steeringMode,
      followUpMode: this.followUpMode,
      autoCompaction: this.autoCompaction,
      autoRetry: this.autoRetry,
      sessionName: this.sessionName,
      messages: this.messages,
    });
  }

  private handleGetMessages(commandId: string | undefined): void {
    this.sendResponse(commandId, "get_messages", true, {
      messages: this.messages,
    });
  }

  // -- Model --

  private handleSetModel(command: {
    type: "set_model";
    provider: string;
    modelId: string;
    id?: string;
  }): void {
    this.currentModel = {
      provider: command.provider,
      modelId: command.modelId,
    };
    this.sendResponse(command.id, "set_model", true, {
      provider: command.provider,
      modelId: command.modelId,
    });
  }

  private handleCycleModel(commandId: string | undefined): void {
    const models = MockSandboxHandle.AVAILABLE_MODELS;
    const currentIndex = models.findIndex(
      (m) =>
        m.provider === this.currentModel.provider &&
        m.modelId === this.currentModel.modelId,
    );
    const nextIndex = (currentIndex + 1) % models.length;
    const next = models[nextIndex];
    if (!next) return;
    this.currentModel = { provider: next.provider, modelId: next.modelId };
    this.sendResponse(commandId, "cycle_model", true, {
      provider: next.provider,
      modelId: next.modelId,
    });
  }

  private handleGetAvailableModels(commandId: string | undefined): void {
    this.sendResponse(commandId, "get_available_models", true, {
      models: MockSandboxHandle.AVAILABLE_MODELS,
    });
  }

  // -- Thinking --

  private handleSetThinkingLevel(command: {
    type: "set_thinking_level";
    level: string;
    id?: string;
  }): void {
    this.thinkingLevel = command.level;
    this.sendResponse(command.id, "set_thinking_level", true, {
      level: command.level,
    });
  }

  private handleCycleThinkingLevel(commandId: string | undefined): void {
    const levels = MockSandboxHandle.THINKING_LEVELS;
    const currentIndex = levels.indexOf(
      this.thinkingLevel as (typeof levels)[number],
    );
    const nextIndex = (currentIndex + 1) % levels.length;
    this.thinkingLevel = levels[nextIndex] ?? "off";
    this.sendResponse(commandId, "cycle_thinking_level", true, {
      level: this.thinkingLevel,
    });
  }

  // -- Queue mode --

  private handleSetSteeringMode(command: {
    type: "set_steering_mode";
    mode: string;
    id?: string;
  }): void {
    this.steeringMode = command.mode;
    this.sendResponse(command.id, "set_steering_mode", true, {
      mode: command.mode,
    });
  }

  private handleSetFollowUpMode(command: {
    type: "set_follow_up_mode";
    mode: string;
    id?: string;
  }): void {
    this.followUpMode = command.mode;
    this.sendResponse(command.id, "set_follow_up_mode", true, {
      mode: command.mode,
    });
  }

  // -- Compaction --

  private handleCompact(commandId: string | undefined): void {
    this.emit({ type: "auto_compaction_start", reason: "threshold" });

    setTimeout(() => {
      this.emit({
        type: "auto_compaction_end",
        result: { messagesBefore: this.messages.length, messagesAfter: 1 },
        aborted: false,
        willRetry: false,
      });
      this.sendResponse(commandId, "compact", true, {
        messagesBefore: this.messages.length,
        messagesAfter: 1,
      });
    }, 300);
  }

  private handleSetAutoCompaction(command: {
    type: "set_auto_compaction";
    enabled: boolean;
    id?: string;
  }): void {
    this.autoCompaction = command.enabled;
    this.sendResponse(command.id, "set_auto_compaction", true, {
      enabled: command.enabled,
    });
  }

  // -- Retry --

  private handleSetAutoRetry(command: {
    type: "set_auto_retry";
    enabled: boolean;
    id?: string;
  }): void {
    this.autoRetry = command.enabled;
    this.sendResponse(command.id, "set_auto_retry", true, {
      enabled: command.enabled,
    });
  }

  private handleAbortRetry(commandId: string | undefined): void {
    this.sendResponse(commandId, "abort_retry", true);
  }

  // -- Bash --

  private handleBash(command: {
    type: "bash";
    command: string;
    id?: string;
  }): void {
    this.bashAbortController?.abort();
    this.bashAbortController = new AbortController();
    const signal = this.bashAbortController.signal;

    const toolCallId = `bash-${Date.now()}`;
    this.emit({
      type: "tool_execution_start",
      toolCallId,
      toolName: "bash",
      args: { command: command.command },
    });

    setTimeout(() => {
      if (signal.aborted) return;

      const output = `$ ${command.command}\n[mock] command executed successfully`;
      this.emit({
        type: "tool_execution_end",
        toolCallId,
        toolName: "bash",
        result: output,
        isError: false,
      });
      this.sendResponse(command.id, "bash", true, { output });
    }, 200);
  }

  private handleAbortBash(commandId: string | undefined): void {
    this.bashAbortController?.abort();
    this.sendResponse(commandId, "abort_bash", true);
  }

  // -- Session --

  private handleGetSessionStats(commandId: string | undefined): void {
    this.sendResponse(commandId, "get_session_stats", true, {
      messageCount: this.messages.length,
      promptCount: this.promptCount,
      tokenUsage: {
        input: this.promptCount * 150,
        output: this.promptCount * 300,
      },
      sessionId: this.sessionId,
      sessionName: this.sessionName,
    });
  }

  private handleExportHtml(command: {
    type: "export_html";
    outputPath?: string;
    id?: string;
  }): void {
    const path =
      command.outputPath ?? `/tmp/mock-session-${this.sessionId}.html`;
    this.sendResponse(command.id, "export_html", true, { path });
  }

  private handleSwitchSession(command: {
    type: "switch_session";
    sessionPath: string;
    id?: string;
  }): void {
    this.messages = [];
    this.promptCount = 0;
    this.sendResponse(command.id, "switch_session", true, {
      sessionPath: command.sessionPath,
    });
  }

  private handleFork(command: {
    type: "fork";
    entryId: string;
    id?: string;
  }): void {
    this.sendResponse(command.id, "fork", true, {
      sessionId: `mock-fork-${Date.now()}`,
      entryId: command.entryId,
    });
  }

  private handleGetForkMessages(commandId: string | undefined): void {
    this.sendResponse(commandId, "get_fork_messages", true, {
      messages: this.messages,
    });
  }

  private handleGetLastAssistantText(commandId: string | undefined): void {
    const lastAssistant = [...this.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const text = lastAssistant?.content?.[0]?.text ?? "";
    this.sendResponse(commandId, "get_last_assistant_text", true, { text });
  }

  private handleSetSessionName(command: {
    type: "set_session_name";
    name: string;
    id?: string;
  }): void {
    this.sessionName = command.name;
    this.sendResponse(command.id, "set_session_name", true, {
      name: command.name,
    });
  }

  // -- Discovery --

  private handleGetCommands(commandId: string | undefined): void {
    this.sendResponse(commandId, "get_commands", true, {
      commands: [
        "prompt",
        "steer",
        "follow_up",
        "abort",
        "new_session",
        "get_state",
        "get_messages",
        "set_model",
        "cycle_model",
        "get_available_models",
        "set_thinking_level",
        "cycle_thinking_level",
        "set_steering_mode",
        "set_follow_up_mode",
        "compact",
        "set_auto_compaction",
        "set_auto_retry",
        "abort_retry",
        "bash",
        "abort_bash",
        "get_session_stats",
        "export_html",
        "switch_session",
        "fork",
        "get_fork_messages",
        "get_last_assistant_text",
        "set_session_name",
        "get_commands",
        "native_tool_response",
      ],
    });
  }

  // -- Native tool (relay-specific) --

  private handleNativeToolResponse(command: {
    type: "native_tool_response";
    toolCallId: string;
    result: unknown;
    isError: boolean;
    id?: string;
  }): void {
    // Acknowledge receipt of native tool result.
    this.sendResponse(command.id, "native_tool_response", true, {
      toolCallId: command.toolCallId,
    });
  }

  // -- Response generation --

  private async generateResponse(
    message: string,
    commandId: string | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    this.promptCount++;

    // Store user message
    const userMessage = {
      role: "user" as const,
      content: [{ type: "text" as const, text: message }],
    };
    this.messages.push(userMessage);

    // Emit agent_start
    this.emit({ type: "agent_start" });

    // Simulate thinking delay
    await this.delay(200, signal);
    if (signal.aborted) return;

    // Create mock response based on message
    const response = this.createMockResponse(message);

    // Emit message_start
    const messageObj = {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "" }],
    };
    this.emit({ type: "message_start", message: messageObj });

    // Get the text content block
    const textBlock = messageObj.content[0];
    if (!textBlock) {
      return;
    }

    // Simulate streaming with typing effect
    for (let i = 0; i < response.length; i += 3) {
      await this.delay(30, signal);
      if (signal.aborted) {
        this.emit({ type: "agent_end", messages: [] });
        return;
      }

      const chunk = response.slice(0, i + 3);
      textBlock.text = chunk;
      this.emit({
        type: "message_update",
        message: messageObj,
        assistantMessageEvent: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: response.slice(i, i + 3) },
        },
      });
    }

    // Final message
    textBlock.text = response;
    this.emit({ type: "message_end", message: messageObj });

    // Store assistant message
    this.messages.push({ ...messageObj });

    // Emit agent_end
    this.emit({ type: "agent_end", messages: [messageObj] });

    // Send response acknowledgment
    this.sendResponse(commandId, "prompt", true);
  }

  private createMockResponse(message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes("hello") || lower.includes("hi")) {
      return "Hello! I'm a mock pi assistant running in a sandbox. How can I help you today?";
    }

    if (lower.includes("help")) {
      return "I can help you with coding tasks, answer questions, and assist with various development workflows. What would you like to work on?";
    }

    if (lower.includes("test")) {
      return "This is a test response from the mock sandbox. The WebSocket connection and event streaming are working correctly.";
    }

    return `I received your message: "${message}"\n\nThis is a simulated response from the mock sandbox provider. In production, this would be handled by a real pi instance running in a Docker container.`;
  }

  // -- Helpers --

  private emit(event: Record<string, unknown>): void {
    this._stdout.write(`${JSON.stringify(event)}\n`);
  }

  private sendResponse(
    id: string | undefined,
    command: string,
    success: boolean,
    data?: unknown,
    error?: string,
  ): void {
    this.emit({
      type: "response",
      command,
      success,
      ...(data !== undefined && { data }),
      ...(error !== undefined && { error }),
      ...(id !== undefined && { id }),
    });
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

/**
 * Mock sandbox provider for development and testing.
 * Simulates pi RPC responses without running actual containers.
 */
export class MockSandboxProvider implements SandboxProvider {
  readonly name = "mock";
  private sandboxes = new Map<string, MockSandboxHandle>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle> {
    const existing = this.sandboxes.get(options.sessionId);
    if (existing && existing.status !== "stopped") {
      return existing;
    }

    const handle = new MockSandboxHandle(options.sessionId);
    this.sandboxes.set(options.sessionId, handle);
    return handle;
  }

  async getSandbox(providerId: string): Promise<SandboxHandle> {
    for (const handle of this.sandboxes.values()) {
      if (handle.providerId === providerId && handle.status !== "stopped") {
        return handle;
      }
    }
    throw new Error(`Sandbox not found: ${providerId}`);
  }

  async listSandboxes(): Promise<SandboxInfo[]> {
    return Array.from(this.sandboxes.values())
      .filter((h) => h.status !== "stopped")
      .map((h) => ({
        sessionId: h.sessionId,
        providerId: h.providerId,
        status: h.status,
        createdAt: new Date().toISOString(),
      }));
  }

  async cleanup(): Promise<CleanupResult> {
    let count = 0;
    for (const [id, handle] of this.sandboxes) {
      if (handle.status === "stopped") {
        this.sandboxes.delete(id);
        count++;
      }
    }
    return { containersRemoved: count, volumesRemoved: 0 };
  }
}
