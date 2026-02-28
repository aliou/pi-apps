import { ArrowUpIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchableSelect } from "../components/ui";
import { api, type ModelInfo, type Session } from "../lib/api";
import type { ConnectionStatus } from "../lib/use-session-events";
import { cn } from "../lib/utils";

export interface ChatInputProps {
  connectionStatus: ConnectionStatus;
  session: Session | null;
  models: ModelInfo[];
  modelsError?: string | null;
  onSubmit: (message: string) => void;
  onSetModel?: (provider: string, modelId: string) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  error: string | null;
}

function toModelValue(provider: string, modelId: string): string {
  return `${provider}::${modelId}`;
}

function fromModelValue(value: string): { provider: string; modelId: string } | null {
  const [provider, ...rest] = value.split("::");
  const modelId = rest.join("::");
  if (!provider || !modelId) return null;
  return { provider, modelId };
}

export function ChatInput({
  connectionStatus,
  session,
  models,
  modelsError,
  onSubmit,
  onSetModel,
  error,
}: ChatInputProps) {
  const [inputText, setInputText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettingModel, setIsSettingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const disabled = connectionStatus !== "connected" || session?.status === "archived";
  const canSend = inputText.trim().length > 0 && !disabled && !isSubmitting;

  const modelItems = useMemo(
    () =>
      models.map((model) => ({
        value: toModelValue(model.provider, model.id),
        label: model.name ? `${model.name} (${model.provider})` : `${model.id} (${model.provider})`,
      })),
    [models],
  );

  useEffect(() => {
    if (!session?.currentModelProvider || !session.currentModelId) return;
    setSelectedModel(toModelValue(session.currentModelProvider, session.currentModelId));
  }, [session?.currentModelProvider, session?.currentModelId]);

  useEffect(() => {
    if (!modelError) return;
    const timer = window.setTimeout(() => setModelError(null), 3000);
    return () => window.clearTimeout(timer);
  }, [modelError]);

  const handleSubmit = () => {
    if (!canSend) return;
    const message = inputText.trim();
    setInputText("");
    setIsSubmitting(true);
    onSubmit(message);
    setTimeout(() => setIsSubmitting(false), 500);
  };

  const handleModelChange = async (value: string) => {
    const parsed = fromModelValue(value);
    if (!parsed || !session) return;

    const previous = selectedModel;
    setSelectedModel(value);
    setIsSettingModel(true);
    setModelError(null);

    // Runtime guard: only send model switch if session supports RPC setter path.
    const supportsRpcModelSwitch = typeof onSetModel === "function";

    if (!supportsRpcModelSwitch) {
      const fallback = await api.put<{ ok: boolean }>(`/sessions/${session.id}/model`, {
        provider: parsed.provider,
        modelId: parsed.modelId,
      });

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const resizeTextarea = () => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: resize depends on inputText content
  useEffect(resizeTextarea, [inputText]);

  return (
    <div className="flex-shrink-0 px-6 pb-4 pt-2 md:px-10">
      <div className="max-w-4xl mx-auto">
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
          <div className="flex items-center justify-between gap-3 px-3 pb-2">
            <div className="min-w-0 flex-1">
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
              onClick={handleSubmit}
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
        {modelsError && <p className="mt-2 text-xs text-muted">Models unavailable: {modelsError}</p>}
        {isSettingModel && <p className="mt-2 text-xs text-muted">Switching model...</p>}
        {modelError && <p className="mt-2 text-xs text-status-err">{modelError}</p>}
        {error && <p className="mt-2 text-xs text-status-err">{error}</p>}
      </div>
    </div>
  );
}
