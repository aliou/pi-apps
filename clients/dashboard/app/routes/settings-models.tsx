import { useEffect, useMemo, useState } from "react";
import { Button, Select } from "../components/ui";
import { api, type ModelInfo } from "../lib/api";

interface SessionDefaults {
  chat?: { modelProvider?: string; modelId?: string };
  code?: { modelProvider?: string; modelId?: string };
}

interface ModeModelFormProps {
  title: string;
  models: ModelInfo[];
  value: { modelProvider: string; modelId: string };
  onChange: (value: { modelProvider: string; modelId: string }) => void;
}

function ModeModelForm({ title, models, value, onChange }: ModeModelFormProps) {
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
        <div>
          <span className="mb-1 block text-xs text-muted">Provider</span>
          <Select
            value={value.modelProvider}
            onValueChange={(modelProvider) => onChange({ modelProvider, modelId: "" })}
            placeholder="Select provider"
            items={providers.map((provider) => ({
              value: provider,
              label: provider,
            }))}
            renderItem={(item) => (
              <div>
                <p className="truncate">{item.label}</p>
              </div>
            )}
          />
        </div>

        <div>
          <span className="mb-1 block text-xs text-muted">Model</span>
          <Select
            value={value.modelId}
            onValueChange={(modelId) =>
              onChange({ modelProvider: value.modelProvider, modelId })
            }
            disabled={!value.modelProvider}
            placeholder="Select model"
            items={modelsForProvider.map((model) => ({
              value: model.modelId,
              label: model.name ?? model.modelId,
              description:
                model.name && model.name !== model.modelId ? model.modelId : undefined,
            }))}
            renderItem={(item) => (
              <div>
                <p className="truncate">{item.label}</p>
                {item.description && (
                  <p className="truncate text-xs text-muted">{item.description}</p>
                )}
              </div>
            )}
          />
        </div>
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
            title="Chat default"
            models={models}
            value={chatDefault}
            onChange={setChatDefault}
          />
          <ModeModelForm
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
