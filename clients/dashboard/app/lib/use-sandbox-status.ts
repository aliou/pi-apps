import { useEffect, useState } from "react";
import { api, type SandboxStatusResponse } from "./api";

export function useSandboxStatus(
  sessionId: string | undefined,
): SandboxStatusResponse | null {
  const [sandboxStatus, setSandboxStatus] =
    useState<SandboxStatusResponse | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const fetchStatus = async () => {
      const res = await api.get<SandboxStatusResponse>(
        `/sessions/${sessionId}/sandbox`,
      );
      if (res.data) {
        setSandboxStatus(res.data);
      }
    };

    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  return sandboxStatus;
}
