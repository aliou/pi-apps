import { Portal } from "@ark-ui/react/portal";
import { Select as ArkSelect, createListCollection } from "@ark-ui/react/select";
import { CaretUpDownIcon, CheckIcon } from "@phosphor-icons/react";
import { type ReactNode, type RefObject, useMemo } from "react";
import { cn } from "../../lib/utils";

export interface SelectItem {
  value: string;
  label: string;
  description?: string;
}

interface SelectProps<T extends SelectItem> {
  items: T[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  renderItem?: (item: T, selected: boolean) => ReactNode;
  emptyText?: string;
  portalled?: boolean;
  portalContainer?: RefObject<HTMLElement | null>;
}

export function Select<T extends SelectItem>({
  items,
  value,
  onValueChange,
  placeholder = "Select...",
  disabled,
  className,
  renderItem,
  emptyText = "No options",
  portalled = true,
  portalContainer,
}: SelectProps<T>) {
  const collection = useMemo(() => createListCollection({ items }), [items]);
  const selected = items.find((item) => item.value === value);

  return (
    <ArkSelect.Root
      collection={collection}
      value={value ? [value] : []}
      disabled={disabled}
      lazyMount
      unmountOnExit
      positioning={{ sameWidth: true }}
      onValueChange={(details) => {
        const next = details.value[0];
        if (next) onValueChange(next);
      }}
    >
      <ArkSelect.HiddenSelect />
      <ArkSelect.Control>
        <ArkSelect.Trigger
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 text-left text-sm text-fg outline-none transition-colors hover:border-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted/70")}>
            {selected?.label ?? placeholder}
          </span>
          <CaretUpDownIcon className="size-4 shrink-0 text-muted" />
        </ArkSelect.Trigger>
      </ArkSelect.Control>

      {portalled ? (
        <Portal container={portalContainer}>
          <ArkSelect.Positioner className="z-[70] w-[--reference-width]">
            <ArkSelect.Content className="max-h-72 overflow-auto rounded-lg border border-border bg-bg p-1 shadow-xl">
              {items.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted">{emptyText}</div>
              ) : (
                collection.items.map((item) => (
                  <ArkSelect.Item
                    key={item.value}
                    item={item}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface"
                  >
                    <div className="min-w-0 flex-1">
                      {renderItem ? (
                        <>
                          <ArkSelect.ItemText className="sr-only">
                            {item.label}
                          </ArkSelect.ItemText>
                          {renderItem(item, item.value === value)}
                        </>
                      ) : (
                        <>
                          <ArkSelect.ItemText className="block truncate">
                            {item.label}
                          </ArkSelect.ItemText>
                          {item.description && (
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {item.description}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <ArkSelect.ItemIndicator className="shrink-0 text-accent">
                      <CheckIcon className="size-4" weight="bold" />
                    </ArkSelect.ItemIndicator>
                  </ArkSelect.Item>
                ))
              )}
            </ArkSelect.Content>
          </ArkSelect.Positioner>
        </Portal>
      ) : (
        <ArkSelect.Positioner className="z-[70] w-[--reference-width]">
          <ArkSelect.Content className="max-h-72 overflow-auto rounded-lg border border-border bg-bg p-1 shadow-xl">
            {items.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted">{emptyText}</div>
            ) : (
              collection.items.map((item) => (
                <ArkSelect.Item
                  key={item.value}
                  item={item}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface"
                >
                  <div className="min-w-0 flex-1">
                    {renderItem ? (
                      <>
                        <ArkSelect.ItemText className="sr-only">
                          {item.label}
                        </ArkSelect.ItemText>
                        {renderItem(item, item.value === value)}
                      </>
                    ) : (
                      <>
                        <ArkSelect.ItemText className="block truncate">
                          {item.label}
                        </ArkSelect.ItemText>
                        {item.description && (
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {item.description}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <ArkSelect.ItemIndicator className="shrink-0 text-accent">
                    <CheckIcon className="size-4" weight="bold" />
                  </ArkSelect.ItemIndicator>
                </ArkSelect.Item>
              ))
            )}
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      )}
    </ArkSelect.Root>
  );
}
