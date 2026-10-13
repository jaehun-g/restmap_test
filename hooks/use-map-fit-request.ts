"use client";
import { useCallback, useState } from "react";
import type { MapFitRequest } from "@/lib/map-fit-policy";

export function useMapFitRequest() {
  const [fitRequest, setFitRequest] = useState<MapFitRequest>({
    sequence: 0,
    fit: true,
  });
  const requestFit = useCallback(() => {
    setFitRequest((current) => ({ sequence: current.sequence + 1, fit: true }));
  }, []);
  const preserveView = useCallback(() => {
    setFitRequest((current) => ({
      sequence: current.sequence + 1,
      fit: false,
    }));
  }, []);
  return { fitRequest, requestFit, preserveView };
}
