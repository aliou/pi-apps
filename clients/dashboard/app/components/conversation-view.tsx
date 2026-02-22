import {
  ArrowDownIcon,
  BrainIcon,
  CaretRightIcon,
  CopyIcon,
  WarningCircleIcon,
  WrenchIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import type { ConversationItem } from "../lib/conversation";
import { useStickToBottom } from "../lib/use-stick-to-bottom";
import { cn } from "../lib/utils";
import { NativeToolCall } from "./session-ui";

interface ConversationViewProps {
  items: ConversationItem[];
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>;
}

type ToolItem = Extract<ConversationItem, { type: "tool" }>;
type ThinkingItemType = Extract<ConversationItem, { type: "thinking" }>;
type DisplayItem =
  | ConversationItem
  | {
      type: "reasoning_group";
      id: string;
      thinking: ThinkingItemType;
      tools: ToolItem[];
    };

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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

function fencedCode(text: string, language = "text"): string {
  const trimmed = text.replace(/^\n+/, "").replace(/\n+$/, "");
  let fence = "```";
  while (trimmed.includes(fence)) {
    fence += "`";
  }
  return `${fence}${language}\n${trimmed}\n${fence}`;
}

function inferCodeLanguage(path?: string, toolName?: string): string {
  if (toolName === "bash") return "bash";
  if (!path) return "text";

  const lower = path.toLowerCase();
  if (lower.endsWith(".ts")) return "ts";
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".js")) return "js";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".sh")) return "bash";
  if (lower.endsWith(".diff") || lower.endsWith(".patch")) return "diff";
  return "text";
}

function headerMarkdownPreview(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Reasoning";
  const [firstParagraph] = trimmed.split(/\n\s*\n/);
  return firstParagraph?.trim() || "Reasoning";
}

function formatToolPrimary(tool: ToolItem): string {
  const argsObj = safeParseJson(tool.args);
  const path = asString(argsObj?.path);
  const command = asString(argsObj?.command);

  if (path) return path;
  if (command) return command;
  return "";
}

function groupReasoningItems(items: ConversationItem[]): DisplayItem[] {
  const grouped: DisplayItem[] = [];

  for (let i = 0; i < items.length; ) {
    const item = items[i];
    if (!item) {
      i += 1;
      continue;
    }

    if (item.type === "thinking") {
      const tools: ToolItem[] = [];
      let j = i + 1;

      while (j < items.length) {
        const next = items[j];
        if (!next || next.type !== "tool") break;
        tools.push(next);
        j += 1;
      }

      if (tools.length > 0) {
        grouped.push({
          type: "reasoning_group",
          id: `reasoning-${item.id}`,
          thinking: item,
          tools,
        });
      } else {
        grouped.push(item);
      }

      i = j;
      continue;
    }

    grouped.push(item);
    i += 1;
  }

  return grouped;
}

const markdownStyles = cn(
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
  "[&_[data-streamdown=inline-code]]:whitespace-nowrap",
);

function ToolCodeBlock({ text, language }: { text: string; language: string }) {
  return (
    <div
      className={cn(
        "text-xs",
        "[&_[data-streamdown=code-block]]:my-0",
        "[&_[data-streamdown=code-block]]:rounded-md",
        "[&_[data-streamdown=code-block]]:border [&_[data-streamdown=code-block]]:border-border/70",
        "[&_[data-streamdown=code-block-header]]:hidden",
        "[&_[data-streamdown=code-block-body]]:bg-bg-deep [&_[data-streamdown=code-block-body]]:p-2",
        "dark:[&_[data-streamdown=code-block-body]]:bg-[#2B3E54]",
      )}
    >
      <Streamdown>{fencedCode(text, language)}</Streamdown>
    </div>
  );
}

export function ConversationView({ items, scrollToBottomRef }: ConversationViewProps) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom();
  const displayItems = useMemo(() => groupReasoningItems(items), [items]);

  if (scrollToBottomRef) {
    scrollToBottomRef.current = scrollToBottom;
  }

  return (
    <div className="relative h-full">
      <div ref={scrollRef} className="h-full overflow-y-auto conversation-no-scrollbar">
        <div ref={contentRef} className="flex flex-col gap-3 p-4 pb-8">
          {displayItems.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-muted">
              <p className="text-sm">No messages yet</p>
              <p className="mt-1 text-xs">Send a prompt to start the conversation</p>
            </div>
          ) : (
            displayItems.map((item) => {
              switch (item.type) {
                case "reasoning_group":
                  return <ReasoningGroupItem key={item.id} item={item} />;
                case "user":
                  return <UserMessage key={item.id} item={item} />;
                case "assistant":
                  return <AssistantMessage key={item.id} item={item} />;
                case "thinking":
                  return <ThinkingItem key={item.id} item={item} />;
                case "tool":
                  return <ToolCallItem key={item.id} item={item} />;
                case "system":
                  return <SystemMessage key={item.id} item={item} />;
                default:
                  return null;
              }
            })
          )}
        </div>
      </div>

      {!isAtBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 z-10 flex size-8 items-center justify-center rounded-full border border-border bg-surface shadow-md transition-colors hover:bg-surface-hover"
        >
          <ArrowDownIcon className="size-4 text-muted" />
        </button>
      )}
    </div>
  );
}

