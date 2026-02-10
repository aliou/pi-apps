import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui";
import { api, type ModelInfo } from "../lib/api";

interface SessionDefaults {
  chat?: { modelProvider?: string; modelId?: string };
  code?: { modelProvider?: string; modelId?: string };
}

interface ModeModelFormProps {
  mode: "chat" | "code";
  title: string;
  models: ModelInfo[];
  value: { modelProvider: string; modelId: string };
  onChange: (value: { modelProvider: string; modelId: string }) => void;
}

function ModeModelForm({
  mode,
  title,
  models,
  value,
  onChange,
}: ModeModelFormProps) {
  const providers = useMemo(
    () => Array.from(new Set(models.map((m) => m.provider))).sort(),
    [models],
  );

  const modelsForProvider = useMemo(
    () => models.filter((m) => m.provider === value.modelProvider),
    [models, value.modelProvider],
  );

  return (
    <div className="rounded-lg border border-border bg-surface/30 p-4">
      <h3 className="mb-3 text-sm font-semibold text-fg">{title}</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Provider</span>
          <select
            value={value.modelProvider}
            onChange={(e) =>
              onChange({ modelProvider: e.target.value, modelId: "" })
            }
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
          >
            <option value="">Select provider</option>
            {providers.map((provider) => (
              <option key={`${mode}-${provider}`} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-muted">Model</span>
          <select
            value={value.modelId}
            onChange={(e) =>
              onChange({ modelProvider: value.modelProvider, modelId: e.target.value })
            }
            disabled={!value.modelProvider}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none disabled:opacity-50"
          >
            <option value="">Select model</option>
            {modelsForProvider.map((model) => (
              <option
                key={`${mode}-${model.provider}-${model.modelId}`}
                value={model.modelId}
              >
                {model.name ?? model.modelId}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export default function SettingsModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatDefault, setChatDefault] = useState({
    modelProvider: "",
    modelId: "",
  });
  const [codeDefault, setCodeDefault] = useState({
    modelProvider: "",
    modelId: "",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [modelsRes, settingsRes] = await Promise.all([
        api.get<ModelInfo[]>("/models"),
        api.get<Record<string, unknown>>("/settings"),
      ]);

      if (modelsRes.error) {
        setError(modelsRes.error);
      } else {
        setModels(modelsRes.data ?? []);
      }

      if (settingsRes.error) {
        setError(settingsRes.error);
      } else if (settingsRes.data) {
        const defaults = settingsRes.data.session_defaults as
          | SessionDefaults
          | undefined;
        if (defaults?.chat) {
          setChatDefault({
            modelProvider: defaults.chat.modelProvider ?? "",
            modelId: defaults.chat.modelId ?? "",
          });
        }
        if (defaults?.code) {
          setCodeDefault({
            modelProvider: defaults.code.modelProvider ?? "",
            modelId: defaults.code.modelId ?? "",
          });
        }
      }

      setLoading(false);
    };

    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const payload: SessionDefaults = {
      chat:
        chatDefault.modelProvider && chatDefault.modelId
          ? {
              modelProvider: chatDefault.modelProvider,
              modelId: chatDefault.modelId,
            }
          : undefined,
      code:
        codeDefault.modelProvider && codeDefault.modelId
          ? {
              modelProvider: codeDefault.modelProvider,
              modelId: codeDefault.modelId,
            }
          : undefined,
    };

    const res = await api.put<{ ok: boolean }>("/settings", {
      key: "session_defaults",
      value: payload,
    });

    if (res.error) {
      setError(res.error);
    }

    setSaving(false);
  };

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-fg">Default models</h2>
        <p className="mt-1 text-xs text-muted">
          Set default model per mode for new sessions.
        </p>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted">Loading...</div>
      ) : (
        <div className="space-y-3">
          <ModeModelForm
            mode="chat"
            title="Chat default"
            models={models}
            value={chatDefault}
            onChange={setChatDefault}
          />
          <ModeModelForm
            mode="code"
            title="Code default"
            models={models}
            value={codeDefault}
            onChange={setCodeDefault}
          />

          {models.length === 0 && (
            <p className="text-xs text-muted">
              No models available yet. Configure AI provider keys first.
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-status-err/20 bg-status-err/5 px-3 py-2 text-sm text-status-err">
              {error}
            </div>
          )}

          <div className="pt-1">
            <Button onClick={handleSave} loading={saving} variant="primary">
              Save defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
