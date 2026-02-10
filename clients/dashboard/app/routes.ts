import {
  index,
  layout,
  type RouteConfig,
  route,
} from "@react-router/dev/routes";

export default [
  layout("components/layout.tsx", [
    index("routes/dashboard.tsx"),
    route("sessions/:id", "routes/session.tsx"),
    route("ui", "routes/ui.tsx"),
    layout("routes/settings-layout.tsx", [
      route("settings", "routes/settings-index.tsx"),
      route("settings/secrets", "routes/settings.tsx"),
      route("settings/github", "routes/github-setup.tsx"),
      route("settings/environments", "routes/environments.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
