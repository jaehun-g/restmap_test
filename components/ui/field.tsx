import type {ComponentProps} from "react";
import {fieldClasses, type FieldVariant} from "@/lib/design-system";

export function Input({
  variant = "default",
  className,
  ...props
}: ComponentProps<"input"> & {variant?: FieldVariant}) {
  return <input className={fieldClasses(variant, className)} {...props} />;
}

export function Select({
  variant = "default",
  className,
  ...props
}: ComponentProps<"select"> & {variant?: FieldVariant}) {
  return <select className={fieldClasses(variant, className)} {...props} />;
}
