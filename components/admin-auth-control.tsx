"use client";
import { useState } from "react";
import type { useAdminSession } from "@/hooks/use-admin-session";
import Icon from "./icon";

export default function AdminAuthControl({
  auth,
  onLogout,
}: {
  auth: ReturnType<typeof useAdminSession>;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  return (
    <div className="auth-control">
      {auth.authenticated ? (
        <button
          className="button secondary"
          disabled={auth.loading}
          onClick={onLogout}
        >
          <Icon name="lock" size={16} />
          편집 잠금
        </button>
      ) : (
        <button
          className="button secondary"
          disabled={auth.loading}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <Icon name="lock" size={16} />
          관리자 인증
        </button>
      )}
      {open && !auth.authenticated && (
        <form
          className="auth-popover"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await auth.login(password);
            setPassword("");
            if (ok) setOpen(false);
          }}
        >
          <div>
            <strong>관리자 편집 잠금 해제</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="인증창 닫기"
              onClick={() => {
                setOpen(false);
                setPassword("");
              }}
            >
              <Icon name="close" size={17} />
            </button>
          </div>
          {!auth.configured ? (
            <p>
              서버 환경변수 <code>ADMIN_PASSWORD</code>를 설정하고 서버를
              재시작해주세요.
            </p>
          ) : (
            <>
              <label>
                관리자 암호
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  maxLength={1024}
                  required
                />
              </label>
              <button className="button primary" disabled={auth.loading}>
                잠금 해제
              </button>
            </>
          )}
          {auth.error && (
            <p className="form-error" role="alert">
              {auth.error}
            </p>
          )}
        </form>
      )}
      {auth.error && !open && (
        <span className="auth-error" role="alert">
          {auth.error}
        </span>
      )}
    </div>
  );
}
