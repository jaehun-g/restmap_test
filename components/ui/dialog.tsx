"use client";

import {useEffect, useRef, useSyncExternalStore, type ComponentPropsWithRef} from "react";
import {createPortal} from "react-dom";
import {dialogBackdropClasses, dialogClasses} from "@/lib/design-system";

const emptySubscribe = () => () => {};

export function Dialog({
  children,
  className,
  onClose,
  wide = false,
  ...props
}: ComponentPropsWithRef<"div"> & {
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (isClient) dialog.current?.focus({preventScroll: true});
  }, [isClient]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  const content = (
    <div className={dialogBackdropClasses} onMouseDown={onClose}>
      <div
        {...props}
        ref={dialog}
        aria-modal="true"
        className={dialogClasses(wide, className)}
        role="dialog"
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  if (!isClient) return content;

  const target =
    (document.fullscreenElement as HTMLElement | null) ?? document.body;

  return createPortal(content, target);
}

