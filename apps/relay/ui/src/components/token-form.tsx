import { CheckCircleIcon, SpinnerIcon, WarningCircleIcon } from "@phosphor-icons/react";
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="token" className="mb-2 block text-sm font-medium">
          Personal Access Token
        </label>
        <input
          id="token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          className={cn(
            "w-full rounded-lg border border-(--color-border) bg-(--color-background) px-3 py-2",
            "focus:border-(--color-accent) focus:outline-none focus:ring-1 focus:ring-(--color-accent)",
            "placeholder:text-(--color-muted-foreground)",
          )}
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <WarningCircleIcon className="size-4" weight="fill" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircleIcon className="size-4" weight="fill" />
          Token saved successfully
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || !token.trim()}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors",
          "bg-(--color-accent) text-(--color-accent-foreground)",
          "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {isLoading && <SpinnerIcon className="size-4 animate-spin" />}
        Save Token
      </button>
    </form>
  );
}
