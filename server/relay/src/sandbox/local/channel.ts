import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { SandboxChannel } from "../types";

export class LocalSandboxChannel implements SandboxChannel {
  private closed = false;
  private readonly messageHandlers = new Set<(message: string) => void>();
  private readonly closeHandlers = new Set<(reason?: string) => void>();
  private buffer = "";

  constructor(private child: ChildProcessWithoutNullStreams) {
    this.child.stdout.on("data", this.handleStdout);
    this.child.once("close", this.handleClose);
    this.child.once("error", this.handleError);
  }

  send(message: string): void {
    if (this.closed) return;
    this.child.stdin.write(`${message}\n`);
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
    this.child.stdout.off("data", this.handleStdout);
    this.child.removeListener("close", this.handleClose);
    this.child.removeListener("error", this.handleError);
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }

  private handleStdout = (chunk: Buffer | string): void => {
    if (this.closed) return;
    this.buffer += chunk.toString();
    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() ?? "";
    for (const part of parts) {
      const message = part.trimEnd();
      if (!message) continue;
      for (const handler of this.messageHandlers) {
        handler(message);
      }
    }
  };

  private handleClose = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    if (this.closed) return;
    for (const handler of this.closeHandlers) {
      handler(
        `process exited${code !== null ? ` (${code})` : ""}${signal ? ` via ${signal}` : ""}`,
      );
    }
  };

  private handleError = (error: Error): void => {
    if (this.closed) return;
    for (const handler of this.closeHandlers) {
      handler(error.message);
    }
  };
}
