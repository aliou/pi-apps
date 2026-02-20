import { ArrowUpIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Session } from "../lib/api";
import type { ConnectionStatus } from "../lib/use-session-events";
import { cn } from "../lib/utils";

export interface ChatInputProps {
  connectionStatus: ConnectionStatus;
  session: Session | null;
  onSubmit: (message: string) => void;
  error: string | null;
}

export function ChatInput({
  connectionStatus,
  session,
  onSubmit,
  error,
}: ChatInputProps) {
  const [inputText, setInputText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const disabled = connectionStatus !== "connected" || session?.status === "archived";
  const canSend = inputText.trim().length > 0 && !disabled && !isSubmitting;

  const handleSubmit = () => {
    if (!canSend) return;
    const message = inputText.trim();
    setInputText("");
    setIsSubmitting(true);
    onSubmit(message);
    setTimeout(() => setIsSubmitting(false), 500);
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
        <div className={cn(
          "rounded-2xl border border-border bg-surface transition-colors",
          "focus-within:border-accent/50",
          disabled && "opacity-50",
        )}>
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
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-1">
              {/* Model selector - disabled placeholder for now */}
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted/60 cursor-not-allowed"
              >
                {session?.currentModelId || "Model"}
                <CaretDownIcon className="size-3" />
              </button>
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
        {error && <p className="mt-2 text-xs text-status-err">{error}</p>}
      </div>
    </div>
  );
}
