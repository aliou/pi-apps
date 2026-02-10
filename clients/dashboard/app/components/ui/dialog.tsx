import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal as ArkPortal } from "@ark-ui/react/portal";
import { type ComponentPropsWithRef, forwardRef } from "react";
import { cn } from "../../lib/utils";

const styles = {
  root: "",
  backdrop:
    "fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  positioner: "fixed inset-0 z-50 flex items-center justify-center",
  content:
    "relative w-full max-w-md rounded-xl border border-border bg-bg p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  title: "text-base font-semibold text-fg",
  description: "text-sm text-muted",
  closeTrigger: "rounded-md p-1 text-muted hover:text-fg",
};

// Root
export interface DialogRootProps
  extends React.ComponentPropsWithoutRef<typeof ArkDialog.Root> {}

const DialogRoot = (props: DialogRootProps) => (
  <ArkDialog.Root {...props} />
);
DialogRoot.displayName = "Dialog.Root";

// Trigger
export interface DialogTriggerProps
  extends ComponentPropsWithRef<typeof ArkDialog.Trigger> {}

const DialogTrigger = forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ className, ...props }, ref) => (
    <ArkDialog.Trigger ref={ref} className={className} {...props} />
  ),
);
DialogTrigger.displayName = "Dialog.Trigger";

// Backdrop
export interface DialogBackdropProps
  extends ComponentPropsWithRef<typeof ArkDialog.Backdrop> {}

const DialogBackdrop = forwardRef<HTMLDivElement, DialogBackdropProps>(
  ({ className, ...props }, ref) => (
    <ArkDialog.Backdrop
      ref={ref}
      className={cn(styles.backdrop, className)}
      {...props}
    />
  ),
);
DialogBackdrop.displayName = "Dialog.Backdrop";

// Positioner
export interface DialogPositionerProps
  extends ComponentPropsWithRef<typeof ArkDialog.Positioner> {}

const DialogPositioner = forwardRef<HTMLDivElement, DialogPositionerProps>(
  ({ className, ...props }, ref) => (
    <ArkDialog.Positioner
      ref={ref}
      className={cn(styles.positioner, className)}
      {...props}
    />
  ),
);
DialogPositioner.displayName = "Dialog.Positioner";

// Content
export interface DialogContentProps
  extends ComponentPropsWithRef<typeof ArkDialog.Content> {}

const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, ...props }, ref) => (
    <ArkDialog.Content
      ref={ref}
      className={cn(styles.content, className)}
      {...props}
    />
  ),
);
DialogContent.displayName = "Dialog.Content";

// Title
export interface DialogTitleProps
  extends ComponentPropsWithRef<typeof ArkDialog.Title> {}

const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(
  ({ className, ...props }, ref) => (
    <ArkDialog.Title
      ref={ref}
      className={cn(styles.title, className)}
      {...props}
    />
  ),
);
DialogTitle.displayName = "Dialog.Title";

// Description
export interface DialogDescriptionProps
  extends ComponentPropsWithRef<typeof ArkDialog.Description> {}

const DialogDescription = forwardRef<HTMLParagraphElement, DialogDescriptionProps>(
  ({ className, ...props }, ref) => (
    <ArkDialog.Description
      ref={ref}
      className={cn(styles.description, className)}
      {...props}
    />
  ),
);
DialogDescription.displayName = "Dialog.Description";

// CloseTrigger
export interface DialogCloseTriggerProps
  extends ComponentPropsWithRef<typeof ArkDialog.CloseTrigger> {}

const DialogCloseTrigger = forwardRef<HTMLButtonElement, DialogCloseTriggerProps>(
  ({ className, ...props }, ref) => (
    <ArkDialog.CloseTrigger
      ref={ref}
      className={cn(styles.closeTrigger, className)}
      {...props}
    />
  ),
);
DialogCloseTrigger.displayName = "Dialog.CloseTrigger";

// RootProvider
export interface DialogRootProviderProps
  extends React.ComponentPropsWithoutRef<typeof ArkDialog.RootProvider> {}

const DialogRootProvider = (props: DialogRootProviderProps) => (
  <ArkDialog.RootProvider {...props} />
);
DialogRootProvider.displayName = "Dialog.RootProvider";

// Context
const DialogContext = ArkDialog.Context;

// Portal
export interface DialogPortalProps
  extends React.ComponentPropsWithoutRef<typeof ArkPortal> {}

const DialogPortal = (props: DialogPortalProps) => (
  <ArkPortal {...props} />
);
DialogPortal.displayName = "Dialog.Portal";

// Compound export
export const Dialog = Object.assign(DialogRoot, {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Backdrop: DialogBackdrop,
  Positioner: DialogPositioner,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  CloseTrigger: DialogCloseTrigger,
  RootProvider: DialogRootProvider,
  Context: DialogContext,
  Portal: DialogPortal,
});
