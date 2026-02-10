import { Collapsible as ArkCollapsible } from "@ark-ui/react/collapsible";
import { type ComponentPropsWithRef, forwardRef } from "react";
import { cn } from "../../lib/utils";

const styles = {
  root: "",
  trigger: "",
  content: "",
};

export interface CollapsibleRootProps
  extends React.ComponentPropsWithoutRef<typeof ArkCollapsible.Root> {
  className?: string;
}

const CollapsibleRoot = forwardRef<HTMLDivElement, CollapsibleRootProps>(
  ({ className, ...props }, ref) => (
    <ArkCollapsible.Root
      ref={ref}
      className={cn(styles.root, className)}
      {...props}
    />
  ),
);
CollapsibleRoot.displayName = "Collapsible.Root";

export interface CollapsibleTriggerProps
  extends ComponentPropsWithRef<typeof ArkCollapsible.Trigger> {}

const CollapsibleTrigger = forwardRef<
  HTMLButtonElement,
  CollapsibleTriggerProps
>(({ className, ...props }, ref) => (
  <ArkCollapsible.Trigger
    ref={ref}
    className={cn(styles.trigger, className)}
    {...props}
  />
));
CollapsibleTrigger.displayName = "Collapsible.Trigger";

export interface CollapsibleContentProps
  extends ComponentPropsWithRef<typeof ArkCollapsible.Content> {}

const CollapsibleContent = forwardRef<HTMLDivElement, CollapsibleContentProps>(
  ({ className, ...props }, ref) => (
    <ArkCollapsible.Content
      ref={ref}
      className={cn(styles.content, className)}
      {...props}
    />
  ),
);
CollapsibleContent.displayName = "Collapsible.Content";

const CollapsibleContext = ArkCollapsible.Context;

export const Collapsible = Object.assign(CollapsibleRoot, {
  Root: CollapsibleRoot,
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent,
  Context: CollapsibleContext,
});
