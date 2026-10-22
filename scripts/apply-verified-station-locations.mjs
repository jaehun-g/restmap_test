import nextEnv from "@next/env";
import {Client} from "pg";
import {verifiedStationLocations} from "../lib/verified-rest-area-stations.ts";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}, connectionTimeoutMillis: 10_000});
try {
  await client.connect();
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  const changes = [];
  for (const verified of verifiedStationLocations) {
    const {rows: areas} = await client.query("SELECT id, name, latitude, longitude FROM test_lounge WHERE id=$1", [verified.restAreaId]);
    const area = areas[0];
    if (!area || Number(area.latitude) !== verified.latitude || Number(area.longitude) !== verified.longitude)
      throw new Error(`휴게소 ${verified.restAreaId} 좌표가 검증 기준과 다릅니다. 재검증이 필요합니다.`);
    const {rows: stations} = await client.query(
      "SELECT id, source_key, service_area_name, latitude, longitude, source_location, kakao_road_address_name FROM test_ex_station_geocodes WHERE source_key=$1" + (apply ? " FOR UPDATE" : ""),
      [verified.sourceKey],
    );
    if (stations.length !== 1) throw new Error(`주유소 ${verified.sourceKey}를 유일하게 찾지 못했습니다.`);
    if (apply) await client.query(
      `UPDATE test_ex_station_geocodes SET latitude=$2, longitude=$3,
       kakao_address_name=$4, kakao_address_type='ROAD_ADDR', kakao_parcel_address_name=$5,
       kakao_road_address_name=$4, geocode_status='SUCCESS', geocode_error_code=NULL,
       geocoded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE source_key=$1`,
      [verified.sourceKey, verified.latitude, verified.longitude, verified.roadAddress, verified.parcelAddress],
    );
    changes.push({before: stations[0], after: {latitude: verified.latitude, longitude: verified.longitude, roadAddress: verified.roadAddress, parcelAddress: verified.parcelAddress}, restArea: area.name});
  }
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(JSON.stringify({applied: apply, changes}, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
