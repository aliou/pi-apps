import { Hono } from "hono";
import type { AppEnv } from "../app";

export function packagesRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const packageCatalogService = c.get("packageCatalogService");
    const tag = c.req.query("tag") || "pi-package";
    const query = c.req.query("query") || "";
    const limit = Number(c.req.query("limit") || "20");

    try {
      const result = await packageCatalogService.search({ tag, query, limit });
      return c.json({
        data: {
          packages: result.packages,
          fetchedAt: result.fetchedAt,
          stale: result.stale,
        },
        error: null,
      });
    } catch (error) {
      return c.json(
        {
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "Package catalog unavailable",
        },
        503,
      );
    }
  });

  return app;
}
