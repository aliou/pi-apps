import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { createTestDatabase } from "../test-helpers";
import { EnvironmentService } from "./environment.service";
import { ExtensionConfigService } from "./extension-config.service";
import { SessionService } from "./session.service";

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

    // Create default environment (needed for session creation)
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

  describe("add", () => {
    it("adds a global package", () => {
      const config = service.add({
        scope: "global",
        package: "npm:@foo/bar@1.0.0",
      });

      expect(config.id).toBeDefined();
      expect(config.scope).toBe("global");
      expect(config.package).toBe("npm:@foo/bar@1.0.0");
      expect(config.sessionId).toBeNull();
    });

    it("adds a mode-scoped package", () => {
      const config = service.add({
        scope: "chat",
        package: "npm:@foo/chat-ext@1.0.0",
      });

      expect(config.scope).toBe("chat");
      expect(config.sessionId).toBeNull();
    });

    it("adds a session-scoped package", () => {
      const session = sessionService.create({ mode: "chat" });
      const config = service.add({
        scope: "session",
        package: "npm:@foo/session-ext@1.0.0",
        sessionId: session.id,
      });

      expect(config.scope).toBe("session");
      expect(config.sessionId).toBe(session.id);
    });

    it("returns existing on duplicate", () => {
      const first = service.add({
        scope: "global",
        package: "npm:@foo/bar@1.0.0",
      });
      const second = service.add({
        scope: "global",
        package: "npm:@foo/bar@1.0.0",
      });

      expect(second.id).toBe(first.id);
    });
  });

  describe("remove", () => {
    it("removes a package", () => {
      const config = service.add({
        scope: "global",
        package: "npm:@foo/bar@1.0.0",
      });

      service.remove(config.id);
      expect(service.get(config.id)).toBeUndefined();
    });
  });

  describe("listByScope", () => {
    it("lists global packages", () => {
      service.add({ scope: "global", package: "npm:@foo/a@1.0.0" });
      service.add({ scope: "global", package: "npm:@foo/b@1.0.0" });
      service.add({ scope: "chat", package: "npm:@foo/c@1.0.0" });

      const globals = service.listByScope("global");
      expect(globals).toHaveLength(2);
      expect(globals.map((g) => g.package)).toContain("npm:@foo/a@1.0.0");
      expect(globals.map((g) => g.package)).toContain("npm:@foo/b@1.0.0");
    });

    it("lists session packages for specific session", () => {
      const s1 = sessionService.create({ mode: "chat" });
      const s2 = sessionService.create({ mode: "chat" });

      service.add({
        scope: "session",
        package: "npm:@foo/s1@1.0.0",
        sessionId: s1.id,
      });
      service.add({
        scope: "session",
        package: "npm:@foo/s2@1.0.0",
        sessionId: s2.id,
      });

      const s1Packages = service.listByScope("session", s1.id);
      expect(s1Packages).toHaveLength(1);
      expect(s1Packages[0]?.package).toBe("npm:@foo/s1@1.0.0");
    });

    it("returns empty for session scope without sessionId", () => {
      expect(service.listByScope("session")).toHaveLength(0);
    });
  });

  describe("getResolvedPackages", () => {
    it("merges global + mode + session packages", () => {
      const session = sessionService.create({ mode: "chat" });

      service.add({ scope: "global", package: "npm:@foo/global@1.0.0" });
      service.add({ scope: "chat", package: "npm:@foo/chat@1.0.0" });
      service.add({ scope: "code", package: "npm:@foo/code@1.0.0" });
      service.add({
        scope: "session",
        package: "npm:@foo/session@1.0.0",
        sessionId: session.id,
      });

      const packages = service.getResolvedPackages(session.id, "chat");

      expect(packages).toContain("npm:@foo/global@1.0.0");
      expect(packages).toContain("npm:@foo/chat@1.0.0");
      expect(packages).toContain("npm:@foo/session@1.0.0");
      expect(packages).not.toContain("npm:@foo/code@1.0.0");
    });

    it("deduplicates packages", () => {
      const session = sessionService.create({ mode: "chat" });

      service.add({ scope: "global", package: "npm:@foo/shared@1.0.0" });
      service.add({ scope: "chat", package: "npm:@foo/shared@1.0.0" });

      const packages = service.getResolvedPackages(session.id, "chat");
      expect(
        packages.filter((p) => p === "npm:@foo/shared@1.0.0"),
      ).toHaveLength(1);
    });

    it("does not include other sessions packages", () => {
      const s1 = sessionService.create({ mode: "chat" });
      const s2 = sessionService.create({ mode: "chat" });

      service.add({
        scope: "session",
        package: "npm:@foo/s2-only@1.0.0",
        sessionId: s2.id,
      });

      const packages = service.getResolvedPackages(s1.id, "chat");
      expect(packages).not.toContain("npm:@foo/s2-only@1.0.0");
    });

    it("returns empty when no packages configured", () => {
      const session = sessionService.create({ mode: "chat" });
      const packages = service.getResolvedPackages(session.id, "chat");
      expect(packages).toHaveLength(0);
    });
  });

  describe("cascade delete", () => {
    it("removes session-scoped configs when session is deleted", () => {
      const session = sessionService.create({ mode: "chat" });
      const config = service.add({
        scope: "session",
        package: "npm:@foo/ext@1.0.0",
        sessionId: session.id,
      });

      sessionService.delete(session.id);
      expect(service.get(config.id)).toBeUndefined();
    });
  });
});
