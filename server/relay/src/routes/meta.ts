import { Hono } from "hono";
import type { AppEnv } from "../app";
import { BuildInfoService } from "../services/build-info.service";

const buildInfoService = new BuildInfoService();

export function metaRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/version", (c) => {
    return c.json({ data: buildInfoService.getVersion(), error: null });
  });

  return app;
}
