import { describe, expect, it } from "vitest";
import { SandboxManager } from "../sandbox/manager";
import { ModelsIntrospectionService } from "./models-introspection.service";
import type { SecretsService } from "./secrets.service";

function makeMockSecretsService(): SecretsService {
  return {
    getAllAsEnv: async () => ({}),
  } as unknown as SecretsService;
}

describe("ModelsIntrospectionService", () => {
  it("returns models from an ephemeral sandbox via RPC", async () => {
    const manager = new SandboxManager({
      docker: {
        sessionDataDir: "/tmp/pi-test-sessions",
        secretsBaseDir: "/tmp/pi-test-secrets",
      },
      getCfApiToken: async () => null,
    });

    const service = new ModelsIntrospectionService(
      manager,
      makeMockSecretsService(),
    );

    const result = await service.getModels();

    expect(result.error).toBeNull();
    expect(result.models).toBeInstanceOf(Array);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models[0]).toHaveProperty("provider");
    expect(result.models[0]).toHaveProperty("modelId");
  });
});
