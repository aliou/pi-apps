import {
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CopyIcon,
  UserIcon,
  WarningCircleIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import type { HistoryItem } from "../lib/history";
import { cn } from "../lib/utils";

interface ConversationViewProps {
  items: HistoryItem[];
  autoScroll?: boolean;
}

export function ConversationView({
  items,
  autoScroll = true,
}: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(items.length);

  useEffect(() => {
    if (!autoScroll) return;
    if (items.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = items.length;
  }, [items.length, autoScroll]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted">
        <p className="text-sm">No messages yet</p>
        <p className="text-xs mt-1">Send a prompt to start the conversation</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {items.map((item) => {
        switch (item.type) {
          case "user":
            return <UserMessage key={item.id} item={item} />;
          case "assistant":
            return <AssistantMessage key={item.id} item={item} />;
          case "tool":
            return <ToolCallItem key={item.id} item={item} />;
          case "system":
            return <SystemMessage key={item.id} item={item} />;
          case "raw":
            return <RawEntryItem key={item.id} item={item} />;
          default:
            return null;
        }
      })}
      <div ref={bottomRef} />
    </div>
  );
}

// User message bubble
function UserMessage({
  item,
}: {
  item: Extract<HistoryItem, { type: "user" }>;
}) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] flex items-start gap-2">
        <div className="bg-accent text-accent-fg rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm">
          <p className="text-sm whitespace-pre-wrap">{item.text}</p>
        </div>
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
          <UserIcon className="w-4 h-4 text-accent" weight="fill" />
        </div>
      </div>
    </div>
  );
}

// Assistant message bubble
function AssistantMessage({
  item,
}: {
  item: Extract<HistoryItem, { type: "assistant" }>;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] flex items-start gap-2">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface flex items-center justify-center border border-border">
          <span className="text-xs font-semibold text-muted">Pi</span>
        </div>
        <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm group relative">
          <div className="text-sm text-fg [&_.sd-markdown]:text-sm [&_.sd-markdown_pre]:overflow-x-auto [&_.sd-markdown_pre]:rounded-md [&_.sd-markdown_pre]:bg-bg-deep [&_.sd-markdown_pre]:p-3 [&_.sd-markdown_code]:font-mono">
            <Streamdown>{item.text}</Streamdown>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-surface-hover hover:bg-border"
            title="Copy message"
          >
            <CopyIcon className="w-3.5 h-3.5 text-muted" />
          </button>
          {copied && (
            <span className="absolute top-2 right-8 text-xs text-status-ok">
              Copied!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Tool call item (expandable)
function ToolCallItem({
  item,
}: {
  item: Extract<HistoryItem, { type: "tool" }>;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon =
    item.status === "success" ? (
      <CheckCircleIcon className="w-4 h-4 text-status-ok" weight="fill" />
    ) : (
      <WarningCircleIcon className="w-4 h-4 text-status-err" weight="fill" />
    );

  return (
    <div className="ml-10 my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors w-full text-left",
          "bg-surface border border-border hover:bg-surface-hover",
        )}
      >
        {expanded ? (
          <CaretDownIcon className="w-3 h-3 text-muted" />
        ) : (
          <CaretRightIcon className="w-3 h-3 text-muted" />
        )}
        <WrenchIcon className="w-3.5 h-3.5 text-muted" />
        <span className="text-fg font-mono">{item.name}</span>
        <span className="ml-auto">{statusIcon}</span>
      </button>

      {expanded && (
        <div className="mt-2 ml-4 text-xs font-mono">
          {item.args && (
            <div className="mb-2">
              <div className="text-muted mb-1">Arguments:</div>
              <pre className="bg-bg-deep rounded p-2 overflow-x-auto text-fg max-h-40 overflow-y-auto">
                {item.args}
              </pre>
            </div>
          )}
          {item.output && (
            <div>
              <div className="text-muted mb-1">Output:</div>
              <pre
                className={cn(
                  "rounded p-2 overflow-x-auto max-h-60 overflow-y-auto",
                  item.status === "error"
                    ? "bg-status-err/10 text-status-err"
                    : "bg-bg-deep text-fg",
                )}
              >
                {item.output.length > 2000
                  ? `${item.output.slice(0, 2000)}...\n[truncated]`
                  : item.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// System message
function SystemMessage({
  item,
}: {
  item: Extract<HistoryItem, { type: "system" }>;
}) {
  return (
    <div className="flex justify-center">
      <div className="text-xs text-muted bg-bg-deep px-3 py-1 rounded-full max-w-[80%] truncate">
        {item.text}
      </div>
    </div>
  );
}

// Raw entry (unknown type) — collapsible with JSON
function RawEntryItem({
  item,
}: {
  item: Extract<HistoryItem, { type: "raw" }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  const jsonString = JSON.stringify(item.entry, null, 2);
  const entryType = item.entry.type ?? "unknown";

  useEffect(() => {
    if (!expanded || highlightedHtml) return;

    // Lazy-load shiki for syntax highlighting
    let cancelled = false;
    import("shiki")
      .then(({ codeToHtml }) =>
        codeToHtml(jsonString, {
          lang: "json",
          theme: "github-dark",
        }),
      )
      .then((html) => {
        if (!cancelled) setHighlightedHtml(html);
      })
      .catch(() => {
        // Fall back to plain pre
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, highlightedHtml, jsonString]);

  return (
    <div className="ml-10 my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors w-full text-left",
          "bg-surface border border-border hover:bg-surface-hover",
        )}
      >
        {expanded ? (
          <CaretDownIcon className="w-3 h-3 text-muted" />
        ) : (
          <CaretRightIcon className="w-3 h-3 text-muted" />
        )}
        <span className="text-muted font-mono">{entryType}</span>
        <span className="text-muted/50 ml-1">
          {item.entry.id ? `(${item.entry.id})` : ""}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 ml-4">
          {highlightedHtml ? (
            <div
              className="rounded overflow-x-auto max-h-80 overflow-y-auto text-xs [&_pre]:!p-3 [&_pre]:!rounded [&_pre]:!m-0"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is trusted
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <pre className="bg-bg-deep rounded p-3 overflow-x-auto text-xs text-fg max-h-80 overflow-y-auto">
              {jsonString}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
