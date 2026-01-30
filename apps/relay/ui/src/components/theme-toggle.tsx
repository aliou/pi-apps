import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useTheme } from "../lib/theme";
import { cn } from "../lib/utils";

const options = [
  { value: "light" as const, icon: SunIcon, label: "Light" },
  { value: "dark" as const, icon: MoonIcon, label: "Dark" },
  { value: "system" as const, icon: DesktopIcon, label: "System" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-(--color-surface) p-0.5">
      {options.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            title={opt.label}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              active
                ? "bg-(--color-accent) text-(--color-accent-fg)"
                : "text-(--color-muted) hover:text-(--color-fg)",
            )}
          >
            <opt.icon className="size-3.5" weight={active ? "fill" : "regular"} />
          </button>
        );
      })}
    </div>
  );
}
