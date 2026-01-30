import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  LockKeyIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { TokenForm } from "../components/token-form";
import { type GitHubRepo, type GitHubTokenInfo, api } from "../lib/api";
import { cn } from "../lib/utils";

export function GitHubSetupPage() {
  const [tokenInfo, setTokenInfo] = useState<GitHubTokenInfo | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reposLoading, setReposLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchTokenInfo = async () => {
    setLoading(true);
    const result = await api.get<GitHubTokenInfo>("/github/token");
    if (!result.error) {
      setTokenInfo(result.data);
    }
    setLoading(false);
  };

  const fetchRepos = async () => {
    setReposLoading(true);
    const result = await api.get<GitHubRepo[]>("/github/repos");
    if (!result.error && result.data) {
      setRepos(result.data);
    }
    setReposLoading(false);
  };

  useEffect(() => {
    fetchTokenInfo();
  }, []);

  useEffect(() => {
    if (tokenInfo?.configured && tokenInfo?.valid) {
      fetchRepos();
    }
  }, [tokenInfo]);

  const handleSubmitToken = async (token: string): Promise<{ success: boolean; error?: string }> => {
    setSubmitting(true);
    const result = await api.post<{ user: string; scopes: string[] }>("/github/token", { token });
    setSubmitting(false);

    if (result.error) {
      return { success: false, error: result.error };
    }

    await fetchTokenInfo();
    return { success: true };
  };

  const handleRemoveToken = async () => {
    await api.delete("/github/token");
    setTokenInfo({ configured: false });
    setRepos([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <CircleNotchIcon className="size-6 animate-spin text-(--color-muted)" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-(--color-foreground)">GitHub</h1>
        <p className="text-sm text-(--color-muted)">
          Configure a Personal Access Token to access repositories.
        </p>
      </div>

      {tokenInfo?.configured ? (
        <div className="space-y-6">
          {/* Token status */}
          <div className="rounded-lg border border-(--color-border) bg-(--color-surface)/50 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {tokenInfo.valid ? (
                  <CheckCircleIcon className="size-5 text-(--color-status-ok)" weight="fill" />
                ) : (
                  <WarningCircleIcon className="size-5 text-(--color-status-err)" weight="fill" />
                )}
                <div>
                  <p className="text-sm font-medium text-(--color-foreground)">
                    {tokenInfo.valid ? "Token configured" : "Token invalid"}
                  </p>
                  {tokenInfo.valid && tokenInfo.user && (
                    <p className="text-xs text-(--color-muted)">
                      Authenticated as{" "}
                      <span className="font-mono text-(--color-accent)">{tokenInfo.user}</span>
                    </p>
                  )}
                  {!tokenInfo.valid && tokenInfo.error && (
                    <p className="text-xs text-(--color-status-err)">{tokenInfo.error}</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleRemoveToken}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                  "text-(--color-status-err)/70 hover:bg-(--color-status-err)/10 hover:text-(--color-status-err)",
                )}
              >
                <TrashIcon className="size-3.5" />
                Remove
              </button>
            </div>

            {tokenInfo.valid && tokenInfo.scopes && tokenInfo.scopes.length > 0 && (
              <div className="mt-3 border-t border-(--color-border) pt-3">
                <p className="mb-1.5 text-xs font-medium text-(--color-muted)">Scopes</p>
                <div className="flex flex-wrap gap-1">
                  {tokenInfo.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded bg-(--color-surface) px-1.5 py-0.5 font-mono text-xs text-(--color-muted)"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Repos list */}
          {tokenInfo.valid && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-(--color-foreground)">
                Repositories
              </h2>
              {reposLoading ? (
                <div className="flex items-center gap-2 text-sm text-(--color-muted)">
                  <CircleNotchIcon className="size-3.5 animate-spin" />
                  Loading...
                </div>
              ) : repos.length === 0 ? (
                <p className="text-sm text-(--color-muted)">No repositories found.</p>
              ) : (
                <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-(--color-border)">
                  {repos.slice(0, 10).map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between bg-(--color-surface)/50 px-3 py-2.5 transition-colors hover:bg-(--color-surface)"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {repo.isPrivate && (
                          <LockKeyIcon className="size-3.5 shrink-0 text-(--color-muted)/60" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-(--color-foreground)">
                            {repo.fullName}
                          </p>
                          {repo.description && (
                            <p className="truncate text-xs text-(--color-muted)">
                              {repo.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <a
                        href={repo.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-(--color-muted)/60 transition-colors hover:text-(--color-foreground)"
                      >
                        <ArrowSquareOutIcon className="size-4" />
                      </a>
                    </div>
                  ))}
                  {repos.length > 10 && (
                    <div className="bg-(--color-surface)/30 px-3 py-2 text-xs text-(--color-muted)">
                      And {repos.length - 10} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Instructions */}
          <div className="rounded-lg border border-(--color-border) bg-(--color-surface)/50 p-4">
            <h3 className="mb-3 text-sm font-medium text-(--color-foreground)">
              Create a Personal Access Token
            </h3>
            <ol className="mb-4 list-inside list-decimal space-y-1.5 text-sm text-(--color-muted)">
              <li>
                Go to{" "}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-(--color-accent) underline decoration-(--color-accent)/30 underline-offset-2 hover:decoration-(--color-accent)"
                >
                  GitHub Token Settings
                </a>
              </li>
              <li>Click &ldquo;Generate new token&rdquo; (fine-grained)</li>
              <li>Set expiration and select repositories</li>
              <li>
                Grant permissions:
                <span className="ml-1 font-mono text-xs text-(--color-accent)">
                  contents:rw metadata:r
                </span>
              </li>
              <li>Generate and paste below</li>
            </ol>
            <a
              href="https://github.com/settings/tokens?type=beta"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                "bg-(--color-surface) text-(--color-foreground) hover:bg-(--color-surface-hover)",
              )}
            >
              <ArrowSquareOutIcon className="size-3.5" />
              Open GitHub Settings
            </a>
          </div>

          {/* Token form */}
          <div className="rounded-lg border border-(--color-border) bg-(--color-surface)/50 p-4">
            <TokenForm onSubmit={handleSubmitToken} isLoading={submitting} />
          </div>
        </div>
      )}
    </div>
  );
}
