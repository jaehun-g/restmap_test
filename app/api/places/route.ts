import {connection} from "next/server";
import {errorStatus} from "@/lib/api-request";
import {reverseGeocodeKakaoPoint, searchKakaoPlaces} from "@/lib/place-search";

export async function GET(request: Request) {
  await connection();
  const headers = {"Cache-Control": "no-store"};
  const searchParams = new URL(request.url).searchParams;
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  if (latRaw !== null && lngRaw !== null) {
    const result = await reverseGeocodeKakaoPoint({
      latitude: Number(latRaw),
      longitude: Number(lngRaw),
    });
    if (!result.ok) {
      const status =
        result.error.code === "CONFIG_ERROR" ? 503 : errorStatus(result.error.code);
      return Response.json({error: result.error}, {status, headers});
    }
    return Response.json({address: result.value}, {headers});
  }

  const query = searchParams.get("q");
  const result = await searchKakaoPlaces(query);
  if (!result.ok) {
    const status =
      result.error.code === "CONFIG_ERROR" ? 503 : errorStatus(result.error.code);
    return Response.json({error: result.error}, {status, headers});
  }
  return Response.json({items: result.value}, {headers});
}
