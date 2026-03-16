import { useEffect, useState } from "react";
import { getEnvironmentById, type Environment } from "../lib/api";

interface UseEnvironmentResult {
  environment: Environment | null;
  loading: boolean;
  error: string | null;
}

interface UseEnvironmentLabelResult {
  label: string | null;
  loading: boolean;
  error: string | null;
}

const environmentCache = new Map<string, Environment>();
const environmentRequestCache = new Map<string, Promise<Environment | null>>();

async function fetchEnvironmentById(id: string): Promise<Environment | null> {
  const cached = environmentCache.get(id);
  if (cached) return cached;

  const existingRequest = environmentRequestCache.get(id);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const response = await getEnvironmentById(id);
    if (response.error || !response.data) {
      return null;
    }

    environmentCache.set(id, response.data);
    return response.data;
  })();

  environmentRequestCache.set(id, request);

  try {
    return await request;
  } finally {
    environmentRequestCache.delete(id);
  }
}

export function useEnvironmentById(
  environmentId?: string | null,
): UseEnvironmentResult {
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!environmentId) {
      setEnvironment(null);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = environmentCache.get(environmentId);
    if (cached) {
      setEnvironment(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const loaded = await fetchEnvironmentById(environmentId);
      if (cancelled) return;

      if (!loaded) {
        setEnvironment(null);
        setError("Failed to load environment");
      } else {
        setEnvironment(loaded);
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [environmentId]);

  return { environment, loading, error };
}

export function useEnvironmentLabel(
  environmentId?: string | null,
): UseEnvironmentLabelResult {
  const { environment, loading, error } = useEnvironmentById(environmentId);

  if (!environmentId) {
    return { label: null, loading: false, error: null };
  }

  return {
    label: environment?.name ?? environmentId,
    loading,
    error,
  };
}
