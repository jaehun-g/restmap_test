import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "휴게소 지도",
  description: "Cafe24 휴게소 정보를 카카오맵에서 확인하는 로컬 테스트 페이지",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
