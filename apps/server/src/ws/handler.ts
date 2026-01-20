/**
 * WebSocket message handler.
 * Routes incoming requests to appropriate handlers.
 */

import { getGitHubToken, listAccessibleRepos } from "../github.js";
import type { UnifiedSessionManager } from "../session/unified.js";
import type { HelloParams, WSIncomingMessage, WSResponse } from "../types.js";
import type { Connection, ConnectionManager } from "./connection.js";

export interface HandlerContext {
  connection: Connection;
  connectionManager: ConnectionManager;
  sessionManager: UnifiedSessionManager;
  dataDir: string;
}

type MethodHandler = (
  ctx: HandlerContext,
  params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
) => Promise<unknown>;

const methodHandlers: Record<string, MethodHandler> = {
  hello: handleHello,
  "repos.list": handleReposList,
  "session.create": handleSessionCreate,
  "session.list": handleSessionList,
  "session.attach": handleSessionAttach,
  "session.detach": handleSessionDetach,
  "session.delete": handleSessionDelete,
  prompt: handlePrompt,
  abort: handleAbort,
  get_state: handleGetState,
  get_messages: handleGetMessages,
  get_available_models: handleGetAvailableModels,
  set_model: handleSetModel,
};

/**
 * Handle an incoming WebSocket message.
 */
