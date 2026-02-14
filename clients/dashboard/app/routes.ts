import {
  index,
  layout,
  type RouteConfig,
  route,
} from "@react-router/dev/routes";

export default [
  layout("components/layout.tsx", [
    index("routes/dashboard.tsx"),
    route("sessions", "routes/sessions.tsx"),
    route("sessions/:id", "routes/session.tsx"),
    layout("routes/settings-layout.tsx", [
      route("settings", "routes/settings-index.tsx"),
      route("settings/secrets", "routes/settings.tsx"),
      route("settings/github", "routes/github-setup.tsx"),
      route("settings/environments", "routes/environments.tsx"),
      route("settings/models", "routes/settings-models.tsx"),
      route("settings/extensions", "routes/settings-extensions.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
