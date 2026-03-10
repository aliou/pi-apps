export interface GenerateSessionTitleInput {
  firstPrompt: string;
  mode: "chat" | "code";
}

const MAX_TITLE_LENGTH = 72;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function generateSessionTitle(input: GenerateSessionTitleInput): string {
  const prompt = normalizeWhitespace(input.firstPrompt);
  if (!prompt) {
    return input.mode === "code" ? "Code session" : "Chat session";
  }

  const stripped = prompt
    .replace(/^['"`\s]+/, "")
    .replace(/[\s'"`]+$/, "")
    .replace(/[\r\n]+/g, " ");

  if (stripped.length <= MAX_TITLE_LENGTH) {
    return stripped;
  }

  const shortened = stripped.slice(0, MAX_TITLE_LENGTH).trimEnd();
  return `${shortened}…`;
}
