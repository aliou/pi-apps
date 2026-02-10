import { Navigate } from "react-router";

export default function SettingsIndex() {
  return <Navigate to="/settings/secrets" replace />;
}
