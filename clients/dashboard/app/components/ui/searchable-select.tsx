import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { CaretUpDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo, useState } from "react";
import { cn } from "../../lib/utils";

export interface SearchableSelectItem {
  label: string;
  value: string;
}

export interface SearchableSelectProps {
  /** Items to display in the dropdown. */
  items: SearchableSelectItem[];
  /** Currently selected value (controlled). */
  value: string;
  /** Called when the user picks an item. */
  onValueChange: (value: string) => void;
  /** Placeholder shown when nothing is selected. */
  placeholder?: string;
  /** Icon rendered in the trigger button. */
  icon?: ReactNode;
  /** Additional class on the root element. */
  className?: string;
}

export function SearchableSelect({
  items,
  value,
  onValueChange,
  placeholder = "Select...",
  icon,
  className,
}: SearchableSelectProps) {
  const [inputValue, setInputValue] = useState("");

  const collection = useMemo(() => {
    const q = inputValue.toLowerCase().trim();
    const filtered = q
      ? items.filter(
          (item) =>
            item.label?.toLowerCase().includes(q) ||
            item.value?.toLowerCase().includes(q),
        )
      : items;
    return createListCollection({ items: filtered });
  }, [items, inputValue]);

  const selectedLabel = items.find((i) => i.value === value)?.label;

  return (
    <Menu.Root
      composite={false}
      onOpenChange={(d) => {
        if (!d.open) setInputValue("");
      }}
    >
      <Menu.Trigger
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-bg px-3 text-sm text-fg outline-none transition-colors hover:border-accent focus:border-accent",
          className,
        )}
      >
        {icon && <span className="shrink-0 text-muted/70">{icon}</span>}
        <span className={cn("flex-1 truncate text-left", !selectedLabel && "text-muted/70")}>
          {selectedLabel ?? placeholder}
        </span>
        <CaretUpDownIcon className="size-4 shrink-0 text-muted" />
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner className="z-50">
          <Menu.Content className="min-w-[var(--reference-width)] rounded-lg border border-border bg-bg p-1 shadow-xl">
          <Menu.Context>
            {(menu) => (
              <Combobox.Root
                open={menu.open}
                collection={collection}
                inputValue={inputValue}
                disableLayer
                placeholder="Search..."
                inputBehavior="autohighlight"
                selectionBehavior="clear"
                onInputValueChange={(d) => setInputValue(d.inputValue)}
                onValueChange={(d) => {
                  const picked = d.value[0];
                  if (picked) onValueChange(picked);
                  menu.setOpen(false);
                }}
              >
                <Combobox.Content>
                  <div className="relative px-1 pt-1 pb-2">
                    <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted/70" />
                    <Combobox.Input
                      className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-fg outline-none placeholder:text-muted/70 focus:border-accent"
                    />
                  </div>
                  <div className="max-h-60 overflow-auto">
                    {collection.size === 0 && (
                      <span className="block px-3 py-2 text-sm text-muted">
                        No results
                      </span>
                    )}
                    {collection.items.map((item) => (
                      <Combobox.Item
                        key={item.value}
                        item={item}
                        persistFocus
                        className={cn(
                          "flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface",
                          item.value === value && "text-accent",
                        )}
                      >
                        <Combobox.ItemText>{item.label}</Combobox.ItemText>
                        {item.value === value && (
                          <CheckIcon className="size-3.5 text-accent" />
                        )}
                      </Combobox.Item>
                    ))}
                  </div>
                </Combobox.Content>
              </Combobox.Root>
            )}
          </Menu.Context>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
