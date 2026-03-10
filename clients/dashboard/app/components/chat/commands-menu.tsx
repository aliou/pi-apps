import { cn } from "../../lib/utils";

export interface SlashCommandItem {
  name: string;
  description?: string;
}

interface CommandsMenuProps {
  commands: SlashCommandItem[];
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommandItem) => void;
}

export function CommandsMenu({
  commands,
  query,
  selectedIndex,
  onSelect,
}: CommandsMenuProps) {
  const normalized = query.toLowerCase();
  const filtered = commands.filter((command) =>
    command.name.toLowerCase().includes(normalized),
  );

  if (filtered.length === 0) return null;

  return (
    <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-surface p-1">
      {filtered.map((command, index) => (
        <button
          key={command.name}
          type="button"
          onClick={() => onSelect(command)}
          className={cn(
            "w-full rounded-lg px-2 py-1.5 text-left text-xs",
            index === selectedIndex
              ? "bg-accent text-accent-fg"
              : "text-fg hover:bg-surface-hover",
          )}
        >
          <p className="font-mono">/{command.name}</p>
          {command.description ? (
            <p className="mt-0.5 text-[11px] opacity-80">
              {command.description}
            </p>
          ) : null}
        </button>
      ))}
    </div>
  );
}
