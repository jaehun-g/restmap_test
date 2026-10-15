"use client";
import {Button, IconButton} from "@/components/ui/button";
import {Input} from "@/components/ui/field";
import {useState} from "react";
import type {useAdminSession} from "@/hooks/use-admin-session";
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
    <div className="auth-control relative">
      {auth.authenticated ? (
        <Button disabled={auth.loading} onClick={onLogout} variant="secondary">
          <Icon name="lock" size={16} />
          편집 잠금
        </Button>
      ) : (
        <Button
          disabled={auth.loading}
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          variant="secondary"
        >
          <Icon name="lock" size={16} />
          관리자 인증
        </Button>
      )}
      {open && !auth.authenticated && (
        <form
          className="auth-popover absolute z-[20] right-[0] top-[49px] w-[290px] p-[17px] bg-white [border:1px_solid_#dfe7f2] rounded-[12px] [box-shadow:0_6px_25px_#23416a20]"
          onSubmit={async event => {
            event.preventDefault();
            const ok = await auth.login(password);
            setPassword("");
            if (ok) setOpen(false);
          }}
        >
          <div>
            <strong>관리자 편집 잠금 해제</strong>
            <IconButton
              type="button"
              aria-label="인증창 닫기"
              onClick={() => {
                setOpen(false);
                setPassword("");
              }}
            >
              <Icon name="close" size={17} />
            </IconButton>
          </div>
          {!auth.configured ? (
            <p>
              서버 환경변수 <code>ADMIN_PASSWORD</code>를 설정하고 서버를 재시작해주세요.
            </p>
          ) : (
            <>
              <label>
                관리자 암호
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  maxLength={1024}
                  required
                />
              </label>
              <Button disabled={auth.loading} variant="primary">
                잠금 해제
              </Button>
            </>
          )}
          {auth.error && (
            <p
              className="form-error p-[10px] m-[10px_0] [border:1px_solid_#f0d6d1] rounded-[6px] bg-[#fff7f5] text-[11px] leading-[1.7]"
              role="alert"
            >
              {auth.error}
            </p>
          )}
        </form>
      )}
      {auth.error && !open && (
        <span
          className="auth-error absolute top-[48px] right-[0] w-[260px] text-[#b2645b] bg-white p-[10px] rounded-[5px] text-[10px] z-[10]"
          role="alert"
        >
          {auth.error}
        </span>
      )}
    </div>
  );
}
