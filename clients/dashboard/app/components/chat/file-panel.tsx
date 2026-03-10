import { FileTextIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  api,
  type SessionFileRecord,
  type SessionFilesResponse,
} from "../../lib/api";

interface FilePanelProps {
  sessionId: string;
  highlightedPath?: string | null;
  referencedPaths?: string[];
}

export function FilePanel({
  sessionId,
  highlightedPath,
  referencedPaths = [],
}: FilePanelProps) {
  const [files, setFiles] = useState<SessionFileRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SessionFilesResponse>(`/sessions/${sessionId}/files`)
      .then((res) => {
        if (cancelled) return;
        if (res.data) setFiles(res.data.files);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <aside className="w-72 border-l border-border bg-surface/30 p-3">
      <h3 className="mb-2 text-xs font-semibold text-muted uppercase tracking-wide">
        Session files
      </h3>
      <div className="space-y-1">
        {files.map((file) => {
          const isActive =
            highlightedPath &&
            (file.sandboxPath === highlightedPath ||
              file.name === highlightedPath);
          const isReferenced =
            !!file.sandboxPath && referencedPaths.includes(file.sandboxPath);

          return (
            <a
              key={file.id}
              href={`${apiBase()}/sessions/${sessionId}/files/${file.id}/content`}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${isActive ? "bg-accent/20 text-fg" : "text-muted hover:text-fg hover:bg-surface-hover"}`}
            >
              <FileTextIcon className="size-3.5" />
              <span className="truncate">{file.name}</span>
              {isReferenced ? (
                <span className="ml-auto rounded bg-accent/20 px-1 py-0.5 text-[10px] text-fg">
                  Ref
                </span>
              ) : null}
            </a>
          );
        })}
        {files.length === 0 && (
          <p className="text-xs text-muted">No uploaded files</p>
        )}
      </div>
    </aside>
  );
}

function apiBase(): string {
  const relayUrl = import.meta.env.VITE_RELAY_URL ?? "";
  return `${relayUrl}/api`;
}
