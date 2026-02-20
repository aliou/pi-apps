import { ArrowUpIcon, ChatCircleIcon, CodeIcon, CloudIcon, GithubLogoIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { SearchableSelect, Tabs } from "../components/ui";
import type { SearchableSelectItem } from "../components/ui";
import {
  api,
  type Environment,
  type GitHubRepo,
  type ModelInfo,
} from "../lib/api";
import { cn } from "../lib/utils";

type Mode = "chat" | "code";

interface SessionDefaults {
  chat?: { modelProvider?: string; modelId?: string };
  code?: { modelProvider?: string; modelId?: string };
}

const CHAT_GREETINGS = [
  "Let's talk about something interesting",
  "What's on your mind today",
  "Ready for a thoughtful conversation",
  "Tell me what you're curious about",
  "Let's explore some ideas together",
  "What can I help you discover",
  "Bring your questions, I'll bring insights",
  "Time to dive into something new",
  "Let's make sense of it all",
  "What would you like to discuss",
  "I'm here for your thoughts",
  "Shall we dig deeper",
  "Let's chat about the important stuff",
  "What's catching your attention lately",
  "Ready to brainstorm something great",
  "Tell me what matters to you",
  "Let's unpack this together",
  "What would help you most right now",
  "I'm all ears for your ideas",
  "Let's build on your thoughts",
  "What's the story here",
  "Ready for some real talk",
  "Let's figure this out",
  "What's your take on things",
  "Time for a genuine exchange",
  "Where should we start",
  "Let's see where this goes",
  "What's really bothering you",
  "I'm ready to listen",
  "Let's make sense together",
  "What deserves your attention now",
  "Ready to tackle something fresh",
  "Tell me the real story",
  "Let's think through this",
  "What would be most helpful",
  "Time to explore something different",
  "I'm here for the deep stuff",
  "What's worth discussing today",
  "Let's start with what matters",
  "Ready to challenge some assumptions",
  "What brings you here",
  "Let's build something meaningful",
  "What would change everything",
  "I'm interested in your perspective",
  "Let's cut through the noise",
  "What's really important to you",
  "Ready for some honest reflection",
  "Tell me your real question",
  "Let's create something worthwhile",
  "What's your next move",
] as const;

const CODE_GREETINGS = [
  "Ready to build something",
  "What are we debugging today",
  "Let's solve this problem",
  "Time to write some clean code",
  "What's the technical challenge",
  "Ready to refactor and improve",
  "Let's architect something solid",
  "What needs fixing right now",
  "Time to optimize the code",
  "Ready for some pair programming",
  "What's the next feature",
  "Let's tackle that bug",
  "Time for better performance",
  "What's your implementation plan",
  "Ready to review some code",
  "Let's design this properly",
  "What framework are we using",
  "Time to write tests",
  "Ready for code review feedback",
  "What's the error message",
  "Let's break down the logic",
  "Time to improve code quality",
  "What needs refactoring here",
  "Ready to ship this feature",
  "Let's trace through the logic",
  "What's the system architecture",
  "Time to handle edge cases",
  "Ready to deploy something new",
  "What's the technical debt",
  "Let's write better documentation",
  "Time for performance profiling",
  "What's blocking you now",
  "Ready to integrate this",
  "Let's debug this systematically",
  "What's the API contract",
  "Time to add error handling",
  "Ready for database optimization",
  "What's the security concern",
  "Let's automate this workflow",
  "Time to scale this solution",
  "What's your git strategy",
  "Ready to containerize this",
  "Let's modernize the stack",
  "What's the migration plan",
  "Time to implement caching",
  "Ready to build the pipeline",
  "What's the bottleneck here",
  "Let's mock that service",
  "Time to version the API",
  "What's your deployment strategy",
] as const;

function randomFrom(items: readonly string[]): string {
  return items[Math.floor(Math.random() * items.length)] ?? "";
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const requestedMode = searchParams.get("mode") === "code" ? "code" : "chat";
  const [mode, setMode] = useState<Mode>(requestedMode);
  const [greeting, setGreeting] = useState(randomFrom(CHAT_GREETINGS));

  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaults, setDefaults] = useState<SessionDefaults>({});

  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>("");
  const [message, setMessage] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(requestedMode);
  }, [requestedMode]);

  useEffect(() => {
    setGreeting(
      mode === "chat"
        ? randomFrom(CHAT_GREETINGS)
        : randomFrom(CODE_GREETINGS),
    );
  }, [mode]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [reposRes, envsRes, modelsRes, settingsRes] = await Promise.all([
        api.get<GitHubRepo[]>("/github/repos"),
        api.get<Environment[]>("/environments"),
        api.get<ModelInfo[]>("/models"),
        api.get<Record<string, unknown>>("/settings"),
      ]);

      if (reposRes.data) setRepos(reposRes.data);
      if (envsRes.data) {
        setEnvironments(envsRes.data);
        const defaultEnv =
          envsRes.data.find((env) => env.isDefault) ?? envsRes.data[0];
        if (defaultEnv) setSelectedEnvironmentId(defaultEnv.id);
      }
      if (modelsRes.data) setModels(modelsRes.data);
      if (settingsRes.data) {
        const configured = settingsRes.data.session_defaults as
          | SessionDefaults
          | undefined;
        setDefaults(configured ?? {});
      }

      setIsLoading(false);
    };

    load();
  }, []);

  const repoItems: SearchableSelectItem[] = useMemo(
    () => repos.map((r) => ({ label: r.fullName, value: String(r.id) })),
    [repos],
  );

  const environmentItems: SearchableSelectItem[] = useMemo(
    () => environments.map((e) => ({ label: e.name, value: e.id })),
    [environments],
  );

  const canSubmit =
    message.trim().length > 0 &&
    (mode === "chat" || (!!selectedRepoId && !!selectedEnvironmentId));

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const modeDefaults = mode === "chat" ? defaults.chat : defaults.code;

    const res = await api.post<{ id: string }>("/sessions", {
      mode,
      repoId: mode === "code" ? selectedRepoId : undefined,
      environmentId: mode === "code" ? selectedEnvironmentId : undefined,
      modelProvider: modeDefaults?.modelProvider,
      modelId: modeDefaults?.modelId,
    });

    if (res.error || !res.data?.id) {
      setError(res.error ?? "Failed to create session");
      setIsSubmitting(false);
      return;
    }

    const firstPrompt = message.trim();
    sessionStorage.setItem(`pendingPrompt:${res.data.id}`, firstPrompt);

    navigate(`/sessions/${res.data.id}`, {
      state: { initialPrompt: firstPrompt },
    });
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-4xl items-center">
      <div className="w-full">
        <div className="mb-8">
          <Tabs value={mode} onValueChange={(d) => setMode(d.value as Mode)}>
            <Tabs.List className="mx-auto mb-8 w-fit rounded-xl border border-border bg-surface p-1">
              <Tabs.Trigger
                value="chat"
                className={cn(
                  "relative z-10 rounded-lg px-5 py-2.5 text-sm text-muted transition-colors",
                  "data-[selected]:text-accent-fg",
                  mode === "chat" && "!text-accent-fg",
                )}
              >
                <ChatCircleIcon className="size-4" />
                Chat
              </Tabs.Trigger>
              <Tabs.Trigger
                value="code"
                className={cn(
                  "relative z-10 rounded-lg px-5 py-2.5 text-sm text-muted transition-colors",
                  "data-[selected]:text-accent-fg",
                  mode === "code" && "!text-accent-fg",
                )}
              >
                <CodeIcon className="size-4" />
                Code
              </Tabs.Trigger>
              <Tabs.Indicator className="top-1 bottom-1 h-auto rounded-lg bg-accent left-(--left) w-(--width)" />
            </Tabs.List>
          </Tabs>

          <h1 className="text-center text-4xl font-semibold tracking-tight text-fg">
            {greeting}
          </h1>
        </div>

        <div className="rounded-2xl border border-border bg-surface/30 p-4 md:p-5 transition-all duration-300 ease-out">
          <div
            aria-hidden={mode !== "code"}
            className={cn(
              "overflow-hidden transition-[max-height,opacity,transform,margin] duration-300 ease-out",
              mode === "code"
                ? "mb-4 max-h-80 translate-y-0 opacity-100"
                : "mb-0 max-h-0 -translate-y-1 opacity-0 pointer-events-none",
            )}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs text-muted">Repository</label>
                <SearchableSelect
                  items={repoItems}
                  value={selectedRepoId}
                  onValueChange={setSelectedRepoId}
                  placeholder="Select repository"
                  icon={<GithubLogoIcon className="size-4" />}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted">Environment</label>
                <SearchableSelect
                  items={environmentItems}
                  value={selectedEnvironmentId}
                  onValueChange={setSelectedEnvironmentId}
                  placeholder="Select environment"
                  icon={<CloudIcon className="size-4" />}
                />
              </div>
            </div>
          </div>

          <div className={cn(
            "rounded-2xl border border-border bg-surface/50 transition-colors",
            "focus-within:border-accent/50",
          )}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                mode === "chat"
                  ? "Ask anything..."
                  : "Describe what you want to build or change..."
              }
              rows={4}
              className="w-full resize-none bg-transparent px-4 pt-4 pb-1 text-base text-fg placeholder:text-muted focus:outline-none"
            />
            <div className="flex items-center justify-end px-3 pb-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting || isLoading}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full transition-colors",
                  canSubmit && !isSubmitting && !isLoading
                    ? "bg-accent text-accent-fg hover:bg-accent-hover"
                    : "bg-muted/20 text-muted/40 cursor-not-allowed",
                )}
                aria-label="Create session"
              >
                <ArrowUpIcon className="size-4" weight="bold" />
              </button>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-status-err">{error}</p>}

          {!isLoading && mode === "code" && repos.length === 0 && (
            <p className="mt-3 text-xs text-muted">
              No repositories found. Configure GitHub token in settings.
            </p>
          )}

          {!isLoading && mode === "code" && environments.length === 0 && (
            <p className="mt-1 text-xs text-muted">
              No environments found. Create one in settings.
            </p>
          )}

          {!isLoading && mode === "chat" && models.length === 0 && (
            <p className="mt-3 text-xs text-muted">
              No model configured yet. Add provider keys in settings.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
