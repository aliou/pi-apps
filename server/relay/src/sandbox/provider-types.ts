/**
 * Single source of truth for sandbox provider types and resource tiers.
 * Imported by manager, session service, routes, etc.
 */

/** Supported sandbox provider backends. */
export type SandboxProviderType = "mock" | "docker" | "cloudflare" | "gondolin";

/** All supported sandbox provider types. Used as default and for status checks. */
export const ALL_PROVIDER_TYPES: SandboxProviderType[] = [
  "mock",
  "docker",
  "cloudflare",
  "gondolin",
];

/** Provider types shown in UI. Mock is internal-only. */
export const USER_FACING_PROVIDER_TYPES: readonly SandboxProviderType[] = [
  "docker",
  "cloudflare",
  "gondolin",
] as const;

/** Provider-neutral resource tiers. Each provider maps these to its own limits. */
export type SandboxResourceTier = "small" | "medium" | "large";
