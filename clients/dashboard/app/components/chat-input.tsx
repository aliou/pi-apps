import { PaperPlaneTiltIcon, XIcon } from "@phosphor-icons/react";
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

  const handleSubmit = () => {
    if (
      !inputText.trim() ||
      connectionStatus !== "connected" ||
      isSubmitting ||
      session?.status === "archived"
    )
      return;

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
    <div className="flex-shrink-0 border-t border-border bg-surface px-6 py-4 md:px-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                connectionStatus === "connected"
                  ? "Type a message... (Enter to send, Shift+Enter for newline)"
                  : "Waiting for connection..."
              }
              disabled={
                connectionStatus !== "connected" ||
                session?.status === "archived"
              }
              rows={1}
              className={cn(
                "w-full resize-none rounded-xl border border-border bg-bg px-4 py-3 pr-10",
                "text-sm text-fg placeholder:text-muted",
                "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
            {inputText && (
              <button
                type="button"
                onClick={() => setInputText("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-fg"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              !inputText.trim() ||
              connectionStatus !== "connected" ||
              isSubmitting ||
              session?.status === "archived"
            }
            className={cn(
              "flex-shrink-0 p-3 rounded-xl transition-colors",
              "bg-accent text-accent-fg",
              "hover:bg-accent-hover",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <PaperPlaneTiltIcon className="w-5 h-5" weight="fill" />
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-status-err">{error}</p>}
      </div>
    </div>
  );
}
