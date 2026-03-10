import { ArrowUpIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchableSelect } from "../components/ui";
import {
  api,
  type ModelInfo,
  type Session,
  type SessionFileRecord,
} from "../lib/api";
import type { ConnectionStatus } from "../lib/use-session-events";
import { cn } from "../lib/utils";
import {
  AttachmentsPicker,
  type ComposerAttachment,
} from "./chat/attachments-picker";
import { CommandsMenu, type SlashCommandItem } from "./chat/commands-menu";

export interface ChatInputProps {
  connectionStatus: ConnectionStatus;
  session: Session | null;
  models: ModelInfo[];
  modelsError?: string | null;
  commands: SlashCommandItem[];
  onSubmit: (
    message: string,
    options?: { images?: unknown[] },
  ) => Promise<void>;
  onRunSlashCommand: (command: string) => Promise<boolean>;
  onSetModel?: (
    provider: string,
    modelId: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  error: string | null;
}

function toModelValue(provider: string, modelId: string): string {
  return `${provider}::${modelId}`;
}

function fromModelValue(
  value: string,
): { provider: string; modelId: string } | null {
  const [provider, ...rest] = value.split("::");
  const modelId = rest.join("::");
  if (!provider || !modelId) return null;
  return { provider, modelId };
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

async function toRpcImagePayload(file: File): Promise<Record<string, unknown>> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    mimeType: file.type || "image/png",
    data: dataUrl,
  };
}

