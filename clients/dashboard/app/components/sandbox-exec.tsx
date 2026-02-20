import { PlayIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  api,
  type SandboxExecResponse,
  type SandboxStatusResponse,
} from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface SandboxExecProps {
  sessionId: string;
  sandboxStatus: SandboxStatusResponse | null;
}

export function SandboxExec({ sessionId, sandboxStatus }: SandboxExecProps) {
  const [command, setCommand] = useState("");
  const [result, setResult] = useState<SandboxExecResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canExec = sandboxStatus?.capabilities?.exec === true;

  const handleRun = async () => {
    if (!command.trim() || isRunning || !canExec) return;

    setIsRunning(true);
    setError(null);

    const res = await api.post<SandboxExecResponse>(
      `/sessions/${sessionId}/exec`,
      { command: command.trim() },
    );

    setIsRunning(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    if (res.data) {
      setResult(res.data);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleRun();
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={canExec ? "Enter command..." : "Exec not available"}
          disabled={!canExec || isRunning}
          className={cn(
            "flex-1 rounded-lg border border-border bg-bg px-3 py-1.5",
            "font-mono text-sm text-fg placeholder:text-muted",
            "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleRun()}
          disabled={!canExec || !command.trim()}
          loading={isRunning}
        >
          <PlayIcon className="size-3.5" />
          Run
        </Button>
      </div>

      {error && <p className="mt-2 text-xs text-status-err">{error}</p>}

      {result && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs text-muted">Exit code:</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                result.exitCode === 0
                  ? "bg-status-ok/20 text-status-ok"
                  : "bg-status-err/20 text-status-err",
              )}
            >
              {result.exitCode}
            </span>
          </div>
          {result.output && (
            <pre className="max-h-64 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-bg p-3 font-mono text-xs text-fg">
              <code>{result.output}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
