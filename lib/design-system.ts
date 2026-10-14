export function cn(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex items-center justify-center gap-[8px] rounded-[9px] border text-[13px] font-semibold [transition:background_0.15s]";
const buttonVariants = {
  primary: "primary border-primary bg-primary text-white hover:bg-primary-dark",
  secondary: "secondary border-line bg-white text-[#384456] hover:bg-[#f5f8fc]",
  ghost: "border-transparent bg-transparent text-muted hover:bg-primary-soft",
} as const;
export type ButtonVariant = keyof typeof buttonVariants;
export function buttonClasses(variant: ButtonVariant = "secondary", className?: string) {
  return cn(
    "button",
    buttonBase,
    "min-h-[42px] px-[15px] py-[9px]",
    buttonVariants[variant],
    className,
  );
}
export const iconButtonClasses =
  "icon-button inline-flex w-[40px] min-h-[40px] items-center justify-center rounded-[8px] border-0 bg-transparent text-[#677384] hover:bg-[#f1f4f8] hover:text-ink";

const fieldVariants = {
  default:
    "w-full min-h-[34px] rounded-[6px] border border-line bg-white px-[8px] py-[7px] text-[11px] text-[#4b617e]",
  search: "min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#334e73] outline-none",
} as const;
export type FieldVariant = keyof typeof fieldVariants;
export function fieldClasses(variant: FieldVariant = "default", className?: string) {
  return cn(fieldVariants[variant], className);
}
const badgeVariants = {
  neutral: "bg-surface text-muted border-line",
  primary: "bg-primary-soft text-primary border-[#cde0ff]",
  station: "bg-station-soft text-station border-[#cfe5d9]",
  lounge: "bg-lounge-soft text-lounge border-[#ffd8aa]",
} as const;
export type BadgeVariant = keyof typeof badgeVariants;
export function badgeClasses(variant: BadgeVariant | "route" = "neutral", className?: string) {
  if (variant === "route") {
    return cn(
      "route-number inline-block ml-[5px] px-[5px] py-0 text-[#5c6d84] bg-[#f0f3f7] border border-[#e4e9f0] rounded-[4px] text-[10px] font-bold align-middle",
      className,
    );
  }
  return cn(
    "inline-flex items-center rounded-[5px] border px-[6px] py-[2px] text-[10px] font-semibold",
    badgeVariants[variant],
    className,
  );
}
