/**
 * In-memory ring buffer for sandbox stderr lines, keyed by session ID.
 * Survives channel reconnects (lives outside the channel lifecycle).
 * Lost on server restart — acceptable for diagnostics.
 */
export class SandboxLogStore {
  private logs = new Map<string, string[]>();
  private readonly maxLines: number;

  constructor(maxLines = 200) {
    this.maxLines = maxLines;
  }

  /**
   * Append a stderr line for a session.
   */
  append(sessionId: string, line: string): void {
    let buffer = this.logs.get(sessionId);
    if (!buffer) {
      buffer = [];
      this.logs.set(sessionId, buffer);
    }
    buffer.push(line);
    if (buffer.length > this.maxLines) {
      buffer.splice(0, buffer.length - this.maxLines);
    }
  }

  /**
   * Get all buffered stderr lines for a session.
   */
  get(sessionId: string): string[] {
    return this.logs.get(sessionId) ?? [];
  }

  /**
   * Clear logs for a session (e.g., on delete).
   */
  clear(sessionId: string): void {
    this.logs.delete(sessionId);
  }
}
