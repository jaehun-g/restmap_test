"use client";

import {useEffect, useRef, useSyncExternalStore, type ReactNode} from "react";
import {createPortal} from "react-dom";

const emptySubscribe = () => () => {};

export default function AdminDetailModal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    dialog.current?.focus({preventScroll: true});
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  if (!isClient) return null;

  const target =
    (document.fullscreenElement as HTMLElement | null) ?? document.body;

  return createPortal(
    <div
      className="admin-detail-modal-backdrop fixed inset-[0] z-[60] flex items-center justify-center bg-[#12233b99] p-[28px]"
      onMouseDown={onClose}
    >
      <div
        ref={dialog}
        aria-modal="true"
        className="admin-detail-modal flex min-h-0 h-[min(760px,_calc(100dvh_-_56px))] w-[min(660px,_calc(100vw_-_56px))] flex-col overflow-hidden rounded-[14px] bg-white [box-shadow:0_22px_70px_#07142666]"
        role="dialog"
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    target,
  );
}
