import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, SearchableSelect } from "../components/ui";
import {
  api,
  type Environment,
  type ModelInfo,
  type ModelsIntrospectionSetting,
  type ModelsResponse,
} from "../lib/api";

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
        <div className="space-y-1">
          <span className="block text-xs text-muted">Provider</span>
          <SearchableSelect
            value={value.modelProvider}
            onValueChange={(modelProvider) =>
              onChange({ modelProvider, modelId: "" })
            }
            placeholder="Select provider"
            items={providers.map((provider) => ({
              value: provider,
              label: provider,
            }))}
          />
        </div>

        <div className="space-y-1">
          <span className="block text-xs text-muted">Model</span>
          <SearchableSelect
            value={value.modelId}
            onValueChange={(modelId) =>
              onChange({ modelProvider: value.modelProvider, modelId })
            }
            placeholder="Select model"
            items={modelsForProvider.map((model) => ({
              value: model.id,
              label: model.name ?? model.id,
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function formatSource(source: ModelsResponse["source"] | null): string {
  if (!source) return "unknown";
  switch (source) {
    case "configured-environment":
      return "configured env";
    case "fallback-environment":
      return "fallback env";
    case "fallback-cache":
      return "cache";
    case "fallback-static":
      return "static fallback";
    default:
      return source;
  }
}

export default function SettingsModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsSource, setModelsSource] =
    useState<ModelsResponse["source"] | null>(null);
  const [modelsEnvironmentId, setModelsEnvironmentId] = useState<
    string | undefined
  >(undefined);

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [introspectionEnvironmentId, setIntrospectionEnvironmentId] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatDefault, setChatDefault] = useState({
    modelProvider: "",
    modelId: "",
  });
  const [codeDefault, setCodeDefault] = useState({
    modelProvider: "",
    modelId: "",
  });

  const loadModels = useCallback(async () => {
    const modelsRes = await api.get<ModelsResponse>("/models");
    if (modelsRes.data) {
      setModels(modelsRes.data.models ?? []);
      setModelsSource(modelsRes.data.source ?? null);
      setModelsEnvironmentId(modelsRes.data.environmentId);
    }
    return modelsRes;
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [modelsRes, settingsRes, environmentsRes] = await Promise.all([
        loadModels(),
        api.get<Record<string, unknown>>("/settings"),
        api.get<Environment[]>("/environments"),
      ]);

      const nextError =
        modelsRes.error ?? environmentsRes.error ?? settingsRes.error ?? null;
      setError(nextError);

      if (!environmentsRes.error) {
        setEnvironments(environmentsRes.data ?? []);
      }

      if (settingsRes.data) {
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

        const introspection = settingsRes.data.models_introspection as
          | ModelsIntrospectionSetting
          | undefined;
        setIntrospectionEnvironmentId(introspection?.environmentId ?? "");
      }

      setLoading(false);
    };

    load();
  }, [loadModels]);

  const handleRefreshModels = async () => {
    setRefreshingModels(true);
    setError(null);

    const refreshRes = await api.post<{ ok: boolean }>("/models/refresh", {});
    if (refreshRes.error) {
      setError(refreshRes.error);
      setRefreshingModels(false);
      return;
    }

    const modelsRes = await loadModels();
    setError(modelsRes.error);
    setRefreshingModels(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const defaultsPayload: SessionDefaults = {
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

    const introspectionPayload: ModelsIntrospectionSetting = {
      environmentId: introspectionEnvironmentId || undefined,
    };

    const [defaultsRes, introspectionRes] = await Promise.all([
      api.put<{ ok: boolean }>("/settings", {
        key: "session_defaults",
        value: defaultsPayload,
      }),
      api.put<{ ok: boolean }>("/settings", {
        key: "models_introspection",
        value: introspectionPayload,
      }),
    ]);

    if (defaultsRes.error) {
      setError(defaultsRes.error);
    } else if (introspectionRes.error) {
      setError(introspectionRes.error);
    }

    setSaving(false);
  };

  const introspectionItems = [
    { value: "__auto__", label: "Automatic fallback (default + others)" },
    ...environments.map((env) => ({
      value: env.id,
      label: `${env.name} (${env.sandboxType})${env.isDefault ? " [default]" : ""}`,
    })),
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-fg">Models</h2>
        <p className="mt-1 text-sm text-muted">
          Set default model per mode for new sessions.
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span>
            Source: <strong>{formatSource(modelsSource)}</strong>
          </span>
          {modelsEnvironmentId && <span>Env: {modelsEnvironmentId}</span>}
          {refreshingModels && <span>Refreshing models...</span>}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted">Loading...</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-fg">
              Introspection environment
            </h3>
            <p className="mb-2 text-xs text-muted">
              Select the environment used by /api/models introspection.
            </p>
            <div className="mb-3">
              <SearchableSelect
                value={introspectionEnvironmentId || "__auto__"}
                onValueChange={(value) =>
                  setIntrospectionEnvironmentId(
                    value === "__auto__" ? "" : value,
                  )
                }
                placeholder="Auto fallback (default + others)"
                items={introspectionItems}
              />
            </div>
            <Button
              onClick={handleRefreshModels}
              loading={refreshingModels}
              variant="secondary"
            >
              Refresh models
            </Button>
          </div>

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
