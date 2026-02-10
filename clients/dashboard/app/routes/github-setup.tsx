import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  LockKeyIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { TokenForm } from "../components/token-form";
import { api, type GitHubRepo, type GitHubTokenInfo } from "../lib/api";
import { cn } from "../lib/utils";

export default function GitHubSetupPage() {
  const [tokenInfo, setTokenInfo] = useState<GitHubTokenInfo | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reposLoading, setReposLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchTokenInfo = useCallback(async () => {
    setLoading(true);
    const result = await api.get<GitHubTokenInfo>("/github/token");
    if (!result.error) {
      setTokenInfo(result.data);
    }
    setLoading(false);
  }, []);

  const fetchRepos = useCallback(async () => {
    setReposLoading(true);
    const result = await api.get<GitHubRepo[]>("/github/repos");
    if (!result.error && result.data) {
      setRepos(result.data);
    }
    setReposLoading(false);
  }, []);

  useEffect(() => {
    fetchTokenInfo();
  }, [fetchTokenInfo]);

  useEffect(() => {
    if (tokenInfo?.configured && tokenInfo?.valid) {
      fetchRepos();
    }
  }, [tokenInfo, fetchRepos]);

  const handleSubmitToken = async (
    token: string,
  ): Promise<{ success: boolean; error?: string }> => {
    setSubmitting(true);
    const result = await api.post<{ user: string; scopes: string[] }>(
      "/github/token",
      { token },
    );
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
      <div className="flex items-center justify-center py-24">
        <CircleNotchIcon className="size-7 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div>
      {tokenInfo?.configured ? (
        <div className="space-y-8">
          {/* Token status */}
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {tokenInfo.valid ? (
                  <CheckCircleIcon
                    className="size-6 text-status-ok"
                    weight="fill"
                  />
                ) : (
                  <WarningCircleIcon
                    className="size-6 text-status-err"
                    weight="fill"
                  />
                )}
                <div>
                  <p className="text-sm font-medium text-fg">
                    {tokenInfo.valid ? "Token configured" : "Token invalid"}
                  </p>
                  {tokenInfo.valid && tokenInfo.user && (
                    <p className="mt-0.5 text-sm text-muted">
                      Authenticated as{" "}
                      <span className="font-mono text-accent">
                        {tokenInfo.user}
                      </span>
                    </p>
                  )}
                  {!tokenInfo.valid && tokenInfo.error && (
                    <p className="mt-0.5 text-sm text-status-err">
                      {tokenInfo.error}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveToken}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  "text-destructive/70 hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <TrashIcon className="size-4" />
                Remove
              </button>
            </div>

            {tokenInfo.valid &&
              tokenInfo.scopes &&
              tokenInfo.scopes.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-xs font-medium text-muted">Scopes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tokenInfo.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="rounded-md bg-surface px-2 py-1 font-mono text-xs text-muted"
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
              <h2 className="mb-4 text-sm font-semibold text-fg">
                Repositories
              </h2>
              {reposLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <CircleNotchIcon className="size-4 animate-spin" />
                  Loading...
                </div>
              ) : repos.length === 0 ? (
                <p className="text-sm text-muted">No repositories found.</p>
              ) : (
                <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border">
                  {repos.slice(0, 10).map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between bg-surface/50 px-4 py-3 transition-colors hover:bg-surface"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {repo.isPrivate && (
                          <LockKeyIcon className="size-4 shrink-0 text-muted/50" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fg">
                            {repo.fullName}
                          </p>
                          {repo.description && (
                            <p className="mt-0.5 truncate text-xs text-muted">
                              {repo.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <a
                        href={repo.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted/50 transition-colors hover:text-fg"
                      >
                        <ArrowSquareOutIcon className="size-[18px]" />
                      </a>
                    </div>
                  ))}
                  {repos.length > 10 && (
                    <div className="bg-surface/30 px-4 py-2.5 text-xs text-muted">
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
          <div>
            <h3 className="mb-3 text-sm font-semibold text-fg">
              Create a Personal Access Token
            </h3>
            <ol className="mb-5 list-inside list-decimal space-y-2 text-sm text-muted">
              <li>
                Go to{" "}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                >
                  GitHub Token Settings
                </a>
              </li>
              <li>Click &ldquo;Generate new token&rdquo; (fine-grained)</li>
              <li>Set expiration and select repositories</li>
              <li>
                Grant permissions:
                <span className="ml-1 font-mono text-xs text-accent">
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
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                "bg-surface text-fg hover:bg-surface-hover",
              )}
            >
              <ArrowSquareOutIcon className="size-4" />
              Open GitHub Settings
            </a>
          </div>

          {/* Token form */}
          <div>
            <TokenForm onSubmit={handleSubmitToken} isLoading={submitting} />
          </div>
        </div>
      )}
    </div>
  );
}