export async function handleMessage(
  ctx: HandlerContext,
  data: string,
): Promise<void> {
  let message: WSIncomingMessage;

  try {
    message = JSON.parse(data) as WSIncomingMessage;
  } catch (_error) {
    ctx.connection.sendResponse(
      makeErrorResponse("", "parse_error", "Invalid JSON"),
    );
    return;
  }

  // Validate it's a request
  if (message.kind !== "request" || !message.method || !message.id) {
    ctx.connection.sendResponse(
      makeErrorResponse(
        message.id ?? "",
        "invalid_request",
        "Missing required fields",
      ),
    );
    return;
  }

  const handler = methodHandlers[message.method];
  if (!handler) {
    ctx.connection.sendResponse(
      makeErrorResponse(
        message.id,
        "unknown_method",
        `Unknown method: ${message.method}`,
      ),
    );
    return;
  }

  try {
    const result = await handler(ctx, message.params, message.sessionId);
    ctx.connection.sendResponse({
      v: 1,
      kind: "response",
      id: message.id,
      sessionId: message.sessionId,
      ok: true,
      result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.connection.sendResponse(
      makeErrorResponse(message.id, "handler_error", errorMessage),
    );
  }
}

function makeErrorResponse(
  id: string,
  code: string,
  message: string,
): WSResponse {
  return {
    v: 1,
    kind: "response",
    id,
    ok: false,
    error: { code, message },
  };
}

// --- Method Handlers ---

async function handleHello(
  ctx: HandlerContext,
  params: Record<string, unknown> | undefined,
): Promise<unknown> {
  const helloParams = params as HelloParams | undefined;
  if (!helloParams?.client) {
    throw new Error("Missing client info");
  }

  return ctx.connectionManager.handleHello(ctx.connection, helloParams);
}

async function handleReposList(_ctx: HandlerContext): Promise<unknown> {
  const token = getGitHubToken();
  const repos = await listAccessibleRepos(token);

  return {
    repos: repos.map((repo) => ({
      id: repo.fullName,
      name: repo.name,
      fullName: repo.fullName,
      owner: repo.owner,
      private: repo.private,
      description: repo.description,
      htmlUrl: repo.htmlUrl,
      cloneUrl: repo.cloneUrl,
      sshUrl: repo.sshUrl,
      defaultBranch: repo.defaultBranch,
    })),
  };
}

async function handleSessionCreate(
  ctx: HandlerContext,
  params: Record<string, unknown> | undefined,
): Promise<unknown> {
  const mode = (params?.mode as "chat" | "code") ?? "code"; // Default to code for backwards compat
  const repoId = params?.repoId as string | undefined;
  const systemPrompt = params?.systemPrompt as string | undefined;

  if (mode === "code" && !repoId) {
    throw new Error("Missing repoId for code mode");
  }

  const provider = params?.provider as string | undefined;
  const modelId = params?.modelId as string | undefined;

  const info = await ctx.sessionManager.createSession(
    mode,
    repoId,
    provider && modelId ? { provider, modelId } : undefined,
    systemPrompt,
  );

  // Auto-attach the creating connection
  ctx.connection.attach(info.sessionId);

  return { sessionId: info.sessionId };
}

async function handleSessionList(ctx: HandlerContext): Promise<unknown> {
  const sessions = ctx.sessionManager.listSessions();
  return { sessions };
}

async function handleSessionAttach(
  ctx: HandlerContext,
  params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
): Promise<unknown> {
  const targetSessionId = (params?.sessionId as string) ?? sessionId;
  if (!targetSessionId) {
    throw new Error("Missing sessionId");
  }

  // Resume session if not active
  await ctx.sessionManager.resumeSession(targetSessionId);

  // Detach from any previous sessions first
  const allSessions = ctx.sessionManager.listSessions();
  for (const session of allSessions) {
    if (session.sessionId !== targetSessionId) {
      ctx.connection.detach(session.sessionId);
    }
  }

  // Attach connection
  ctx.connection.attach(targetSessionId);

  return { ok: true };
}

async function handleSessionDetach(
  ctx: HandlerContext,
  params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
): Promise<unknown> {
  const targetSessionId = (params?.sessionId as string) ?? sessionId;
  if (!targetSessionId) {
    throw new Error("Missing sessionId");
  }

  ctx.connection.detach(targetSessionId);

  return { ok: true };
}

async function handleSessionDelete(
  ctx: HandlerContext,
  params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
): Promise<unknown> {
  const targetSessionId = (params?.sessionId as string) ?? sessionId;
  if (!targetSessionId) {
    throw new Error("Missing sessionId");
  }

  await ctx.sessionManager.deleteSession(targetSessionId);

  return { ok: true };
}

async function handlePrompt(
  ctx: HandlerContext,
  params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
): Promise<unknown> {
  if (!sessionId) {
    throw new Error("Missing sessionId");
  }

  const message = params?.message as string | undefined;
  if (!message) {
    throw new Error("Missing message");
  }

  // Use unified manager's prompt method (works for both local and sandbox)
  await ctx.sessionManager.prompt(sessionId, message);

  return { ok: true };
}

async function handleAbort(
  ctx: HandlerContext,
  _params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
): Promise<unknown> {
  if (!sessionId) {
    throw new Error("Missing sessionId");
  }

  // Use unified manager's abort method (works for both local and sandbox)
  await ctx.sessionManager.abort(sessionId);

  return { ok: true };
}

async function handleGetState(
  ctx: HandlerContext,
  _params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
): Promise<unknown> {
  if (!sessionId) {
    throw new Error("Missing sessionId");
  }

  // Use unified manager's getState method (works for both local and sandbox)
  return ctx.sessionManager.getState(sessionId);
}

async function handleGetMessages(
  ctx: HandlerContext,
  _params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
): Promise<unknown> {
  if (!sessionId) {
    throw new Error("Missing sessionId");
  }

  // Use unified manager's getMessages method (works for both local and sandbox)
  return ctx.sessionManager.getMessages(sessionId);
}

async function handleGetAvailableModels(ctx: HandlerContext): Promise<unknown> {
  const models = ctx.sessionManager.listAvailableModels();
  return { models };
}

async function handleSetModel(
  ctx: HandlerContext,
  params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
): Promise<unknown> {
  if (!sessionId) {
    throw new Error("Missing sessionId");
  }

  const provider = params?.provider as string | undefined;
  const modelId = params?.modelId as string | undefined;
  if (!provider || !modelId) {
    throw new Error("Missing provider or modelId");
  }

  // Use unified manager's setModel method (works for both local and sandbox)
  return ctx.sessionManager.setModel(sessionId, provider, modelId);
}
