import type {Metadata} from "next";
import {Suspense} from "react";
import {connection} from "next/server";
import MobileExplorer from "@/components/rest-area-explorer";
import KakaoSdkPreload from "@/components/kakao-sdk-preload";
import {queryMobileRestAreas, queryMobileStations} from "@/lib/cached-map-queries";
import type {InitialMapData} from "@/lib/initial-map-data";

export const metadata: Metadata = {title: "휴게소 지도"};

export default function MobilePage() {
  return (
    <>
      <KakaoSdkPreload />
      <Suspense fallback={<div className="mobile-shell flex items-center justify-center bg-surface text-muted" role="status">휴게소·주유소를 불러오고 있어요</div>}>
        <MobileExplorer initialData={{restAreas: readRestAreas(), stations: readStations()}} />
      </Suspense>
    </>
  );
}

async function readRestAreas(): InitialMapData["restAreas"] {
  await connection();
  if (process.env.E2E_CLIENT_MAP === "1") return undefined;
  return queryMobileRestAreas();
}

async function readStations(): InitialMapData["stations"] {
  await connection();
  if (process.env.E2E_CLIENT_MAP === "1") return undefined;
  return queryMobileStations();
}
