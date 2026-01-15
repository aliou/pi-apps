/**
 * WebSocket message handler.
 * Routes incoming requests to appropriate handlers.
 */

import { loadRepos } from "../repos.js";
import type { SessionManager } from "../session/manager.js";
import type { HelloParams, WSIncomingMessage, WSResponse } from "../types.js";
import type { Connection, ConnectionManager } from "./connection.js";

export interface HandlerContext {
  connection: Connection;
  connectionManager: ConnectionManager;
  sessionManager: SessionManager;
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

async function handleReposList(ctx: HandlerContext): Promise<unknown> {
  const config = loadRepos(ctx.dataDir);
  return { repos: config.repos };
}

async function handleSessionCreate(
  ctx: HandlerContext,
  params: Record<string, unknown> | undefined,
): Promise<unknown> {
  const repoId = params?.repoId as string | undefined;
  if (!repoId) {
    throw new Error("Missing repoId");
  }

  const info = await ctx.sessionManager.createSession(repoId);

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

  // Attach connection
  ctx.connection.attach(targetSessionId);

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

  const active = ctx.sessionManager.getSession(sessionId);
  if (!active) {
    throw new Error(`Session not active: ${sessionId}`);
  }

  // Don't await - prompt runs async, events stream back
  active.session.prompt(message).catch((error) => {
    console.error(`Prompt error for session ${sessionId}:`, error);
  });

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

  const active = ctx.sessionManager.getSession(sessionId);
  if (!active) {
    throw new Error(`Session not active: ${sessionId}`);
  }

  await active.session.abort();

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

  const active = ctx.sessionManager.getSession(sessionId);
  if (!active) {
    throw new Error(`Session not active: ${sessionId}`);
  }

  const session = active.session;

  return {
    model: session.model,
    thinkingLevel: session.thinkingLevel,
    isStreaming: session.isStreaming,
    sessionId: session.sessionId,
    sessionFile: session.sessionFile,
    messageCount: session.messages.length,
  };
}

async function handleGetMessages(
  ctx: HandlerContext,
  _params: Record<string, unknown> | undefined,
  sessionId: string | undefined,
): Promise<unknown> {
  if (!sessionId) {
    throw new Error("Missing sessionId");
  }

  const active = ctx.sessionManager.getSession(sessionId);
  if (!active) {
    throw new Error(`Session not active: ${sessionId}`);
  }

  return { messages: active.session.messages };
}

async function handleGetAvailableModels(ctx: HandlerContext): Promise<unknown> {
  // Get from first active session's model registry, or create temporary one
  const sessions = Array.from(ctx.sessionManager.listSessions());
  if (sessions.length === 0) {
    // No sessions, need to get models differently
    const { discoverAuthStorage, discoverModels } = await import(
      "@mariozechner/pi-coding-agent"
    );
    const authStorage = discoverAuthStorage();
    const modelRegistry = discoverModels(authStorage);
    const models = await modelRegistry.getAvailable();
    return { models };
  }

  // Use the session manager's registry (accessed via a session)
  const firstSession = ctx.sessionManager.getSession(sessions[0].sessionId);
  if (firstSession) {
    // The model is available on session.model, but we need the full list
    // For now, just return the current model info
    const model = firstSession.session.model;
    return { models: model ? [model] : [] };
  }

  return { models: [] };
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

  const active = ctx.sessionManager.getSession(sessionId);
  if (!active) {
    throw new Error(`Session not active: ${sessionId}`);
  }

  // Find and set model
  const { discoverAuthStorage, discoverModels } = await import(
    "@mariozechner/pi-coding-agent"
  );
  const authStorage = discoverAuthStorage();
  const modelRegistry = discoverModels(authStorage);
  const model = modelRegistry.find(provider, modelId);

  if (!model) {
    throw new Error(`Model not found: ${provider}/${modelId}`);
  }

  await active.session.setModel(model);

  return { model };
}
