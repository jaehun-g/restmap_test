"use client";

import {useEffect, useState} from "react";
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <h2 className="text-xl font-bold">휴게소 변경 확인</h2>
        {result.error && <p role="alert">{result.error}</p>}
        {result.items.length > 0 && (
          <>
            <p>
              운영 상태 또는 기준정보를 확인해 주세요. API 누락만으로 영업 종료가 확정되지는 않습니다.
            </p>
            <ul className="min-h-0 flex-1 overflow-auto divide-y">
              {result.items.map(item => (
                <li key={`${item.id}-${item.reason}`} className="py-3">
                  <strong>{item.name}</strong>
                  <span className="ml-2 text-sm text-gray-600">{item.reason}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          className="self-end rounded bg-slate-800 px-4 py-2 text-white"
          onClick={() => setResult(null)}
        >
          닫기
        </button>
      </div>
    </AdminDetailModal>
  );
}
