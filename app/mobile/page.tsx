import type {Metadata} from "next";
import {Suspense} from "react";
import {connection} from "next/server";
import MobileExplorer from "@/components/rest-area-explorer";
import KakaoSdkPreload from "@/components/kakao-sdk-preload";
import {queryMapRestAreas, queryMapStations} from "@/lib/cached-map-queries";
import type {InitialMapData} from "@/lib/initial-map-data";

export const metadata: Metadata = {title: "휴게소 지도"};

export default function MobilePage() {
  return (
    <>
      <KakaoSdkPreload />
      <Suspense fallback={<div className="mobile-shell flex items-center justify-center bg-[#f3f6fa] text-[#526b91]" role="status">휴게소·주유소를 불러오고 있어요</div>}>
        <MobileExplorer initialData={readInitialMapData()} />
      </Suspense>
    </>
  );
}

async function readInitialMapData(): Promise<InitialMapData | undefined> {
  await connection();
  // SDK 모의 회귀 테스트는 기존 클라이언트 API 경로를 별도로 검증한다.
  if (process.env.E2E_CLIENT_MAP === "1") return undefined;
  const [restAreas, stations] = await Promise.all([
    queryMapRestAreas(),
    queryMapStations({source: "ex", routeName: null, scope: {kind: "all"}}),
  ]);
  return {restAreas, stations};
}
