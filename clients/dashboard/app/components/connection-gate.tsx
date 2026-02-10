import { CircleNotchIcon, PlugsIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { RELAY_URL } from "../lib/api";
import { cn } from "../lib/utils";
import { Logo } from "./logo";

type Status = "checking" | "ok" | "unreachable";

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${RELAY_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { ok?: boolean };
    return json.ok === true;
  } catch {
    return false;
  }
}

interface ConnectionGateProps {
  children: React.ReactNode;
}

export function ConnectionGate({ children }: ConnectionGateProps) {
  const [status, setStatus] = useState<Status>("checking");

  const retry = () => {
    setStatus("checking");
    checkHealth().then((ok) => setStatus(ok ? "ok" : "unreachable"));
  };

  useEffect(() => {
    if (status !== "checking") return;
    checkHealth().then((ok) => setStatus(ok ? "ok" : "unreachable"));
  }, [status]);

  if (status === "ok") return <>{children}</>;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-bg">
      <div className="flex max-w-md flex-col items-center text-center">
        <Logo variant="muted" className="mb-6 size-10" />

        {status === "checking" && (
          <>
            <CircleNotchIcon className="mb-4 size-8 animate-spin text-muted" />
            <p className="text-sm text-muted">Connecting to relay server...</p>
          </>
        )}

        {status === "unreachable" && (
          <>
            <PlugsIcon className="mb-4 size-8 text-status-err" weight="fill" />
            <h1 className="mb-2 text-lg font-semibold text-fg">
              Server unreachable
            </h1>
            <p className="mb-2 text-sm text-muted">
              Could not connect to the relay server at:
            </p>
            <code className="mb-5 rounded-lg bg-surface px-3 py-2 font-mono text-xs text-fg">
              {RELAY_URL}
            </code>
            <button
              type="button"
              onClick={retry}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                "bg-accent text-accent-fg hover:bg-accent-hover",
              )}
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
