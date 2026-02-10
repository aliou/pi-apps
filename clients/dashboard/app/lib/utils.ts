import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Session } from "./api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSessionDisplayTitle(session: Session): string {
  if (session.name) {
    return session.name;
  }

  if (session.firstUserMessage) {
    return session.firstUserMessage.length > 80
      ? `${session.firstUserMessage.substring(0, 80)}...`
      : session.firstUserMessage;
  }

  return session.id.substring(0, 8);
}
