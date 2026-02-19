export function buildSandboxEnv(options: {
  sessionId: string;
  secrets?: Record<string, string>;
}): Record<string, string> {
  const env: Record<string, string> = {
    PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    PI_SESSION_ID: options.sessionId,
    PI_CODING_AGENT_DIR: "/agent",
    npm_config_prefix: "/agent/npm",
    GIT_CONFIG_GLOBAL: "/git/gitconfig",
    XDG_DATA_HOME: "/agent/data",
    XDG_CONFIG_HOME: "/agent/config",
    XDG_CACHE_HOME: "/agent/cache",
    XDG_STATE_HOME: "/agent/state",
  };

  for (const [key, value] of Object.entries(options.secrets ?? {})) {
    env[key] = value;
  }

  return env;
}

export function buildValidationEnv(): Record<string, string> {
  return {
    PI_CODING_AGENT_DIR: "/agent",
    npm_config_prefix: "/agent/npm",
    npm_config_maxsockets: "1",
    npm_config_fetch_retries: "3",
    npm_config_fetch_retry_mintimeout: "10000",
    npm_config_fetch_retry_maxtimeout: "60000",
  };
}