export function ChatInput({
  connectionStatus,
  session,
  models,
  modelsError,
  commands,
  onSubmit,
  onRunSlashCommand,
  onSetModel,
  error,
}: ChatInputProps) {
  const [inputText, setInputText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettingModel, setIsSettingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const disabled =
    connectionStatus !== "connected" || session?.status === "archived";
  const canSend = inputText.trim().length > 0 && !disabled && !isSubmitting;
  const slashQuery = inputText.startsWith("/") ? inputText.slice(1).trim() : "";

  const modelItems = useMemo(
    () =>
      models.map((model) => ({
        value: toModelValue(model.provider, model.id),
        label: model.name
          ? `${model.name} (${model.provider})`
          : `${model.id} (${model.provider})`,
      })),
    [models],
  );

  const filteredCommands = useMemo(() => {
    if (!slashQuery) return commands;
    return commands.filter((command) =>
      command.name.toLowerCase().includes(slashQuery.toLowerCase()),
    );
  }, [commands, slashQuery]);

  useEffect(() => {
    if (!session?.currentModelProvider || !session.currentModelId) return;
    setSelectedModel(
      toModelValue(session.currentModelProvider, session.currentModelId),
    );
  }, [session?.currentModelProvider, session?.currentModelId]);

  useEffect(() => {
    if (!modelError) return;
    const timer = window.setTimeout(() => setModelError(null), 3000);
    return () => window.clearTimeout(timer);
  }, [modelError]);

  const handleSubmit = async () => {
    if (!canSend) return;

    const slashOnly = inputText.trim().match(/^\/([a-z0-9_-]+)$/i);
    if (slashOnly) {
      const handled = await onRunSlashCommand(slashOnly[1] ?? "");
      if (handled) {
        setInputText("");
        return;
      }
    }

    const imagePayloads = await Promise.all(
      attachments
        .filter((item) => isImageFile(item.file))
        .map((item) => toRpcImagePayload(item.file)),
    );

    const nonImagePaths = attachments
      .filter((item) => !isImageFile(item.file) && item.sandboxPath)
      .map((item) => item.sandboxPath);

    const finalMessage =
      nonImagePaths.length > 0
        ? `${inputText.trim()}\n\nAttached files:\n${nonImagePaths.map((path) => `- ${path}`).join("\n")}`
        : inputText.trim();

    setIsSubmitting(true);
    try {
      await onSubmit(finalMessage, {
        images: imagePayloads.length > 0 ? imagePayloads : undefined,
      });
      setInputText("");
      setAttachments([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModelChange = async (value: string) => {
    const parsed = fromModelValue(value);
    if (!parsed || !session) return;

    const previous = selectedModel;
    setSelectedModel(value);
    setIsSettingModel(true);
    setModelError(null);

    const supportsRpcModelSwitch = typeof onSetModel === "function";

    if (!supportsRpcModelSwitch) {
      const fallback = await api.put<{ ok: boolean }>(
        `/sessions/${session.id}/model`,
        {
          provider: parsed.provider,
          modelId: parsed.modelId,
        },
      );

      if (fallback.error) {
        setSelectedModel(previous);
        setModelError(fallback.error);
      }

      setIsSettingModel(false);
      return;
    }

    const result = await onSetModel(parsed.provider, parsed.modelId);
    if (!result.ok) {
      setSelectedModel(previous);
      setModelError(result.error ?? "Failed to switch model");
    }

    setIsSettingModel(false);
  };

  const handlePickFiles = async (files: FileList | null) => {
    if (!files || !session) return;

    const incoming = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      uploadStatus: "pending" as const,
    }));

    setAttachments((prev) => [...prev, ...incoming]);

    for (const item of incoming) {
      if (isImageFile(item.file)) continue;

      const formData = new FormData();
      formData.append("file", item.file);
      const upload = await api.postForm<SessionFileRecord>(
        `/sessions/${session.id}/files`,
        formData,
      );

      setAttachments((prev) =>
        prev.map((attachment) => {
          if (attachment.id !== item.id) return attachment;
          if (upload.data) {
            return {
              ...attachment,
              uploadStatus: "uploaded",
              sandboxPath: upload.data.sandboxPath,
              error: upload.data.writeDeferred
                ? "Provider has no file-write capability. Open terminal and copy file manually, then include its path."
                : undefined,
            };
          }
          return {
            ...attachment,
            uploadStatus: "failed",
            error: upload.error ?? "Failed to upload file",
          };
        }),
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === "ArrowDown" &&
      filteredCommands.length > 0 &&
      inputText.startsWith("/")
    ) {
      e.preventDefault();
      setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length);
      return;
    }

    if (
      e.key === "ArrowUp" &&
      filteredCommands.length > 0 &&
      inputText.startsWith("/")
    ) {
      e.preventDefault();
      setSelectedCommandIndex(
        (prev) =>
          (prev - 1 + filteredCommands.length) % filteredCommands.length,
      );
      return;
    }

    if (
      e.key === "Tab" &&
      filteredCommands.length > 0 &&
      inputText.startsWith("/")
    ) {
      e.preventDefault();
      const selected =
        filteredCommands[selectedCommandIndex] ?? filteredCommands[0];
      if (selected) {
        setInputText(`/${selected.name} `);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const resizeTextarea = () => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: resize depends on input text content
  useEffect(resizeTextarea, [inputText]);

  return (
    <div className="flex-shrink-0 px-6 pb-4 pt-2 md:px-10">
      <div className="max-w-4xl mx-auto space-y-2">
        {inputText.startsWith("/") && (
          <CommandsMenu
            commands={commands}
            query={slashQuery}
            selectedIndex={selectedCommandIndex}
            onSelect={(command) => setInputText(`/${command.name} `)}
          />
        )}

        <div
          className={cn(
            "rounded-2xl border border-border bg-surface transition-colors",
            "focus-within:border-accent/50",
            disabled && "opacity-50",
          )}
        >
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Waiting for connection..." : "Reply..."}
            disabled={disabled}
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent px-4 pt-3 pb-1",
              "text-sm text-fg placeholder:text-muted",
              "focus:outline-none",
              "disabled:cursor-not-allowed",
            )}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {session?.environmentId ? (
                <a
                  href="/settings/environments"
                  className="inline-flex items-center rounded-md border border-border px-2 py-1 text-[11px] text-muted hover:text-fg"
                  title="Environment context"
                >
                  Env: {session.environmentId}
                </a>
              ) : null}
              <AttachmentsPicker
                attachments={attachments}
                onPick={(files) => void handlePickFiles(files)}
                onRemove={(id) =>
                  setAttachments((prev) =>
                    prev.filter((attachment) => attachment.id !== id),
                  )
                }
                disabled={disabled}
              />

              {modelItems.length > 0 ? (
                <SearchableSelect
                  value={selectedModel}
                  onValueChange={(value) => void handleModelChange(value)}
                  placeholder="Select model"
                  items={modelItems}
                  icon={<CaretDownIcon className="size-3" />}
                  className="h-8 max-w-[320px] text-xs"
                />
              ) : (
                <div className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted/70">
                  {session?.currentModelId || "Model"}
                  <CaretDownIcon className="size-3" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSend}
              className={cn(
                "flex size-7 items-center justify-center rounded-full transition-colors",
                canSend
                  ? "bg-accent text-accent-fg hover:bg-accent-hover"
                  : "bg-muted/20 text-muted/40 cursor-not-allowed",
              )}
              aria-label="Send message"
            >
              <ArrowUpIcon className="size-4" weight="bold" />
            </button>
          </div>
        </div>
        {modelsError && (
          <p className="mt-2 text-xs text-muted">
            Models unavailable: {modelsError}
          </p>
        )}
        {isSettingModel && (
          <p className="mt-2 text-xs text-muted">Switching model...</p>
        )}
        {modelError && (
          <p className="mt-2 text-xs text-status-err">{modelError}</p>
        )}
        {attachments.some((a) => a.error) && (
          <p className="mt-2 text-xs text-status-warn">
            {attachments.find((a) => a.error)?.error}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-status-err">{error}</p>}
      </div>
    </div>
  );
}
