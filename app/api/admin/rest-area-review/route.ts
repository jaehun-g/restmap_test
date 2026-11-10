import {connection} from "next/server";
import {adminSessions, sessionCookie} from "@/lib/admin-auth";
import {queryRestAreas} from "@/lib/db";
import {fetchRestAreaSources} from "@/lib/rest-area-sources";
import {findMissingRestAreas} from "@/lib/rest-area-review";

export async function GET(request: Request) {
  await connection();
  const headers = {"Cache-Control": "no-store"};
  if (!adminSessions().verify(sessionCookie(request.headers.get("cookie")), process.env.ADMIN_PASSWORD))
    return Response.json({error: "관리자 인증이 필요합니다."}, {status: 401, headers});
  try {
    const db = await queryRestAreas();
    if (!db.ok) throw new Error("DB 조회 실패");
    const today = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
    const due = db.value.items.filter(area => area.operationStatus !== "open" && area.operationReviewDate && area.operationReviewDate <= today)
      .map(area => ({id: area.id, name: area.name, reason: `운영 상태 재확인 예정일: ${area.operationReviewDate}`}));
    try {
      const sources = await fetchRestAreaSources(undefined, db.value.items.map(area => area.name), true);
      if (!sources.locations.length) throw new Error("기준정보가 비어 있습니다.");
      return Response.json({items: [...due, ...findMissingRestAreas(db.value.items, sources.locations)], fetchedAt: sources.fetchedAt}, {headers});
    } catch {
      return Response.json({items: due, error: "공공 API 변경사항을 확인하지 못했습니다. 잠시 후 다시 진입해 주세요."}, {headers});
    }
  } catch {
    return Response.json({error: "휴게소 변경사항을 확인하지 못했습니다. 잠시 후 다시 진입해 주세요."}, {status: 503, headers});
  }
}
