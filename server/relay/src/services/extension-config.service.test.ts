import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { createTestDatabase } from "../test-helpers";
import { EnvironmentService } from "./environment.service";
import { type ExtensionManifest } from "./extension-manifest.service";
import { ExtensionConfigService } from "./extension-config.service";
import { writeExtensionSettings } from "./settings-generator";
import { SessionService } from "./session.service";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("ExtensionConfigService", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let service: ExtensionConfigService;
  let sessionService: SessionService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    service = new ExtensionConfigService(db);
    sessionService = new SessionService(db);

    const envService = new EnvironmentService(db);
    envService.create({
      name: "Default",
      sandboxType: "docker",
      config: { image: "pi-sandbox:test" },
      isDefault: true,
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("persists config json on add and update", () => {
    const config = service.add({
      scope: "global",
      package: "@aliou/pi-linkup",
      config: { apiKey: "secret" },
    });

    expect(config.configJson).toBe(JSON.stringify({ apiKey: "secret" }));

    const updated = service.update(config.id, {
      config: { apiKey: "changed", endpoint: "https://example.com" },
    });

    expect(updated?.configJson).toBe(
      JSON.stringify({ apiKey: "changed", endpoint: "https://example.com" }),
    );
  });

  it("merges config across scopes when resolving packages", () => {
    const session = sessionService.create({ mode: "chat" });

    service.add({
      scope: "global",
      package: "@aliou/pi-linkup",
      config: { endpoint: "https://global.example.com", timeout: "10" },
    });
    service.add({
      scope: "chat",
      package: "@aliou/pi-linkup",
      config: { timeout: "30" },
    });
    service.add({
      scope: "session",
      sessionId: session.id,
      package: "@aliou/pi-linkup",
      config: { project: "alpha" },
    });

    const resolved = service.getResolvedPackageEntries(session.id, "chat");
    expect(resolved).toEqual([
      {
        package: "@aliou/pi-linkup",
        config: {
          endpoint: "https://global.example.com",
          timeout: "30",
          project: "alpha",
        },
      },
    ]);
  });

  it("validates required fields from manifest schema", () => {
    const manifest: ExtensionManifest = {
      name: "@aliou/pi-linkup",
      version: "1.0.0",
      keywords: [],
      tools: [],
      providers: [],
      skills: [],
      fetchedAt: new Date().toISOString(),
      schema: {
        properties: {
          apiKey: { type: "string", title: "API key" },
        },
        required: ["apiKey"],
      },
    };

    expect(service.validateConfig({}, manifest)).toEqual({
      valid: false,
      errors: [{ field: "apiKey", message: "Required" }],
    });
    expect(service.validateConfig({ apiKey: "ok" }, manifest).valid).toBe(true);
  });

  it("writes extension config into generated settings", () => {
    const session = sessionService.create({ mode: "chat" });
    const sessionDataDir = "/tmp/pi-relay-extension-settings-test";

    rmSync(sessionDataDir, { recursive: true, force: true });

    service.add({
      scope: "global",
      package: "@aliou/pi-linkup",
      config: { apiKey: "secret", endpoint: "https://example.com" },
    });

    const packages = writeExtensionSettings(
      sessionDataDir,
      session.id,
      service,
      "chat",
    );

    expect(packages).toEqual(["@aliou/pi-linkup"]);

    const settingsJson = JSON.parse(
      readFileSync(join(sessionDataDir, session.id, "agent", "settings.json"), "utf-8"),
    ) as {
      packages: string[];
      extensionConfig: Record<string, Record<string, unknown>>;
    };

    expect(settingsJson.packages).toEqual(["@aliou/pi-linkup"]);
    expect(settingsJson.extensionConfig["@aliou/pi-linkup"]).toEqual({
      apiKey: "secret",
      endpoint: "https://example.com",
    });

    rmSync(sessionDataDir, { recursive: true, force: true });
  });
});
