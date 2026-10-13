"use client";
import { useCallback, useEffect, useState } from "react";

type Session = {
  configured: boolean;
  authenticated: boolean;
  expiresAt: number | null;
};
const initial: Session = {
  configured: false,
  authenticated: false,
  expiresAt: null,
};
export function useAdminSession() {
  const [session, setSession] = useState<Session>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store" });
      if (!response.ok)
        throw new Error("관리자 인증 상태를 확인하지 못했습니다.");
      setSession(await response.json());
      setError(null);
    } catch (reason) {
      setSession(initial);
      setError(
        reason instanceof Error
          ? reason.message
          : "인증 상태를 확인하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!session.authenticated || !session.expiresAt) return;
    const timer = setTimeout(
      () =>
        setSession((current) => ({
          ...current,
          authenticated: false,
          expiresAt: null,
        })),
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  const login = useCallback(async (password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || "인증하지 못했습니다.");
      setSession(data);
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "인증하지 못했습니다.",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);
  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok)
        throw new Error("로그아웃하지 못했습니다. 다시 시도해주세요.");
      setSession((current) => ({
        ...current,
        authenticated: false,
        expiresAt: null,
      }));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "로그아웃하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  return { ...session, loading, error, refresh, login, logout };
}
