import { cn } from "../lib/utils";

interface LogoProps {
  className?: string;
  variant?: "accent" | "light" | "muted";
}

const fillMap = {
  accent: "fill-accent",
  light: "fill-fg",
  muted: "fill-muted",
};

export function Logo({ className, variant = "accent" }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 800"
      className={cn("size-6", fillMap[variant], className)}
    >
      <title>Pi logo</title>
      <path
        fillRule="evenodd"
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
      />
      <path d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}
