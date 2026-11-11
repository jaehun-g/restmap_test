import {areas, averagePrices, parseOpinetJson} from "../data";

export async function GET(request: Request) {
  const area = new URL(request.url).searchParams.get("area") ?? "02";
  if (!areas.some(([code]) => code === area))
    return Response.json({error: "지원하지 않는 지역입니다."}, {status: 400});
  const key = process.env.OPINET_API_KEY;
  if (!key)
    return Response.json(
      {
        error:
          "서버에 OPINET_API_KEY가 설정되지 않았습니다. .env.local에 설정한 뒤 서버를 다시 시작해 주세요.",
      },
      {status: 503},
    );

  async function fetchPrices(areaCode: string) {
    const url = new URL("https://www.opinet.co.kr/api/ureaPrice.do");
    url.searchParams.set("code", key!);
    url.searchParams.set("out", "json");
    url.searchParams.set("area", areaCode);
    const response = await fetch(url, {
      next: {revalidate: 14400},
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("upstream");
    const data = parseOpinetJson(await response.text());
    if (!Array.isArray(data?.RESULT?.OIL)) throw new Error("invalid response");
    return {summary: averagePrices(data.RESULT.OIL), opinetResponse: data, status: response.status};
  }

  try {
    const results = await Promise.all(
      areas.map(async ([code]) => ({code, ...(await fetchPrices(code))})),
    );
    const selected = results.find(result => result.code === area)!;
    const regional = {code: selected.code, ...selected.summary};
    const count = results.reduce((sum, result) => sum + result.summary.count, 0);
    if (!count) throw new Error("empty national response");
    const national = {
      count,
      average:
        results.reduce((sum, result) => sum + (result.summary.average ?? 0) * result.summary.count, 0) / count,
    };
    return Response.json(
      {regional, national, retrievedAt: new Date().toISOString(), opinetStatus: selected.status, opinetResponse: selected.opinetResponse},
      {headers: {"Cache-Control": "no-store"}},
    );
  } catch {
    return Response.json(
      {error: "오피넷 응답을 가져오지 못했습니다. 인증키와 네트워크 상태를 확인해 주세요."},
      {status: 502},
    );
  }
}
