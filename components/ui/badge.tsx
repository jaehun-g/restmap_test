import type {ComponentProps} from "react";
import {badgeClasses, type BadgeVariant} from "@/lib/design-system";

export function Badge({
  variant = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & {variant?: BadgeVariant | "route"}) {
  return <span className={badgeClasses(variant, className)} {...props} />;
}
