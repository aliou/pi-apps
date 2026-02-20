import {
  CaretRightIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  InfoIcon,
  WarningCircleIcon,
  WrenchIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import { cn } from "../lib/utils";

type ToolStatus = "running" | "success" | "error";

type ResultBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType?: string }
  | { type: "unknown"; data: unknown };

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

function fencedCode(text: string, language = "text"): string {
  const trimmed = text.replace(/^\n+/, "").replace(/\n+$/, "");
  // Use enough backticks to avoid conflicts with content
  let fence = "```";
  while (trimmed.includes(fence)) {
    fence += "`";
  }
  return `${fence}${language}\n${trimmed}\n${fence}`;
}

function trimCodeBlockTrailingBlankLines(markdown: string): string {
  return markdown.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_match, language, code) => {
    const trimmedCode = String(code).replace(/\n+$/, "");
    return `\`\`\`${language}\n${trimmedCode}\n\`\`\``;
  });
}

function MarkdownCode({ text, language }: { text: string; language?: string }) {
  return (
    <div
      className={cn(
        "text-xs",
        "[&_[data-streamdown=code-block]]:my-0",
        "[&_[data-streamdown=code-block]]:rounded-md",
        "[&_[data-streamdown=code-block]]:border-border",
        "[&_[data-streamdown=code-block-header]]:hidden",
        "[&_[data-streamdown=code-block-body]]:bg-surface",
        "[&_[data-streamdown=code-block-body]]:p-2",
      )}
    >
      <Streamdown>{fencedCode(text, language ?? "text")}</Streamdown>
    </div>
  );
}

