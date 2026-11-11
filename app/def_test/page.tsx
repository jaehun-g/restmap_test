"use client";

import {useEffect, useState} from "react";
import {areas, priceChange} from "./data";
import "./test.css";

type Result = {
  regional: {average: number | null; count: number};
  national: {average: number | null; count: number};
  retrievedAt: string;
};

function Change({current, previous}: {current: number | null; previous: number | null}) {
  const change = priceChange(current, previous);
  if (!change) return <span className="def-test-change" aria-label="비교 가격 없음">—</span>;
  const direction = change.difference > 0 ? "up" : change.difference < 0 ? "down" : "same";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "−";
  return <span className={`def-test-change def-test-${direction}`}>{arrow} {Math.abs(change.difference).toFixed(1)}원 ({Math.abs(change.percent).toFixed(2)}%)</span>;
}

export default function DefTestPage() {
  const [area, setArea] = useState("02");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const name = areas.find(([code]) => code === area)?.[1];

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/def_test/api?area=${area}`, {signal: controller.signal})
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "데이터를 불러오지 못했습니다.");
        setResult(data);
      })
      .catch(err => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [area, refresh]);

  const price = (value: number | null) =>
    value === null
      ? "데이터 없음"
      : `${value.toLocaleString("ko-KR", {minimumFractionDigits: 1, maximumFractionDigits: 1})}원`;
  const reset = () => {
    setLoading(true);
    setError("");
    setResult(null);
  };

  return (
    <main className="def-test-page">
      <section className="def-test-card">
        <div className="def-test-heading">
          <div className="def-test-titleGroup">
            <label className="def-test-selectWrap">
              <span className="def-test-srOnly">지역 선택</span>
              <select
                className={area === "20" ? "def-test-longSelect" : undefined}
                value={area}
                onChange={event => {
                  reset();
                  setArea(event.target.value);
                }}
              >
                {areas.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <h1>요소수 시세</h1>
          </div>
          <span className="def-test-date">
            {result
              ? `${new Date(result.retrievedAt).toLocaleDateString("ko-KR", {timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"}).replace(/\s/g, "").replace(/\.$/, "")} 기준`
              : "오피넷 데이터"}
          </span>
        </div>
        <div className="def-test-prices" aria-live="polite">
          {loading ? (
            <p className="def-test-message">가격 정보를 불러오는 중입니다.</p>
          ) : error ? (
            <p className="def-test-error">{error}</p>
          ) : (
            result && (
              <>
                <div className="def-test-row">
                  <span>{name} 지역 판매가(원/ℓ)</span>
                  <div className="def-test-value">
                    <strong>{price(result.regional.average)}</strong>
                    <Change current={result.regional.average} previous={area === "02" ? 1650 : null} />
                  </div>
                </div>
                <div className="def-test-row">
                  <span>전국 판매가(원/ℓ)</span>
                  <div className="def-test-value">
                    <strong>{price(result.national.average)}</strong>
                    <Change current={result.national.average} previous={1580} />
                  </div>
                </div>
              </>
            )
          )}
        </div>
        <p className="def-test-note">
          ※ 평균 참고 시세로 실제 주유소 판매가격과 차이가 있을 수 있어요
        </p>
      </section>
      <div className="def-test-details">
        {result && (
          <p>
            양수 가격 기준 주유소 단순 평균 · {name} {result.regional.count}곳 / 전국{" "}
            {result.national.count}곳
          </p>
        )}
        <p>
          재고 여부와 보고일에 관계없이 집계합니다. 가격은 하루 4회 갱신되며 조회 결과는 최대 4시간
          저장됩니다.
        </p>
        <p>등락은 시험용 이전 가격(경기 1,650원, 전국 1,580원)과 비교한 목업입니다. 다른 지역의 이전 가격은 제공하지 않습니다.</p>
        <div className="def-test-footer">
          <a
            href="https://www.opinet.co.kr/user/custapi/openApiInfoDtl.do?apiId=8"
            target="_blank"
            rel="noreferrer"
          >
            출처: 한국석유공사 오피넷 ↗
          </a>
          <button
            type="button"
            onClick={() => {
              reset();
              setRefresh(value => value + 1);
            }}
            disabled={loading}
          >
            다시 조회
          </button>
        </div>
      </div>
    </main>
  );
}
