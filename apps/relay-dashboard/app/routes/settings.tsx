import {
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  FloppyDiskIcon,
  InfoIcon,
  KeyIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface SecretInfo {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  keyVersion: number;
}

// Known secrets with their display info (provider API keys only)
// GitHub token for repo access is managed separately via /github-setup
const SECRET_CONFIG: Record<
  string,
  { label: string; placeholder: string; description: string }
> = {
  anthropic_api_key: {
    label: "Anthropic",
    placeholder: "sk-ant-api03-...",
    description: "Claude models (claude-3.5-sonnet, claude-3-opus, etc.)",
  },
  openai_api_key: {
    label: "OpenAI",
    placeholder: "sk-proj-...",
    description: "GPT models (gpt-4o, gpt-4-turbo, o1, etc.)",
  },
  gemini_api_key: {
    label: "Google Gemini",
    placeholder: "AIza...",
    description: "Gemini models (gemini-2.0-flash, gemini-1.5-pro, etc.)",
  },
  groq_api_key: {
    label: "Groq",
    placeholder: "gsk_...",
    description: "Fast inference (llama, mixtral, etc.)",
  },
  deepseek_api_key: {
    label: "DeepSeek",
    placeholder: "sk-...",
    description: "DeepSeek models (deepseek-chat, deepseek-coder)",
  },
  openrouter_api_key: {
    label: "OpenRouter",
    placeholder: "sk-or-v1-...",
    description: "Access to multiple providers via OpenRouter",
  },
};

function SecretRow({
  id,
  configured,
  onSave,
  onDelete,
}: {
  id: string;
  configured: boolean;
  onSave: (id: string, value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const config = SECRET_CONFIG[id] ?? {
    label: id,
    placeholder: "",
    description: "",
  };

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(id, value.trim());
      setValue("");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove ${config.label}?`)) return;
    setDeleting(true);
    try {
      await onDelete(id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-surface/30 p-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-fg">{config.label}</span>
          {configured ? (
            <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-500">
              <CheckCircleIcon className="size-3" weight="fill" />
              Configured
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
              <WarningCircleIcon className="size-3" weight="fill" />
              Not set
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">{config.description}</p>

        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <input
              type={showValue ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={configured ? "(unchanged)" : config.placeholder}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 pr-10 font-mono text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
            >
              {showValue ? (
                <EyeSlashIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!value.trim() || saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <FloppyDiskIcon className="size-4" />
            {saving ? "Saving..." : "Save"}
          </button>

          {configured && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              <TrashIcon className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [secrets, setSecrets] = useState<SecretInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSecrets = useCallback(async () => {
    const res = await api.get<SecretInfo[]>("/secrets");
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setSecrets(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const handleSave = async (id: string, value: string) => {
    const res = await api.put<{ ok: boolean }>(`/secrets/${id}`, { value });
    if (res.error) {
      alert(`Failed to save: ${res.error}`);
    } else {
      await loadSecrets();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await api.delete<{ ok: boolean }>(`/secrets/${id}`);
    if (res.error) {
      alert(`Failed to delete: ${res.error}`);
    } else {
      await loadSecrets();
    }
  };

  const configuredIds = new Set(secrets.map((s) => s.id));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-fg">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          API keys and server configuration.
        </p>
      </div>

      {/* API Keys Section */}
      <div className="rounded-xl border border-border bg-surface/50 p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
          <KeyIcon className="size-[18px]" weight="bold" />
          LLM API Keys
        </h2>
        <p className="mb-5 text-xs text-muted">
          Keys are encrypted at rest (AES-256-GCM) and injected into sandbox
          containers.
        </p>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted">Loading...</div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">
            {error}
          </div>
        ) : (
          <div className="space-y-3">
            {Object.keys(SECRET_CONFIG).map((id) => (
              <SecretRow
                key={id}
                id={id}
                configured={configuredIds.has(id)}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Server info */}
      <div className="mt-6 rounded-xl border border-border bg-surface/50 p-5">
        <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-fg">
          <InfoIcon className="size-[18px]" weight="bold" />
          Server Information
        </h2>

        <dl className="space-y-4">
          <div>
            <dt className="text-xs font-medium text-muted">Version</dt>
            <dd className="mt-1 font-mono text-sm text-fg">0.1.0</dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted">Secrets</dt>
            <dd className="mt-1 text-sm text-green-500">
              Enabled (AES-256-GCM encrypted)
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
