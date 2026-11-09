"use client";

import {useEffect} from "react";
import {loadKakaoMaps, kakaoSdkUrl} from "@/lib/kakao-sdk";

const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY?.trim();

/** 데이터 스트리밍을 기다리는 동안 SDK 다운로드와 초기화를 시작한다. */
export default function KakaoSdkPreload() {
  useEffect(() => {
    if (appKey) void loadKakaoMaps(appKey).catch(() => {});
  }, []);

  return appKey ? <link rel="preload" as="script" href={kakaoSdkUrl(appKey)} /> : null;
}
