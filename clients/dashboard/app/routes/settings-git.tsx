import {
  CheckCircleIcon,
  FloppyDiskIcon,
  GitBranchIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/ui";
import { api } from "../lib/api";

export default function SettingsGitPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get<Record<string, unknown>>("/settings");
    if (res.data) {
      setName((res.data.git_author_name as string) ?? "");
      setEmail((res.data.git_author_email as string) ?? "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    const nameRes = await api.put<{ ok: boolean }>("/settings", {
      key: "git_author_name",
      value: name,
    });
    if (nameRes.error) {
      setError(nameRes.error);
      setSaving(false);
      return;
    }

    const emailRes = await api.put<{ ok: boolean }>("/settings", {
      key: "git_author_email",
      value: email,
    });
    if (emailRes.error) {
      setError(emailRes.error);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <GitBranchIcon className="size-5" weight="bold" />
          Git
        </h2>
        <p className="mt-1 text-sm text-muted">
          Author identity used for commits inside sandboxes. Defaults to
          "pi-sandbox" if left empty.
        </p>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted">Loading...</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="git-name"
              className="mb-1 block text-sm font-medium text-fg"
            >
              Author name
            </label>
            <input
              id="git-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="pi-sandbox"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="git-email"
              className="mb-1 block text-sm font-medium text-fg"
            >
              Author email
            </label>
            <input
              id="git-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pi-sandbox@noreply.github.com"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                "Saving..."
              ) : saved ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircleIcon className="size-4" weight="bold" />
                  Saved
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <FloppyDiskIcon className="size-4" weight="bold" />
                  Save
                </span>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
