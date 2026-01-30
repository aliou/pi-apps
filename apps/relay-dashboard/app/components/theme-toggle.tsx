import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useTheme } from "../lib/theme";
import { cn } from "../lib/utils";

const options = [
  { value: "light" as const, icon: SunIcon, label: "Light" },
  { value: "dark" as const, icon: MoonIcon, label: "Dark" },
  { value: "system" as const, icon: DesktopIcon, label: "System" },
];

/** Full 3-button toggle for expanded sidebar. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-(--color-surface) p-0.5">
      {options.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            type="button"
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
            <opt.icon
              className="size-3.5"
              weight={active ? "fill" : "regular"}
            />
          </button>
        );
      })}
    </div>
  );
}

const cycle: Record<string, "light" | "dark" | "system"> = {
  light: "dark",
  dark: "system",
  system: "light",
};

/** Single icon button that cycles light -> dark -> system. For collapsed sidebar. */
export function ThemeToggleCycler() {
  const { theme, setTheme } = useTheme();
  const current =
    // biome-ignore lint/style/noNonNullAssertion: options is a static non-empty array
    options.find((o) => o.value === theme) ?? options[0]!;
  const next = cycle[theme] ?? "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Theme: ${current.label}`}
      className="rounded-md bg-(--color-surface) p-1.5 text-(--color-accent) transition-colors hover:bg-(--color-surface-hover)"
    >
      <current.icon className="size-3.5" weight="fill" />
    </button>
  );
}
