import type {ComponentProps} from "react";
import {cn} from "@/lib/design-system";
import {sharedClasses} from "@/lib/shared-classes";

export function FilterChip({
  active = false,
  variant = "default",
  className,
  ...props
}: ComponentProps<"button"> & {active?: boolean; variant?: "default" | "lounge"}) {
  return (
    <button
      className={cn(
        sharedClasses.filterChip,
        variant === "lounge" ? "lounge-toggle" : active && "active",
        variant === "lounge" && active && "on",
        className,
      )}
      {...props}
    />
  );
}
