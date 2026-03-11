export interface VersionMeta {
  relayVersion: string;
  serverHash: string;
  dashboardHash: string;
  builtAt?: string;
}

export class BuildInfoService {
  constructor(private relayVersion = process.env.RELAY_VERSION ?? "0.1.0") {}

  getVersion(): VersionMeta {
    return {
      relayVersion: this.relayVersion,
      serverHash: normalizeHash(process.env.GIT_COMMIT),
      dashboardHash: normalizeHash(
        process.env.DASHBOARD_GIT_COMMIT ?? process.env.PI_DASHBOARD_COMMIT,
      ),
      ...((process.env.BUILT_AT ?? process.env.PI_BUILD_AT)
        ? { builtAt: process.env.BUILT_AT ?? process.env.PI_BUILD_AT }
        : {}),
    };
  }
}

function normalizeHash(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "dev";
}
