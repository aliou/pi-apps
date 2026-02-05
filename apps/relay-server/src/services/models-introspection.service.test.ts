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
      defaultProvider: "mock",
      enabledProviders: ["mock"],
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

  it("returns error when sandbox provider is unavailable", async () => {
    const manager = new SandboxManager({
      defaultProvider: "docker",
      enabledProviders: [],
    });

    const service = new ModelsIntrospectionService(
      manager,
      makeMockSecretsService(),
    );

    const result = await service.getModels();

    expect(result.error).toBeTruthy();
    expect(result.models).toEqual([]);
  });
});
