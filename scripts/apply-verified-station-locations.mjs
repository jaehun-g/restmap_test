import nextEnv from "@next/env";
import {Client} from "pg";
import {verifiedStationLocations} from "../lib/verified-rest-area-stations.ts";
import {dbColumn, dbTable} from "./db-columns.mjs";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const client = new Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}, connectionTimeoutMillis: 10_000});
try {
  await client.connect();
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  const changes = [];
  for (const verified of verifiedStationLocations) {
    const areaColumns = ["id", "name", "latitude", "longitude"].map(column => `${dbColumn("lounge", column)} AS ${column}`).join(", ");
    const {rows: areas} = await client.query(`SELECT ${areaColumns} FROM public.${dbTable("lounge")} WHERE ${dbColumn("lounge", "id")}=$1`, [verified.restAreaId]);
    const area = areas[0];
    if (!area || Number(area.latitude) !== verified.latitude || Number(area.longitude) !== verified.longitude)
      throw new Error(`휴게소 ${verified.restAreaId} 좌표가 검증 기준과 다릅니다. 재검증이 필요합니다.`);
    const {rows: stations} = await client.query(
      `SELECT ${["id", "source_key", "service_area_name", "latitude", "longitude", "source_location", "kakao_road_address_name"].map(column => `${dbColumn("ex_station_geocodes", column)} AS ${column}`).join(", ")} FROM public.${dbTable("ex_station_geocodes")} WHERE ${dbColumn("ex_station_geocodes", "source_key")}=$1` + (apply ? " FOR UPDATE" : ""),
      [verified.sourceKey],
    );
    if (stations.length !== 1) throw new Error(`주유소 ${verified.sourceKey}를 유일하게 찾지 못했습니다.`);
    if (apply) await client.query(
      `UPDATE public.${dbTable("ex_station_geocodes")} SET ${dbColumn("ex_station_geocodes", "latitude")}=$2, ${dbColumn("ex_station_geocodes", "longitude")}=$3,
       ${dbColumn("ex_station_geocodes", "kakao_address_name")}=$4, ${dbColumn("ex_station_geocodes", "kakao_address_type")}='ROAD_ADDR', ${dbColumn("ex_station_geocodes", "kakao_parcel_address_name")}=$5,
       ${dbColumn("ex_station_geocodes", "kakao_road_address_name")}=$4, ${dbColumn("ex_station_geocodes", "geocode_status")}='SUCCESS', ${dbColumn("ex_station_geocodes", "geocode_error_code")}=NULL,
       ${dbColumn("ex_station_geocodes", "geocoded_at")}=CURRENT_TIMESTAMP, ${dbColumn("ex_station_geocodes", "updated_at")}=CURRENT_TIMESTAMP WHERE ${dbColumn("ex_station_geocodes", "source_key")}=$1`,
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
