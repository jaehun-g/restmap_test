"use client";

import type {ReactNode} from "react";
import {Dialog} from "@/components/ui/dialog";

export default function AdminDetailModal({
  children,
  onClose,
  wide = false,
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog onClose={onClose} wide={wide}>
      {children}
    </Dialog>
  );
}
