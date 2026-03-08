import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppServices, createApp } from "../app";
import type { AppDatabase } from "../db/connection";
import { SandboxLogStore } from "../sandbox/log-store";
import { EnvironmentService } from "../services/environment.service";
import { EventJournal } from "../services/event-journal";
import { ExtensionManifestService } from "../services/extension-manifest.service";
import { ExtensionConfigService } from "../services/extension-config.service";
import { GitHubService } from "../services/github.service";
import { PackageCatalogService } from "../services/package-catalog.service";
import { RepoService } from "../services/repo.service";
import { SessionService } from "../services/session.service";
import {
  createTestDatabase,
  createTestSandboxManager,
  createTestSecretsService,
  createTestSessionHubManager,
} from "../test-helpers";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Packages Routes", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let services: AppServices;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;

    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/-/v1/search")) {
        return jsonResponse({
          objects: [
            {
              package: {
                name: "@aliou/pi-linkup",
                version: "0.7.3",
                description: "Linkup integration",
                keywords: ["pi-package"],
                links: { repository: "https://github.com/aliou/pi-linkup" },
              },
            },
          ],
        });
      }

      if (url.includes("%40aliou%2Fpi-linkup") || url.includes("@aliou%2Fpi-linkup")) {
        return jsonResponse({
          name: "@aliou/pi-linkup",
          "dist-tags": { latest: "0.7.3" },
          versions: {
            "0.7.3": {
              name: "@aliou/pi-linkup",
              version: "0.7.3",
              description: "Linkup integration",
              keywords: ["pi-package", "pi-extension"],
              repository: { url: "https://github.com/aliou/pi-linkup" },
              pi: { skills: ["./skills"], tools: ["linkup_search"], providers: [] },
            },
          },
        });
      }

      if (url.includes("schema.json")) {
        return jsonResponse({
          type: "object",
          properties: {
            apiKey: { type: "string", title: "API Key" },
          },
          required: ["apiKey"],
        });
      }

      return new Response("not found", { status: 404 });
    };

    const manifestService = new ExtensionManifestService({ fetchImpl: fakeFetch });

    services = {
      db,
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      repoService: new RepoService(db),
      githubService: new GitHubService(),
      sandboxManager: createTestSandboxManager(),
      secretsService: createTestSecretsService(db),
      environmentService: new EnvironmentService(db),
      extensionConfigService: new ExtensionConfigService(db),
      sandboxLogStore: new SandboxLogStore(),
      sessionDataDir: "/tmp/test-session-data",
      sessionHubManager: createTestSessionHubManager(db),
      packageCatalogService: new PackageCatalogService(manifestService, {
        fetchImpl: fakeFetch,
      }),
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  it("returns normalized package catalog data", async () => {
    const app = createApp({ services });
    const res = await app.request("/api/packages?tag=pi-package&query=linkup&limit=10");

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        packages: Array<{
          name: string;
          extensionMeta?: { skills?: string[]; tools?: string[] };
        }>;
        stale: boolean;
      };
      error: null;
    };

    expect(json.error).toBeNull();
    expect(json.data.stale).toBe(false);
    expect(json.data.packages[0]?.name).toBe("@aliou/pi-linkup");
    expect(json.data.packages[0]?.extensionMeta?.skills).toEqual(["./skills"]);
    expect(json.data.packages[0]?.extensionMeta?.tools).toEqual(["linkup_search"]);
  });
});