function UserMessage({ item }: { item: Extract<ConversationItem, { type: "user" }> }) {
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[80%] items-start gap-2">
        <div className="rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-accent-fg shadow-sm">
          <p className="whitespace-pre-wrap text-sm">{item.text}</p>
        </div>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/20">
          <UserIcon className="h-4 w-4 text-accent" weight="fill" />
        </div>
      </div>
    </div>
  );
}

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
      <div className="flex max-w-[80%] items-start gap-2">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-surface">
          <span className="text-xs font-semibold text-muted">Pi</span>
        </div>
        <div className="group relative rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-2.5 shadow-sm">
          <div className={markdownStyles}>
            <Streamdown>{trimCodeBlockTrailingBlankLines(item.text)}</Streamdown>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="absolute right-2 top-2 rounded bg-surface-hover p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-border"
            title="Copy message"
          >
            <CopyIcon className="h-3.5 w-3.5 text-muted" />
          </button>
          {copied && <span className="absolute right-8 top-2 text-xs text-status-ok">Copied!</span>}
        </div>
      </div>
    </div>
  );
}

function ReasoningGroupItem({
  item,
}: {
  item: Extract<DisplayItem, { type: "reasoning_group" }>;
}) {
  return (
    <details className="group ml-10 overflow-hidden rounded-lg border border-border/70 bg-bg-deep/30" open>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-muted transition-colors hover:text-fg">
        <BrainIcon className="size-4" />
        <span
          className={cn(
            "min-w-0 flex-1 text-left text-fg/90",
            "[&_.sd-markdown]:text-sm [&_.sd-markdown]:leading-5",
            "[&_.sd-markdown_p]:m-0 [&_.sd-markdown_p]:truncate",
            "[&_.sd-markdown_p]:whitespace-nowrap",
          )}
        >
          <Streamdown>{headerMarkdownPreview(item.thinking.text)}</Streamdown>
        </span>
        <span className="text-xs text-muted">{item.tools.length} tool{item.tools.length > 1 ? "s" : ""}</span>
        <CaretRightIcon className="size-3 transition-transform group-open:rotate-90" />
      </summary>

      <div className="space-y-3 border-t border-border/50 px-3 py-3">
        <div className={cn(markdownStyles, "[&_.sd-markdown]:text-xs [&_.sd-markdown]:text-fg/70")}>
          <Streamdown>{trimCodeBlockTrailingBlankLines(item.thinking.text)}</Streamdown>
        </div>

        <div className="space-y-2">
          {item.tools.map((tool, idx) => (
            <ReasoningToolStep
              key={tool.id}
              tool={tool}
              isLast={idx === item.tools.length - 1}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

function ReasoningToolStep({ tool, isLast }: { tool: ToolItem; isLast: boolean }) {
  const primary = formatToolPrimary(tool);
  const argsObj = safeParseJson(tool.args);
  const path = asString(argsObj?.path);

  return (
    <div className="flex gap-2 text-sm">
      <div className="relative mt-0.5">
        <WrenchIcon className="size-4 text-muted" />
        {!isLast && <div className="absolute bottom-0 left-1/2 top-5 -mx-px w-px bg-border" />}
      </div>

      <details className="flex-1 overflow-hidden rounded-md border border-border/60 bg-surface" open={tool.status === "error"}>
        <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs">
          <span className="font-mono text-fg">{tool.name}</span>
          {primary ? <span className="truncate text-muted">{primary}</span> : null}
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[10px] uppercase",
              tool.status === "running" && "bg-status-info/10 text-status-info",
              tool.status === "success" && "bg-status-ok/10 text-status-ok",
              tool.status === "error" && "bg-status-err/10 text-status-err",
            )}
          >
            {tool.status}
          </span>
        </summary>

        <div className="space-y-2 border-t border-border/60 p-2">
          {tool.args ? (
            <ToolCodeBlock
              text={argsObj ? JSON.stringify(argsObj, null, 2) : tool.args}
              language="json"
            />
          ) : null}
          {tool.output ? (
            <ToolCodeBlock
              text={tool.output}
              language={inferCodeLanguage(path, tool.name)}
            />
          ) : null}
        </div>
      </details>
    </div>
  );
}

function ToolCallItem({ item }: { item: Extract<ConversationItem, { type: "tool" }> }) {
  const parsedArgs = safeParseJson(item.args);
  const argPath = asString(parsedArgs?.path);
  const argCommand = asString(parsedArgs?.command);

  return (
    <div className="ml-10 rounded-lg border border-border/60 bg-bg-deep/20 p-1">
      <NativeToolCall
        toolName={item.name}
        status={item.status}
        path={argPath}
        command={argCommand}
        output={item.output}
      />
    </div>
  );
}

function ThinkingItem({ item }: { item: Extract<ConversationItem, { type: "thinking" }> }) {
  return (
    <details className="group ml-10 overflow-hidden rounded-lg border border-border/60 bg-bg-deep/30">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted/80">
        <BrainIcon className="size-3.5" />
        <span className="flex-1">Reasoning</span>
        <CaretRightIcon className="size-3 transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border/30 px-3 py-2">
        <div className={cn(markdownStyles, "[&_.sd-markdown]:text-xs [&_.sd-markdown]:text-fg/60")}>
          <Streamdown>{trimCodeBlockTrailingBlankLines(item.text)}</Streamdown>
        </div>
      </div>
    </details>
  );
}

function SystemMessage({ item }: { item: Extract<ConversationItem, { type: "system" }> }) {
  const isError = item.level === "error";

  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "max-w-[80%] rounded-full px-3 py-1 text-xs",
          isError
            ? "border border-status-err/30 bg-status-err/10 text-status-err"
            : "bg-bg-deep text-muted",
        )}
      >
        {isError ? (
          <span className="mr-1 inline-flex align-middle">
            <WarningCircleIcon className="size-3" weight="fill" />
          </span>
        ) : null}
        {item.text}
      </div>
    </div>
  );
}
