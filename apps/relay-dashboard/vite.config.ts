import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// Prevent Vite internal requests (e.g. /__vite_ping) from reaching
// React Router's catch-all handler which logs "No route matches URL" errors.
// Must be listed before reactRouter() so its post-middleware runs first.
function skipInternalRequests(): Plugin {
  return {
    name: "skip-internal-requests",
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith("/__")) {
            res.statusCode = 204;
            res.end();
            return;
          }
          next();
        });
      };
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), skipInternalRequests(), reactRouter()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
