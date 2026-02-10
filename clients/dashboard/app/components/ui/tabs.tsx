import { Tabs as ArkTabs } from "@ark-ui/react/tabs";
import { type ComponentPropsWithRef, forwardRef } from "react";
import { cn } from "../../lib/utils";

const styles = {
  root: "",
  list: "relative flex gap-1 border-b border-border",
  trigger:
    "flex cursor-pointer items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-fg data-[selected]:border-transparent data-[selected]:text-accent",
  indicator:
    "absolute -bottom-px h-0.5 bg-accent transition-all duration-200 left-(--left) w-(--width)",
  content: "",
};

// Root
export interface TabsRootProps extends React.ComponentPropsWithoutRef<typeof ArkTabs.Root> {
  className?: string;
}

const TabsRoot = forwardRef<HTMLDivElement, TabsRootProps>(
  ({ className, ...props }, ref) => (
    <ArkTabs.Root ref={ref as any} className={cn(styles.root, className)} {...props} />
  ),
);
TabsRoot.displayName = "Tabs.Root";

// List
export interface TabsListProps extends ComponentPropsWithRef<typeof ArkTabs.List> {}

const TabsList = forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, ...props }, ref) => (
    <ArkTabs.List ref={ref} className={cn(styles.list, className)} {...props} />
  ),
);
TabsList.displayName = "Tabs.List";

// Trigger
export interface TabsTriggerProps
  extends ComponentPropsWithRef<typeof ArkTabs.Trigger> {}

const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, ...props }, ref) => (
    <ArkTabs.Trigger
      ref={ref}
      className={cn(styles.trigger, className)}
      {...props}
    />
  ),
);
TabsTrigger.displayName = "Tabs.Trigger";

// Indicator
export interface TabsIndicatorProps
  extends ComponentPropsWithRef<typeof ArkTabs.Indicator> {}

const TabsIndicator = forwardRef<HTMLDivElement, TabsIndicatorProps>(
  ({ className, ...props }, ref) => (
    <ArkTabs.Indicator
      ref={ref}
      className={cn(styles.indicator, className)}
      {...props}
    />
  ),
);
TabsIndicator.displayName = "Tabs.Indicator";

// Content
export interface TabsContentProps
  extends ComponentPropsWithRef<typeof ArkTabs.Content> {}

const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, ...props }, ref) => (
    <ArkTabs.Content
      ref={ref}
      className={cn(styles.content, className)}
      {...props}
    />
  ),
);
TabsContent.displayName = "Tabs.Content";

// RootProvider
export interface TabsRootProviderProps
  extends React.ComponentPropsWithoutRef<typeof ArkTabs.RootProvider> {
  className?: string;
}

const TabsRootProvider = forwardRef<HTMLDivElement, TabsRootProviderProps>(
  ({ className, ...props }, ref) => (
    <ArkTabs.RootProvider
      ref={ref as any}
      className={cn(styles.root, className)}
      {...props}
    />
  ),
);
TabsRootProvider.displayName = "Tabs.RootProvider";

// Context
const TabsContext = ArkTabs.Context;

// Compound export
export const Tabs = Object.assign(TabsRoot, {
  Root: TabsRoot,
  List: TabsList,
  Trigger: TabsTrigger,
  Indicator: TabsIndicator,
  Content: TabsContent,
  RootProvider: TabsRootProvider,
  Context: TabsContext,
});
