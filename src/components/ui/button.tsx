import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-brand text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_1px_2px_rgb(30_25_22/0.2)] hover:bg-brand-2",
  secondary: "border border-line bg-surface text-ink shadow-card hover:border-line-strong hover:bg-subtle",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  soft: "bg-accent-soft text-accent-ink hover:bg-[#eedfd4]",
  success: "bg-success text-white hover:bg-[#33694d]",
  danger: "bg-danger text-white hover:bg-[#9c3a31]",
  "danger-ghost": "text-danger hover:bg-danger-soft",
} as const;

const sizes = {
  xs: "h-7 gap-1 rounded-lg px-2.5 text-xs",
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-2xl px-5 text-[15px]",
  icon: "h-10 w-10 rounded-xl",
  "icon-sm": "h-8 w-8 rounded-lg",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
