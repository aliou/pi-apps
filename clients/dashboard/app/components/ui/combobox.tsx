import { Combobox as ArkCombobox } from "@ark-ui/react/combobox";
import { type ComponentPropsWithRef, forwardRef } from "react";
import { cn } from "../../lib/utils";

const styles = {
  root: "relative",
  label: "mb-1.5 block text-xs font-medium text-muted",
  control: "relative",
  input:
    "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-muted/70 focus:border-accent",
  trigger:
    "absolute right-1 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-muted hover:text-fg",
  positioner: "z-20",
  content:
    "mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-bg p-1 shadow-xl",
  item:
    "flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm text-fg outline-none data-[highlighted]:bg-surface",
  itemText: "truncate",
  itemIndicator: "text-accent",
};

export interface ComboboxRootProps
  extends React.ComponentPropsWithoutRef<typeof ArkCombobox.Root> {
  className?: string;
}

const ComboboxRoot = forwardRef<HTMLDivElement, ComboboxRootProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.Root
      ref={ref as any}
      className={cn(styles.root, className)}
      {...props}
    />
  ),
);
ComboboxRoot.displayName = "Combobox.Root";

export interface ComboboxLabelProps
  extends ComponentPropsWithRef<typeof ArkCombobox.Label> {}

const ComboboxLabel = forwardRef<HTMLLabelElement, ComboboxLabelProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.Label
      ref={ref}
      className={cn(styles.label, className)}
      {...props}
    />
  ),
);
ComboboxLabel.displayName = "Combobox.Label";

export interface ComboboxControlProps
  extends ComponentPropsWithRef<typeof ArkCombobox.Control> {}

const ComboboxControl = forwardRef<HTMLDivElement, ComboboxControlProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.Control
      ref={ref}
      className={cn(styles.control, className)}
      {...props}
    />
  ),
);
ComboboxControl.displayName = "Combobox.Control";

export interface ComboboxInputProps
  extends ComponentPropsWithRef<typeof ArkCombobox.Input> {}

const ComboboxInput = forwardRef<HTMLInputElement, ComboboxInputProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.Input
      ref={ref}
      className={cn(styles.input, className)}
      {...props}
    />
  ),
);
ComboboxInput.displayName = "Combobox.Input";

export interface ComboboxTriggerProps
  extends ComponentPropsWithRef<typeof ArkCombobox.Trigger> {}

const ComboboxTrigger = forwardRef<HTMLButtonElement, ComboboxTriggerProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.Trigger
      ref={ref}
      className={cn(styles.trigger, className)}
      {...props}
    />
  ),
);
ComboboxTrigger.displayName = "Combobox.Trigger";

export interface ComboboxPositionerProps
  extends ComponentPropsWithRef<typeof ArkCombobox.Positioner> {}

const ComboboxPositioner = forwardRef<HTMLDivElement, ComboboxPositionerProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.Positioner
      ref={ref}
      className={cn(styles.positioner, className)}
      {...props}
    />
  ),
);
ComboboxPositioner.displayName = "Combobox.Positioner";

export interface ComboboxContentProps
  extends ComponentPropsWithRef<typeof ArkCombobox.Content> {}

const ComboboxContent = forwardRef<HTMLDivElement, ComboboxContentProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.Content
      ref={ref}
      className={cn(styles.content, className)}
      {...props}
    />
  ),
);
ComboboxContent.displayName = "Combobox.Content";

export interface ComboboxItemProps
  extends ComponentPropsWithRef<typeof ArkCombobox.Item> {}

const ComboboxItem = forwardRef<HTMLDivElement, ComboboxItemProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.Item
      ref={ref}
      className={cn(styles.item, className)}
      {...props}
    />
  ),
);
ComboboxItem.displayName = "Combobox.Item";

export interface ComboboxItemTextProps
  extends ComponentPropsWithRef<typeof ArkCombobox.ItemText> {}

const ComboboxItemText = forwardRef<HTMLDivElement, ComboboxItemTextProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.ItemText
      ref={ref}
      className={cn(styles.itemText, className)}
      {...props}
    />
  ),
);
ComboboxItemText.displayName = "Combobox.ItemText";

export interface ComboboxItemIndicatorProps
  extends ComponentPropsWithRef<typeof ArkCombobox.ItemIndicator> {}

const ComboboxItemIndicator = forwardRef<
  HTMLDivElement,
  ComboboxItemIndicatorProps
>(({ className, ...props }, ref) => (
  <ArkCombobox.ItemIndicator
    ref={ref}
    className={cn(styles.itemIndicator, className)}
    {...props}
  />
));
ComboboxItemIndicator.displayName = "Combobox.ItemIndicator";

export interface ComboboxRootProviderProps
  extends React.ComponentPropsWithoutRef<typeof ArkCombobox.RootProvider> {
  className?: string;
}

const ComboboxRootProvider = forwardRef<HTMLDivElement, ComboboxRootProviderProps>(
  ({ className, ...props }, ref) => (
    <ArkCombobox.RootProvider
      ref={ref as any}
      className={cn(styles.root, className)}
      {...props}
    />
  ),
);
ComboboxRootProvider.displayName = "Combobox.RootProvider";

const ComboboxContext = ArkCombobox.Context;

export const Combobox = Object.assign(ComboboxRoot, {
  Root: ComboboxRoot,
  Label: ComboboxLabel,
  Control: ComboboxControl,
  Input: ComboboxInput,
  Trigger: ComboboxTrigger,
  Positioner: ComboboxPositioner,
  Content: ComboboxContent,
  Item: ComboboxItem,
  ItemText: ComboboxItemText,
  ItemIndicator: ComboboxItemIndicator,
  RootProvider: ComboboxRootProvider,
  Context: ComboboxContext,
});