export function SessionTimeline({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

export function SessionTimelineGroup({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      {title ? <h3 className="mb-3 text-xs text-muted uppercase">{title}</h3> : null}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function SessionTurnDivider({ label = "Turn" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function ChatMessage({
  children,
  role,
}: {
  children: ReactNode;
  role: "assistant" | "user" | "system";
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3",
          role === "assistant" && "border border-border bg-surface",
          role === "user" && "bg-accent text-accent-fg",
          role === "system" && "bg-bg-deep text-muted",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ChatMessageMarkdown({ text }: { text: string }) {
  return (
    <div
      className={cn(
        "text-sm",
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
      <Streamdown>{trimCodeBlockTrailingBlankLines(text)}</Streamdown>
    </div>
  );
}

export function ChatMessageActions() {
  return (
    <div className="mt-2 flex gap-2">
      <button type="button" className="rounded border border-border px-2 py-1 text-xs text-muted">
        <CopyIcon className="mr-1 inline size-3" />
        Copy
      </button>
      <button type="button" className="rounded border border-border px-2 py-1 text-xs text-muted">
        Regenerate
      </button>
    </div>
  );
}

export function ThinkingBlock({ text, title = "Thinking" }: { text: string; title?: string }) {
  return (
    <details className="rounded-lg border border-border bg-bg-deep" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-muted">{title}</summary>
      <div className="border-t border-border px-3 py-2 text-sm italic text-fg/90">
        <ChatMessageMarkdown text={text} />
      </div>
    </details>
  );
}

export function ThinkingTimeline({ blocks }: { blocks: string[] }) {
  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => (
        <ThinkingBlock key={block} title={`Step ${idx + 1}`} text={block} />
      ))}
    </div>
  );
}

export function ThinkingLevelBadge({ level }: { level: string }) {
  return (
    <span className="inline-flex rounded-full bg-status-info/15 px-2 py-0.5 text-xs text-status-info">
      Thinking: {level}
    </span>
  );
}

function StatusIcon({ status }: { status: ToolStatus }) {
  if (status === "success") return <CheckCircleIcon className="size-4 text-status-ok" weight="fill" />;
  if (status === "error") return <XCircleIcon className="size-4 text-status-err" weight="fill" />;
  return <ClockIcon className="size-4 text-status-warn" weight="fill" />;
}

export function ToolCallCard({
  children,
  name,
  status,
}: {
  children?: ReactNode;
  name: string;
  status: ToolStatus;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-2">
      <div className="flex items-center gap-2 text-xs">
        <WrenchIcon className="size-4 text-muted" />
        <span className="font-mono text-fg">{name}</span>
        <span className="ml-auto">
          <StatusIcon status={status} />
        </span>
      </div>
      {children}
    </div>
  );
}

export function ToolCallDetails({
  args,
  output,
  path,
  toolName,
  defaultOpen = false,
}: {
  args?: string;
  output?: string;
  path?: string;
  toolName?: string;
  defaultOpen?: boolean;
}) {
  const lang = inferCodeLanguage(path, toolName);

  return (
    <details className="rounded border border-border/70 bg-bg-deep" open={defaultOpen}>
      <summary className="cursor-pointer px-2 py-1 text-xs text-muted">Details</summary>
      <div className="space-y-2 border-t border-border/70 p-2 text-xs">
        {args ? <MarkdownCode text={args} language="json" /> : null}
        {output ? <MarkdownCode text={output} language={lang} /> : null}
      </div>
    </details>
  );
}

export function ToolCallStreamDelta({ delta }: { delta: string }) {
  return <p className="text-xs text-muted">Streaming update: {delta}</p>;
}

export function ReadToolCall({
  status,
  path,
  output,
}: {
  status: ToolStatus;
  path?: string;
  output?: string;
}) {
  return (
    <ToolCallCard name="read" status={status}>
      <ToolCallDetails
        args={path ? JSON.stringify({ path }, null, 2) : undefined}
        output={output}
        path={path}
        toolName="read"
      />
    </ToolCallCard>
  );
}

export function WriteToolCall({
  status,
  path,
  content,
}: {
  status: ToolStatus;
  path?: string;
  content?: string;
}) {
  return (
    <ToolCallCard name="write" status={status}>
      <ToolCallDetails
        args={path ? JSON.stringify({ path }, null, 2) : undefined}
        output={content}
        path={path}
        toolName="write"
      />
    </ToolCallCard>
  );
}

export function EditToolCall({
  status,
  path,
  diff,
  output,
}: {
  status: ToolStatus;
  path?: string;
  diff?: string;
  output?: string;
}) {
  return (
    <ToolCallCard name="edit" status={status}>
      {path ? <SessionEventPill label={path} /> : null}
      <div className="mt-2">{diff ? <ToolDiffPreview diff={diff} /> : <ToolCallDetails output={output} />}</div>
    </ToolCallCard>
  );
}

export function BashToolCall({
  status,
  command,
  output,
}: {
  status: ToolStatus;
  command?: string;
  output?: string;
}) {
  return (
    <ToolCallCard name="bash" status={status}>
      <ToolCallDetails
        args={command ? JSON.stringify({ command }, null, 2) : undefined}
        output={output}
        toolName="bash"
      />
    </ToolCallCard>
  );
}

export function AskUserToolCall({
  status,
  questionCount,
  output,
}: {
  status: ToolStatus;
  questionCount?: number;
  output?: string;
}) {
  return (
    <ToolCallCard name="ask_user" status={status}>
      {typeof questionCount === "number" ? <SessionEventPill label={`${questionCount} question(s)`} /> : null}
      <div className="mt-2">
        <ToolCallDetails output={output} toolName="ask_user" />
      </div>
    </ToolCallCard>
  );
}

export function ProcessToolCall({
  status,
  action,
  output,
}: {
  status: ToolStatus;
  action?: string;
  output?: string;
}) {
  return (
    <ToolCallCard name="process" status={status}>
      {action ? <SessionEventPill label={`action: ${action}`} /> : null}
      <div className="mt-2">
        <ToolCallDetails output={output} toolName="process" />
      </div>
    </ToolCallCard>
  );
}

export function NativeToolCall({
  toolName,
  status,
  path,
  command,
  output,
  diff,
}: {
  toolName: string;
  status: ToolStatus;
  path?: string;
  command?: string;
  output?: string;
  diff?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Build the summary line
  let summary = "";
  if (toolName === "read" && path) summary = path;
  else if (toolName === "bash" && command)
    summary = command.length > 100 ? `${command.slice(0, 100)}...` : command;
  else if ((toolName === "edit" || toolName === "write") && path) summary = path;
  else if (toolName === "ask_user") summary = "asking user";
  else if (toolName === "process") summary = "background process";
  else summary = path ?? command ?? "";

  const displayOutput = diff ?? output;

  return (
    <div className="group">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface transition-colors"
      >
        <StatusIcon status={status} />
        <span className="font-mono font-medium text-fg/80">{toolName}</span>
        {summary && (
          <span className="truncate font-mono text-muted/80">{summary}</span>
        )}
        <CaretRightIcon
          className={cn(
            "ml-auto size-3 text-muted/60 transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>
      {expanded && displayOutput && (
        <div className="mt-1 ml-6 rounded-md border border-border/60 bg-surface overflow-hidden">
          <MarkdownCode
            text={displayOutput}
            language={inferCodeLanguage(path, toolName)}
          />
        </div>
      )}
    </div>
  );
}

export function ToolResultRenderer({ blocks }: { blocks: ResultBlock[] }) {
  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        if (block.type === "text") {
          return <MarkdownCode key={`${idx}-${block.type}`} text={block.text} language="text" />;
        }

        if (block.type === "image") {
          return (
            <img
              key={`${idx}-${block.type}`}
              alt="Tool result"
              className="max-h-60 rounded border border-border"
              src={`data:${block.mimeType ?? "image/png"};base64,${block.data}`}
            />
          );
        }

        return (
          <MarkdownCode
            key={`${idx}-${block.type}`}
            text={JSON.stringify(block.data, null, 2)}
            language="json"
          />
        );
      })}
    </div>
  );
}

export function ToolDiffPreview({ diff }: { diff: string }) {
  return <MarkdownCode text={diff} language="diff" />;
}

export function SessionEventPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-bg-deep px-2 py-1 text-xs text-muted">
      <InfoIcon className="size-3" />
      {label}
    </div>
  );
}

export function BashExecutionItem({
  command,
  exitCode,
  output,
}: {
  command: string;
  exitCode: number;
  output: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="mb-2 text-xs text-muted">bashExecution</p>
      <MarkdownCode text={command} language="bash" />
      <p className="mt-2 text-xs text-muted">Exit code: {exitCode}</p>
      <MarkdownCode text={output} language="bash" />
    </div>
  );
}

export function CustomMessageItem({ content, status }: { content: string; status?: string }) {
  return (
    <div className="rounded-lg border border-status-info/30 bg-status-info/10 p-3 text-sm text-fg">
      <p>{content}</p>
      {status ? <p className="mt-1 text-xs text-muted">Status: {status}</p> : null}
    </div>
  );
}

export function CustomEventItem({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-xs">
      <p className="font-medium text-fg">{title}</p>
      <p className="mt-1 text-muted">{value}</p>
    </div>
  );
}

export function LiveAssistantDraft({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-status-warn/40 bg-status-warn/10 p-3 text-sm text-fg">
      <ChatMessageMarkdown text={text} />
      <span className="mt-1 inline-flex items-center gap-1 text-xs text-status-warn">
        <ClockIcon className="size-3" />
        Streaming
      </span>
    </div>
  );
}

export function RawEntryFallback({ entry }: { entry: unknown }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(entry, null, 2);

  return (
    <details className="rounded-lg border border-border bg-surface" open>
      <summary className="cursor-pointer px-3 py-2 text-xs text-muted">Raw entry</summary>
      <div className="border-t border-border p-3">
        <button
          type="button"
          className="mb-2 rounded border border-border px-2 py-1 text-xs text-muted"
          onClick={() => {
            navigator.clipboard.writeText(json);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          <CopyIcon className="mr-1 inline size-3" />
          {copied ? "Copied" : "Copy JSON"}
        </button>
        <pre className="max-h-64 overflow-auto rounded bg-bg-deep p-2 text-xs">{json}</pre>
      </div>
    </details>
  );
}

// AI-elements-inspired wrappers (our implementation)
export function Conversation({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export function ConversationContent({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

export function Response({ text }: { text: string }) {
  return <ChatMessageMarkdown text={text} />;
}

export function Reasoning({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-deep p-3">
      <p className="mb-2 text-xs font-medium text-muted">Reasoning</p>
      {children}
    </div>
  );
}

export function Tool({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface p-3">{children}</div>;
}

export function EventNotice({ children, variant = "info" }: { children: ReactNode; variant?: "info" | "warn" }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-xs",
        variant === "warn"
          ? "border-status-warn/40 bg-status-warn/10 text-status-warn"
          : "border-status-info/40 bg-status-info/10 text-status-info",
      )}
    >
      {variant === "warn" ? <WarningCircleIcon className="mr-1 inline size-3" /> : null}
      {children}
    </div>
  );
}
