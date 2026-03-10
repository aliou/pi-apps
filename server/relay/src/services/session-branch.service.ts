const MAX_SLUG_LENGTH = 48;

function collapseDashes(value: string): string {
  return value.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

export function slugifyBranchBase(input: string): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const slug = collapseDashes(ascii.replace(/[^a-z0-9]+/g, "-"));
  const fallback = slug || "session";
  return fallback.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "") || "session";
}

export function buildSessionBranchName(
  title: string,
  sessionId: string,
): string {
  const base = slugifyBranchBase(title);
  const prefix = sessionId.slice(0, 8).toLowerCase();
  return `pi/${base}-${prefix}`;
}

export function buildSessionBranchRetryName(branchName: string): string {
  const random = crypto.randomUUID().slice(0, 4).toLowerCase();
  return `${branchName}-${random}`;
}
