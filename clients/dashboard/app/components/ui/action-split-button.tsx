import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { Tooltip } from "@ark-ui/react/tooltip";
import { CaretDownIcon, InfoIcon } from "@phosphor-icons/react";
import { type ComponentPropsWithRef, type ReactNode, forwardRef } from "react";
import { cn } from "../../lib/utils";
import { Button, type ButtonProps } from "./button";

function ActionSplitButtonRoot({
  className,
  ...props
}: ComponentPropsWithRef<"div">) {
  return <div className={cn("inline-flex items-stretch", className)} {...props} />;
}

const ActionSplitButtonMain = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => {
    return <Button ref={ref} className={cn("rounded-r-none", className)} {...props} />;
  },
);

ActionSplitButtonMain.displayName = "ActionSplitButtonMain";

interface ActionSplitButtonMenuProps {
  disabled?: boolean;
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}

function ActionSplitButtonMenu({
  disabled,
  children,
  variant = "primary",
  size = "md",
}: ActionSplitButtonMenuProps) {
  return (
    <Menu.Root composite={false}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          disabled={disabled}
          variant={variant}
          size={size}
          className="rounded-l-none border-l border-border px-3"
        >
          <CaretDownIcon className="size-3.5" />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner className="z-50">
          <Menu.Content className="min-w-64 rounded-lg border border-border bg-bg p-1 shadow-xl">
            {children}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

interface ActionSplitButtonItemProps {
  value: string;
  onSelect: () => void;
  children: ReactNode;
  description?: string;
}

function ActionSplitButtonItem({
  value,
  onSelect,
  children,
  description,
}: ActionSplitButtonItemProps) {
  return (
    <Menu.Item
      value={value}
      onClick={onSelect}
      className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface"
    >
      <span>{children}</span>
      {description ? (
        <Tooltip.Root openDelay={200}>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="inline-flex items-center text-muted hover:text-fg"
              aria-label="Action description"
            >
              <InfoIcon className="size-3.5" />
            </button>
          </Tooltip.Trigger>
          <Portal>
            <Tooltip.Positioner className="z-[60]">
              <Tooltip.Content className="max-w-64 rounded-md border border-border bg-bg px-2 py-1 text-xs text-muted shadow-lg">
                {description}
              </Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        </Tooltip.Root>
      ) : null}
    </Menu.Item>
  );
}

export const ActionSplitButton = {
  Root: ActionSplitButtonRoot,
  Main: ActionSplitButtonMain,
  Menu: ActionSplitButtonMenu,
  Item: ActionSplitButtonItem,
};
