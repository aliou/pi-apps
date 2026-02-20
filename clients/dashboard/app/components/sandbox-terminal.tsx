import { useEffect, useRef, useState } from "react";
import { RELAY_URL, type SandboxStatusResponse } from "../lib/api";
import { cn } from "../lib/utils";

interface SandboxTerminalProps {
  sessionId: string;
  sandboxStatus: SandboxStatusResponse | null;
}

export function SandboxTerminal({
  sessionId,
  sandboxStatus,
}: SandboxTerminalProps) {
  const canTerminal = sandboxStatus?.capabilities?.terminal === true;

  if (!canTerminal) {
    return null;
  }

  // Key forces full remount on session change, guaranteeing fresh PTY + terminal.
  return <TerminalInstance key={sessionId} sessionId={sessionId} />;
}

function TerminalInstance({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "error" | "exited"
  >("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let terminal: import("ghostty-web").Terminal | null = null;
    let fitAddon: import("ghostty-web").FitAddon | null = null;
    let observer: ResizeObserver | null = null;

    const setup = async () => {
      const ghostty = await import("ghostty-web");
      await ghostty.init();
      if (cancelled) return;

      terminal = new ghostty.Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "ui-monospace, 'SF Mono', Menlo, Monaco, monospace",
        theme: {
          background: "#0a0a0a",
          foreground: "#e4e4e7",
          cursor: "#a1a1aa",
          selectionBackground: "#3f3f46",
        },
        scrollback: 10000,
      });

      fitAddon = new ghostty.FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);
      fitAddon.fit();

      const cols = terminal.cols ?? 80;
      const rows = terminal.rows ?? 24;
      const wsUrl = `${RELAY_URL.replace("http", "ws")}/ws/sessions/${sessionId}/terminal?cols=${cols}&rows=${rows}`;

      ws = new WebSocket(wsUrl);

      terminal.onData((data: string) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });

      ws.onopen = () => {
        if (!cancelled) setStatus("connected");
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as {
            type: string;
            data?: string;
            exitCode?: number;
            message?: string;
          };
          if (msg.type === "output" && msg.data) {
            terminal?.write(msg.data);
          } else if (msg.type === "exit") {
            if (!cancelled) setStatus("exited");
          } else if (msg.type === "error") {
            if (!cancelled) {
              setError(msg.message ?? "Terminal error");
              setStatus("error");
            }
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (!cancelled)
          setStatus((prev) => (prev === "connected" ? "exited" : prev));
      };

      ws.onerror = () => {
        if (!cancelled) {
          setError("WebSocket connection failed");
          setStatus("error");
        }
      };

      observer = new ResizeObserver(() => fitAddon?.fit());
      observer.observe(container);
    };

    void setup();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      if (terminal) {
        terminal.dispose();
      }
    };
  }, [sessionId]);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between bg-[#0a0a0a] px-3 py-1.5 border-b border-border">
        <span className="text-xs font-medium text-zinc-400">Terminal</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] font-medium",
            status === "connected" && "text-status-ok",
            status === "connecting" && "text-status-warn",
            status === "error" && "text-status-err",
            status === "exited" && "text-muted",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              status === "connected" && "bg-status-ok animate-pulse",
              status === "connecting" && "bg-status-warn animate-pulse",
              status === "error" && "bg-status-err",
              status === "exited" && "bg-muted",
            )}
          />
          {status === "connected"
            ? "Connected"
            : status === "connecting"
              ? "Connecting..."
              : status === "error"
                ? error ?? "Error"
                : "Exited"}
        </span>
      </div>
      <div
        ref={containerRef}
        className="h-[calc(100vh-12rem)] min-h-64 bg-[#0a0a0a]"
      />
    </div>
  );
}
