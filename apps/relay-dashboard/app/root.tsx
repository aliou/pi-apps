import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { ConnectionGate } from "./components/connection-gate";
import { SidebarProvider } from "./lib/sidebar";
import { ThemeProvider } from "./lib/theme";
import "./styles/app.css";

const themeScript = `(function () {
  var saved = localStorage.getItem("pi-relay-theme");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (saved === "dark" || (!saved && prefersDark)) {
    document.documentElement.classList.add("dark");
  }
})();`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="theme-color"
          content="#1B2632"
          media="(prefers-color-scheme: dark)"
        />
        <meta
          name="theme-color"
          content="#F5F1EB"
          media="(prefers-color-scheme: light)"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: inline theme script prevents FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <ConnectionGate>
          <Outlet />
        </ConnectionGate>
      </SidebarProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404 ? "Page not found." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center text-center">
      <h1 className="mb-2 text-2xl font-semibold text-(--color-fg)">
        {message}
      </h1>
      <p className="text-sm text-(--color-muted)">{details}</p>
    </main>
  );
}
