import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: Variant;
  size?: Size;
  /** Work is in flight: the button stays focusable but ignores presses. */
  busy?: boolean;
  type?: "button" | "submit";
}

// Press feedback is a transform, so nothing reflows. Colours change without a transition.
const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium select-none whitespace-nowrap " +
  "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-g-accent " +
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 " +
  "aria-disabled:cursor-progress aria-disabled:opacity-70 aria-disabled:active:scale-100";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-g-accent text-g-accentInk hover:bg-g-accentHover active:bg-g-accentPress",
  secondary: "border border-g-line bg-g-raised text-g-text hover:border-g-lineStrong hover:bg-g-hover active:bg-g-base",
  ghost: "text-g-muted hover:bg-g-hover hover:text-g-text active:bg-g-base",
  danger: "border border-g-line bg-g-raised text-g-danger hover:border-g-danger active:bg-g-base",
};

const SIZES: Record<Size, string> = {
  md: "h-9 px-4 text-sm",
  sm: "h-8 px-3 text-[13px]",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", busy = false, type = "button", className = "", onClick, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      onClick={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </button>
  );
});
