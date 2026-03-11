import { describe, expect, it } from "vitest";
import type { EnvironmentSandboxConfig } from "../sandbox/manager";
import { SandboxManager } from "../sandbox/manager";
import type { ExtensionConfigService } from "./extension-config.service";
import {
  IntrospectionError,
  IntrospectionErrorReason,
  ModelsIntrospectionService,
} from "./models-introspection.service";
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
      makeMockExtensionConfigService(),
      "/tmp/pi-test-sessions",
      envConfig,
    );

    const result = await service.getModels();

    expect(result.error).toBeNull();
    expect(result.models).toBeInstanceOf(Array);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models[0]).toHaveProperty("provider");
    expect(result.models[0]).toHaveProperty("id");
  });

  describe("IntrospectionError", () => {
    it("creates error with reason and message", () => {
      const error = new IntrospectionError(
        "test message",
        IntrospectionErrorReason.TIMEOUT,
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("test message");
      expect(error.reason).toBe(IntrospectionErrorReason.TIMEOUT);
      expect(error.name).toBe("IntrospectionError");
    });

    it("can be created with a cause", () => {
      const cause = new Error("underlying error");
      const error = new IntrospectionError(
        "wrapped message",
        IntrospectionErrorReason.CHANNEL_CLOSED,
        cause,
      );

      expect(error.cause).toBe(cause);
      expect(error.reason).toBe(IntrospectionErrorReason.CHANNEL_CLOSED);
    });
  });

  describe("IntrospectionErrorReason", () => {
    it("has all expected error reasons", () => {
      expect(IntrospectionErrorReason.MISSING_PROVIDER).toBe(
        "missing_provider",
      );
      expect(IntrospectionErrorReason.SANDBOX_UNAVAILABLE).toBe(
        "sandbox_unavailable",
      );
      expect(IntrospectionErrorReason.TIMEOUT).toBe("timeout");
      expect(IntrospectionErrorReason.EXEC_FAILED).toBe("exec_failed");
      expect(IntrospectionErrorReason.CHANNEL_CLOSED).toBe("channel_closed");
      expect(IntrospectionErrorReason.RPC_FAILED).toBe("rpc_failed");
      expect(IntrospectionErrorReason.RESPONSE_INVALID).toBe(
        "response_invalid",
      );
      expect(IntrospectionErrorReason.UNKNOWN).toBe("unknown");
    });
  });
});
