import { useEffect, useState } from "react";
import { ConnectionGate } from "./components/connection-gate";
import { Layout } from "./components/layout";
import { DashboardPage } from "./pages/dashboard";
import { GitHubSetupPage } from "./pages/github-setup";
import { SettingsPage } from "./pages/settings";

type Page = "dashboard" | "github" | "settings";

function getPageFromHash(): Page {
  const hash = window.location.hash.slice(1);
  if (hash === "github" || hash === "settings") {
    return hash;
  }
  return "dashboard";
}

export function App() {
  const [page, setPage] = useState<Page>(getPageFromHash);

  useEffect(() => {
    const handleHashChange = () => {
      setPage(getPageFromHash());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigate = (newPage: string) => {
    window.location.hash = newPage;
    setPage(newPage as Page);
  };

  return (
    <ConnectionGate>
      <Layout currentPage={page} onNavigate={navigate}>
        {page === "dashboard" && <DashboardPage />}
        {page === "github" && <GitHubSetupPage />}
        {page === "settings" && <SettingsPage />}
      </Layout>
    </ConnectionGate>
  );
}
