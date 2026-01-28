import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  LockKeyIcon,
  SpinnerIcon,
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
      <div className="flex items-center justify-center py-16">
        <SpinnerIcon className="size-8 animate-spin text-(--color-muted-foreground)" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold">GitHub Setup</h1>
      <p className="mb-8 text-(--color-muted-foreground)">
        Configure a GitHub Personal Access Token to access your repositories.
      </p>

      {tokenInfo?.configured ? (
        <div className="space-y-6">
          {/* Token status */}
          <div className="rounded-lg border border-(--color-border) bg-(--color-card) p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {tokenInfo.valid ? (
                  <CheckCircleIcon className="size-8 text-green-500" weight="fill" />
                ) : (
                  <WarningCircleIcon className="size-8 text-red-500" weight="fill" />
                )}
                <div>
                  <h3 className="font-medium">
                    {tokenInfo.valid ? "Token configured" : "Token invalid"}
                  </h3>
                  {tokenInfo.valid && tokenInfo.user && (
                    <p className="text-sm text-(--color-muted-foreground)">
                      Authenticated as <strong>{tokenInfo.user}</strong>
                    </p>
                  )}
                  {!tokenInfo.valid && tokenInfo.error && (
                    <p className="text-sm text-red-600 dark:text-red-400">{tokenInfo.error}</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleRemoveToken}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <TrashIcon className="size-4" />
                Remove
              </button>
            </div>

            {tokenInfo.valid && tokenInfo.scopes && tokenInfo.scopes.length > 0 && (
              <div className="mt-4 border-t border-(--color-border) pt-4">
                <p className="mb-2 text-sm font-medium">Scopes</p>
                <div className="flex flex-wrap gap-1">
                  {tokenInfo.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded bg-(--color-muted) px-2 py-0.5 text-xs"
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
              <h2 className="mb-4 text-lg font-medium">Accessible Repositories</h2>
              {reposLoading ? (
                <div className="flex items-center gap-2 text-(--color-muted-foreground)">
                  <SpinnerIcon className="size-4 animate-spin" />
                  Loading repositories...
                </div>
              ) : repos.length === 0 ? (
                <p className="text-(--color-muted-foreground)">No repositories found.</p>
              ) : (
                <div className="space-y-2">
                  {repos.slice(0, 10).map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-card) p-3"
                    >
                      <div className="flex items-center gap-3">
                        {repo.isPrivate && (
                          <LockKeyIcon className="size-4 text-(--color-muted-foreground)" />
                        )}
                        <div>
                          <p className="font-medium">{repo.fullName}</p>
                          {repo.description && (
                            <p className="text-sm text-(--color-muted-foreground) line-clamp-1">
                              {repo.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <a
                        href={repo.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--color-muted-foreground) hover:text-(--color-foreground)"
                      >
                        <ArrowSquareOutIcon className="size-5" />
                      </a>
                    </div>
                  ))}
                  {repos.length > 10 && (
                    <p className="text-sm text-(--color-muted-foreground)">
                      And {repos.length - 10} more...
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Instructions */}
          <div className="rounded-lg border border-(--color-border) bg-(--color-card) p-4">
            <h3 className="mb-3 font-medium">Create a Personal Access Token</h3>
            <ol className="mb-4 list-inside list-decimal space-y-2 text-sm text-(--color-muted-foreground)">
              <li>
                Go to{" "}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-(--color-accent) underline"
                >
                  GitHub Token Settings
                </a>
              </li>
              <li>Click "Generate new token" and select "Fine-grained token"</li>
              <li>Set expiration and select repositories to access</li>
              <li>
                Under "Permissions", grant:
                <ul className="ml-4 mt-1 list-disc">
                  <li>Contents: Read and write</li>
                  <li>Metadata: Read-only</li>
                </ul>
              </li>
              <li>Generate and copy the token</li>
            </ol>
            <a
              href="https://github.com/settings/tokens?type=beta"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
                "bg-(--color-muted) hover:bg-(--color-border)",
              )}
            >
              <ArrowSquareOutIcon className="size-4" />
              Open GitHub Settings
            </a>
          </div>

          {/* Token form */}
          <div className="rounded-lg border border-(--color-border) bg-(--color-card) p-4">
            <TokenForm onSubmit={handleSubmitToken} isLoading={submitting} />
          </div>
        </div>
      )}
    </div>
  );
}
