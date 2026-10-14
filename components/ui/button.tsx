import type {ComponentProps} from "react";
import {buttonClasses, cn, iconButtonClasses, type ButtonVariant} from "@/lib/design-system";

export function Button({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<"button"> & {variant?: ButtonVariant}) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}

export function IconButton({
  className,
  ...props
}: ComponentProps<"button"> & {"aria-label": string}) {
  return <button className={cn(iconButtonClasses, className)} {...props} />;
}
