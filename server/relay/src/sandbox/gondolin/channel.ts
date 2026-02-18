import readline from "node:readline";
import type { ExecProcess } from "@earendil-works/gondolin";
import { createLogger } from "../../lib/logger";
import type { SandboxLogStore } from "../log-store";
import type { SandboxChannel } from "../types";

const log = createLogger("gondolin");

export class GondolinSandboxChannel implements SandboxChannel {
  private closed = false;
  private messageHandlers = new Set<(message: string) => void>();
  private closeHandlers = new Set<(reason?: string) => void>();
  private stdoutRl: readline.Interface;
  private stderrRl: readline.Interface;

  constructor(
    private proc: ExecProcess,
    private sessionId?: string,
    private logStore?: SandboxLogStore,
  ) {
    const stdout = this.proc.stdout;
    const stderr = this.proc.stderr;
    if (!stdout || !stderr) {
      throw new Error("Gondolin exec streams are not available");
    }

    this.stdoutRl = readline.createInterface({ input: stdout });
    this.stderrRl = readline.createInterface({ input: stderr });

    this.stdoutRl.on("line", (line) => {
      if (this.closed) return;
      for (const handler of this.messageHandlers) {
        handler(line);
      }
    });

    this.stderrRl.on("line", (line) => {
      if (this.closed || !line.trim()) return;
      log.debug({ sessionId: this.sessionId, line }, "sandbox stderr");
      if (this.sessionId && this.logStore) {
        this.logStore.append(this.sessionId, line);
      }
    });

    this.proc.result
      .then(() => {
        if (this.closed) return;
        this.notifyClose("pi process exited");
      })
      .catch((err) => {
        if (this.closed) return;
        const reason = err instanceof Error ? err.message : "pi process failed";
        this.notifyClose(reason);
      });
  }

  send(message: string): void {
    if (this.closed) return;
    this.proc.write(`${message}\n`);
  }

  onMessage(handler: (message: string) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onClose(handler: (reason?: string) => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.proc.end();
    } catch {
      // noop
    }
    this.stdoutRl.close();
    this.stderrRl.close();
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }

  private notifyClose(reason?: string): void {
    this.closed = true;
    this.stdoutRl.close();
    this.stderrRl.close();
    for (const handler of this.closeHandlers) {
      handler(reason);
    }
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }
}
