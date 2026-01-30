import { CheckCircleIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "../lib/utils";

interface TokenFormProps {
  onSubmit: (token: string) => Promise<{ success: boolean; error?: string }>;
  isLoading?: boolean;
}

export function TokenForm({ onSubmit, isLoading = false }: TokenFormProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const result = await onSubmit(token.trim());
    if (result.success) {
      setSuccess(true);
      setToken("");
    } else {
      setError(result.error || "Failed to save token");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="token" className="mb-2 block text-sm font-medium text-(--color-fg)">
          Personal Access Token
        </label>
        <input
          id="token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          className={cn(
            "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3.5 py-2.5 font-mono text-sm",
            "text-(--color-fg) placeholder:text-(--color-muted)/40",
            "focus:border-(--color-accent) focus:outline-hidden focus:ring-1 focus:ring-(--color-accent)",
            "transition-colors",
          )}
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-(--color-status-err)">
          <WarningCircleIcon className="size-4 shrink-0" weight="fill" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm text-(--color-status-ok)">
          <CheckCircleIcon className="size-4 shrink-0" weight="fill" />
          Token saved
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || !token.trim()}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors",
          "bg-(--color-accent) text-(--color-accent-fg)",
          "hover:bg-(--color-accent-hover)",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        {isLoading && <CircleNotchIcon className="size-4 animate-spin" />}
        Save Token
      </button>
    </form>
  );
}
