import { describe, expect, it } from "vitest";
import type { EnvironmentSandboxConfig } from "../sandbox/manager";
import { SandboxManager } from "../sandbox/manager";
import type { ExtensionConfigService } from "./extension-config.service";
import { ModelsIntrospectionService } from "./models-introspection.service";
import type { SecretsService } from "./secrets.service";

function makeMockSecretsService(): SecretsService {
  return {
    getAllAsEnv: async () => ({}),
    getSecretMaterial: async () => ({
      directEnv: {},
      gondolinHookSecrets: [],
    }),
    list: async () => [],
  } as unknown as SecretsService;
}

function makeMockExtensionConfigService(): ExtensionConfigService {
  return {
    getResolvedPackages: () => [],
  } as unknown as ExtensionConfigService;
}

describe("ModelsIntrospectionService", () => {
  it.skip("returns models from an ephemeral sandbox via RPC", async () => {
    const mockSecrets = makeMockSecretsService();
    const manager = new SandboxManager(
      {
        docker: {
          sessionDataDir: "/tmp/pi-test-sessions",
          secretsBaseDir: "/tmp/pi-test-secrets",
        },
        gondolin: {
          sessionDataDir: "/tmp/pi-test-sessions",
        },
      },
      mockSecrets,
    );

    const envConfig: EnvironmentSandboxConfig = {
      sandboxType: "gondolin",
    };

    const service = new ModelsIntrospectionService(
      manager,
      makeMockSecretsService(),
      makeMockExtensionConfigService(),
      "/tmp/pi-test-sessions",
      envConfig,
    );

    const result = await service.getModels();

    expect(result.error).toBeNull();
    expect(result.models).toBeInstanceOf(Array);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models[0]).toHaveProperty("provider");
    expect(result.models[0]).toHaveProperty("modelId");
  });
});
