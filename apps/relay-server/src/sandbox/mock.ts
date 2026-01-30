import readline from "node:readline";
import { PassThrough } from "node:stream";
import type {
  CreateSandboxOptions,
  SandboxHandle,
  SandboxProvider,
  SandboxStatus,
} from "./types";

/**
 * Mock sandbox handle that simulates pi RPC behavior.
 * Accepts commands on stdin, emits events on stdout.
 */
class MockSandboxHandle implements SandboxHandle {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();

  private _status: SandboxStatus = "creating";
  private statusHandlers = new Set<(status: SandboxStatus) => void>();
  private abortController: AbortController | null = null;

  constructor(readonly sessionId: string) {
    this.setupInputHandler();
    // Simulate sandbox starting up
    setTimeout(() => this.setStatus("running"), 100);
  }

  get status(): SandboxStatus {
    return this._status;
  }

  async terminate(): Promise<void> {
    this.setStatus("stopping");
    this.abortController?.abort();
    this.stdin.end();
    this.stdout.end();
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
    const rl = readline.createInterface({ input: this.stdin });

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
      case "prompt":
        this.handlePrompt(
          command as { type: "prompt"; message: string; id?: string },
        );
        break;
      case "abort":
        this.handleAbort(command.id);
        break;
      case "get_state":
        this.handleGetState(command.id);
        break;
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

  private handlePrompt(command: {
    type: "prompt";
    message: string;
    id?: string;
  }): void {
    // Cancel any ongoing generation
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Simulate async generation
    this.generateResponse(command.message, command.id, signal);
  }

  private async generateResponse(
    message: string,
    commandId: string | undefined,
    signal: AbortSignal,
  ): Promise<void> {
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

    // Get the text content block (we just created it above)
    const textBlock = messageObj.content[0];
    if (!textBlock) {
      return; // Should never happen, but satisfy TS
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

    // Emit agent_end
    this.emit({ type: "agent_end", messages: [messageObj] });

    // Send response acknowledgment
    this.sendResponse(commandId, "prompt", true);
  }

  private handleAbort(commandId: string | undefined): void {
    this.abortController?.abort();
    this.sendResponse(commandId, "abort", true);
  }

  private handleGetState(commandId: string | undefined): void {
    this.sendResponse(commandId, "get_state", true, {
      state: "idle",
      currentModel: {
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
      },
      messages: [],
    });
  }

  private handleSetModel(command: {
    type: "set_model";
    provider: string;
    modelId: string;
    id?: string;
  }): void {
    // Simulate model switch
    this.sendResponse(command.id, "set_model", true, {
      provider: command.provider,
      modelId: command.modelId,
    });
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

  private emit(event: Record<string, unknown>): void {
    this.stdout.write(`${JSON.stringify(event)}\n`);
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
        resolve(); // Resolve instead of reject for cleaner abort handling
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

  getSandbox(sessionId: string): SandboxHandle | undefined {
    const handle = this.sandboxes.get(sessionId);
    if (handle && handle.status !== "stopped") {
      return handle;
    }
    return undefined;
  }

  removeSandbox(sessionId: string): void {
    const handle = this.sandboxes.get(sessionId);
    if (handle) {
      handle.terminate();
      this.sandboxes.delete(sessionId);
    }
  }
}
