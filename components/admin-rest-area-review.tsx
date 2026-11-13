"use client";

import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {sharedClasses} from "@/lib/shared-classes";
import AdminDetailModal from "./admin-detail-modal";
import type {RestAreaReview} from "@/lib/rest-area-review";

export default function AdminRestAreaReview({authenticated}: {authenticated: boolean}) {
  const [result, setResult] = useState<{items: RestAreaReview[]; error?: string} | null>(null);
  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    fetch("/api/admin/rest-area-review", {cache: "no-store", signal: controller.signal})
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.items.length || data.error) setResult(data);
      })
      .catch(error => {
        if (error.name !== "AbortError")
          setResult({
            items: [],
            error: "휴게소 변경사항을 확인하지 못했습니다. 잠시 후 다시 진입해 주세요.",
          });
      });
    return () => controller.abort();
  }, [authenticated]);
  if (!authenticated || !result) return null;
  return (
    <AdminDetailModal onClose={() => setResult(null)}>
      <div className={sharedClasses.editorPanel}>
        <div className={sharedClasses.editorHeading}>
          <div>
            <span className={sharedClasses.eyebrow}>관리자 검토</span>
            <h2>휴게소 변경 확인</h2>
          </div>
        </div>
        <div className={`${sharedClasses.editorScroll} flex flex-1 flex-col gap-[12px]`}>
          {result.error && (
            <p className={sharedClasses.formError} role="alert">
              {result.error}
            </p>
          )}
          {result.items.length > 0 && (
            <>
              <p className="text-ui-12 text-muted">
                운영 상태 또는 기준정보를 확인해 주세요. API 누락만으로 영업 종료가 확정되지는 않습니다.
              </p>
              <ul className="min-h-0 flex-1 overflow-auto divide-y divide-line">
                {result.items.map(item => (
                  <li key={`${item.id}-${item.reason}`} className="py-[12px] text-ui-14 text-ink">
                    <strong>{item.name}</strong>
                    <span className="ml-[8px] text-ui-12 text-muted">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className={sharedClasses.editorActions}>
          <Button type="button" variant="primary" onClick={() => setResult(null)}>
            닫기
          </Button>
        </div>
      </div>
    </AdminDetailModal>
  );
}
