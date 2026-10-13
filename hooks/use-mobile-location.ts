"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  MobileLocationController,
  readCurrentPosition,
} from "@/lib/mobile-location";

export function useMobileLocation() {
  const [controller] = useState(() => new MobileLocationController());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  const locate = useCallback(() => {
    void controller.requestLocation(() =>
      readCurrentPosition({
        secure: window.isSecureContext,
        geolocation: navigator.geolocation,
      }),
    );
  }, [controller]);
  useEffect(() => {
    const timer = window.setTimeout(locate, 0);
    return () => {
      window.clearTimeout(timer);
      controller.cancelPendingRequests();
    };
  }, [controller, locate]);
  return {
    ...state,
    locate,
    cameraReady: controller.cameraReady,
    radiusReady: controller.radiusReady,
    zoomChanged: controller.zoomChanged,
    mapMoved: controller.mapMoved,
    research: controller.research,
  };
}
