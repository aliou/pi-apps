import { CopyIcon, UserIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import type { ConversationItem } from "../lib/conversation";
import { cn } from "../lib/utils";
import { NativeToolCall } from "./session-ui";

interface ConversationViewProps {
  items: ConversationItem[];
  autoScroll?: boolean;
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore parse error
  }
  return null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function findDiffText(output: string): string | undefined {
  if (!output.includes("\n+") && !output.includes("\n-")) return undefined;
  return output;
}

function trimCodeBlockTrailingBlankLines(markdown: string): string {
  return markdown.replace(
    /```([^\n`]*)\n([\s\S]*?)```/g,
    (_match, language, code) => {
      const trimmedCode = String(code).replace(/\n+$/, "");
      return `\`\`\`${language}\n${trimmedCode}\n\`\`\``;
    },
  );
}

export function ConversationView({
  items,
  autoScroll = true,
}: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(items.length);
  const prevLastFingerprintRef = useRef("");

  useEffect(() => {
    if (!autoScroll) return;

    const last = items[items.length - 1];
    const lastFingerprint = !last
      ? ""
      : `${last.id}:${last.type === "assistant" ? last.text.length : ""}`;

    const appendedItem = items.length > prevLengthRef.current;
    const streamedAssistantUpdate =
      items.length > 0 && lastFingerprint !== prevLastFingerprintRef.current;

    if (appendedItem || streamedAssistantUpdate) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    prevLengthRef.current = items.length;
    prevLastFingerprintRef.current = lastFingerprint;
  }, [items, autoScroll]);

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
  item: Extract<ConversationItem, { type: "user" }>;
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
  item: Extract<ConversationItem, { type: "assistant" }>;
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
          <div
            className={cn(
              "text-sm text-fg [&_.sd-markdown]:text-sm",
              "[&_[data-streamdown=code-block]]:overflow-hidden [&_[data-streamdown=code-block]]:rounded-md [&_[data-streamdown=code-block]]:border [&_[data-streamdown=code-block]]:border-border/80",
              "[&_[data-streamdown=code-block-header]]:hidden",
              "[&_[data-streamdown=code-block-body]]:bg-bg-deep [&_[data-streamdown=code-block-body]]:p-3 [&_[data-streamdown=code-block-body]]:border-0",
              "dark:[&_[data-streamdown=code-block-body]]:bg-[#2B3E54]",
              "[&_.sd-markdown_pre]:overflow-x-auto [&_.sd-markdown_pre]:rounded-md",
              "[&_[data-streamdown=inline-code]]:font-mono [&_[data-streamdown=inline-code]]:text-[0.92em]",
              "[&_[data-streamdown=inline-code]]:rounded-md [&_[data-streamdown=inline-code]]:border [&_[data-streamdown=inline-code]]:border-border/80",
              "[&_[data-streamdown=inline-code]]:bg-bg-deep [&_[data-streamdown=inline-code]]:px-1.5 [&_[data-streamdown=inline-code]]:py-0.5",
              "dark:[&_[data-streamdown=inline-code]]:bg-[#203246] dark:[&_[data-streamdown=inline-code]]:text-[#D8E4F2] dark:[&_[data-streamdown=inline-code]]:border-[#36506B]",
            )}
          >
            <Streamdown>
              {trimCodeBlockTrailingBlankLines(item.text)}
            </Streamdown>
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
  item: Extract<ConversationItem, { type: "tool" }>;
}) {
  const parsedArgs = safeParseJson(item.args);
  const argPath = asString(parsedArgs?.path);
  const argCommand = asString(parsedArgs?.command);
  const diff = asString(parsedArgs?.diff) ?? findDiffText(item.output);

  return (
    <div className="ml-10 my-1">
      <NativeToolCall
        toolName={item.name}
        status={item.status}
        path={argPath}
        command={argCommand}
        output={item.output}
        diff={diff}
      />
    </div>
  );
}

// System message
function SystemMessage({
  item,
}: {
  item: Extract<ConversationItem, { type: "system" }>;
}) {
  return (
    <div className="flex justify-center">
      <div className="text-xs text-muted bg-bg-deep px-3 py-1 rounded-full max-w-[80%] truncate">
        {item.text}
      </div>
    </div>
  );
}
