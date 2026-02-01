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
    route("environments", "routes/environments.tsx"),
    route("github", "routes/github-setup.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
] satisfies RouteConfig;
