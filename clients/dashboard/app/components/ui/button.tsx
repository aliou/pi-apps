import { CircleNotchIcon } from "@phosphor-icons/react";
import { type ComponentPropsWithRef, forwardRef } from "react";
import { cn } from "../../lib/utils";

const variants = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-border text-muted hover:text-fg",
  ghost: "text-muted hover:text-fg hover:bg-surface",
  danger: "bg-red-500 text-white hover:bg-red-600",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
          "cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && <CircleNotchIcon className="size-4 animate-spin" />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
