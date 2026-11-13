export function cn(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex items-center justify-center gap-[8px] rounded-[9px] border text-ui-14 font-semibold [transition:background_0.15s,border-color_0.15s,color_0.15s,box-shadow_0.15s]";
const buttonVariants = {
  primary: "primary border-primary bg-primary text-white hover:bg-primary-dark",
  secondary: "secondary border-line bg-white text-ink hover:bg-surface",
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
  "icon-button inline-flex w-[40px] min-h-[40px] items-center justify-center rounded-[8px] border-0 bg-transparent text-muted [transition:background_0.15s,color_0.15s] hover:bg-surface hover:text-ink";

const fieldVariants = {
  default:
    "w-full min-h-[34px] rounded-[6px] border border-line bg-white px-[8px] py-[7px] text-ui-12 text-ink outline-none [transition:border-color_0.15s,box-shadow_0.15s] focus:border-focus focus:[box-shadow:0_0_0_2px_var(--color-focus-ring)]",
  search: "min-w-0 flex-1 border-0 bg-transparent text-ui-12 text-ink outline-none",
} as const;
export type FieldVariant = keyof typeof fieldVariants;
export function fieldClasses(variant: FieldVariant = "default", className?: string) {
  return cn(fieldVariants[variant], className);
}
const badgeVariants = {
  neutral: "bg-surface text-muted border-line",
  primary: "bg-primary-soft text-primary border-primary-line",
  station: "bg-station-soft text-station border-station-line",
  lounge: "bg-lounge-soft text-lounge border-lounge-line",
  danger: "bg-danger-soft text-danger border-danger-line",
} as const;
export type BadgeVariant = keyof typeof badgeVariants;
export function badgeClasses(variant: BadgeVariant | "route" = "neutral", className?: string) {
  if (variant === "route") {
    return cn(
      "route-number inline-block ml-[5px] px-[5px] py-0 text-muted bg-surface border border-line rounded-[4px] text-ui-10 font-bold align-middle",
      className,
    );
  }
  return cn(
    "inline-flex items-center rounded-[5px] border px-[6px] py-[2px] text-ui-10 font-semibold",
    badgeVariants[variant],
    className,
  );
}

export const dialogBackdropClasses =
  "admin-detail-modal-backdrop fixed inset-[0] z-[60] flex items-center justify-center bg-backdrop p-[28px]";

export function dialogClasses(wide = false, className?: string) {
  return cn(
    "admin-detail-modal flex min-h-0 h-[min(760px,_calc(100dvh_-_56px))]",
    wide ? "w-[min(1240px,_calc(100vw_-_32px))]" : "w-[min(660px,_calc(100vw_-_56px))]",
    "flex-col overflow-hidden rounded-[14px] bg-white outline-none [box-shadow:0_22px_70px_#07142666]",
    className,
  );
}
