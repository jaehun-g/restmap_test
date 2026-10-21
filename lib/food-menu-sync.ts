import type {Pool, PoolClient, QueryResultRow} from "pg";
import type {RestArea} from "./rest-areas.ts";
import type {SourceFoodMenu} from "./food-menu-source.ts";
import {matchFoodAreas, type FoodAreaMatch} from "./food-menu-matching.ts";
import type {Result} from "./rest-areas.ts";

export type FoodMenuSyncSummary = {
  synchronizedAt: string;
  sourceMenuCount: number;
  matchedAreaCount: number;
  unmatchedAreaCount: number;
  ambiguousAreaCount: number;
  visibleMenuCount: number;
};

export type FoodMenuSyncDependencies = {
  pool: Pick<Pool, "query" | "connect">;
  fetchMenus: () => Promise<Result<SourceFoodMenu[]>>;
  loadAreas: () => Promise<Result<RestArea[]>>;
  now?: () => Date;
};

const fail = (code: string, message: string): Result<never> => ({ok: false, error: {code, message}});

function toDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(value) ? value.slice(0, 10) : null;
}

export function reviewDuplicateFoodAreaTargets(matches: FoodAreaMatch[]): FoodAreaMatch[] {
  const byArea = new Map<number, FoodAreaMatch[]>();
  for (const match of matches) {
    if (match.status !== "matched" || match.restAreaId === null) continue;
    const group = byArea.get(match.restAreaId) ?? [];
    group.push(match);
    byArea.set(match.restAreaId, group);
  }
  for (const [id, group] of byArea) {
    if (group.length < 2) continue;
    for (const match of group) {
      match.status = "ambiguous";
      match.candidates = [id];
      match.restAreaId = null;
    }
  }
  return matches;
}

async function writeSnapshot(client: PoolClient, items: SourceFoodMenu[], areas: RestArea[], at: Date) {
  await client.query("SELECT pg_advisory_xact_lock(748392110)");
  const matches = reviewDuplicateFoodAreaTargets(matchFoodAreas(items, areas));
  const prior = await client.query<QueryResultRow>(
    "SELECT std_rest_cd, rest_area_id, match_status, mapping_method FROM public.test_food_area_mappings",
  );
  const previous = new Map(prior.rows.map(row => [String(row.std_rest_cd), row]));
  for (const match of matches) {
    const old = previous.get(match.stdRestCd);
    const manual = old?.mapping_method === "manual";
    const status = manual ? String(old.match_status) : match.status;
    const areaId = manual ? (old.rest_area_id === null ? null : Number(old.rest_area_id)) : match.restAreaId;
    await client.query(
      `INSERT INTO public.test_food_area_mappings
         (std_rest_cd, rest_cd, source_name, source_route_name, source_direction, rest_area_id,
          match_status, candidate_rest_area_ids, mapping_method, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (std_rest_cd) DO UPDATE SET
         rest_cd=EXCLUDED.rest_cd, source_name=EXCLUDED.source_name,
         source_route_name=EXCLUDED.source_route_name, source_direction=EXCLUDED.source_direction,
         rest_area_id=CASE WHEN test_food_area_mappings.mapping_method='manual'
                           THEN test_food_area_mappings.rest_area_id ELSE EXCLUDED.rest_area_id END,
         match_status=CASE WHEN test_food_area_mappings.mapping_method='manual'
                           THEN test_food_area_mappings.match_status ELSE EXCLUDED.match_status END,
         candidate_rest_area_ids=EXCLUDED.candidate_rest_area_ids,
         last_seen_at=EXCLUDED.last_seen_at`,
      [match.stdRestCd, match.restCd, match.restName, match.routeName, match.direction, areaId,
        status, match.candidates, manual ? "manual" : "automatic", at],
    );
  }

  const keys = items.map(item => item.key);
  await client.query(
    `UPDATE public.test_food_menus SET source_present=false,
       missing_since=COALESCE(missing_since,$1) WHERE source_present=true AND NOT (source_key=ANY($2::text[]))`,
    [at, keys],
  );
  const values = items.map(item => ({
    source_key: item.key, std_rest_cd: item.stdRestCd, seq: item.seq, rest_cd: item.restCd,
    food_nm: item.name, food_cost: item.price, recommendyn: item.recommended, bestfoodyn: item.best,
    source_created_at: toDate(item.sourceCreatedAt), source_updated_at: toDate(item.sourceUpdatedAt),
    app_visible: item.displayed === true,
  }));
  if (values.length) {
    await client.query(
      `INSERT INTO public.test_food_menus
         (source_key,std_rest_cd,seq,rest_cd,food_nm,food_cost,recommendyn,bestfoodyn,
          source_created_at,source_updated_at,app_visible,source_present,collected_at,last_seen_at,missing_since)
       SELECT v.source_key,v.std_rest_cd,v.seq,v.rest_cd,v.food_nm,v.food_cost,v.recommendyn,v.bestfoodyn,
          v.source_created_at,v.source_updated_at,v.app_visible,true,$2,$2,null
       FROM jsonb_to_recordset($1::jsonb) AS v(
         source_key text,std_rest_cd text,seq text,rest_cd text,food_nm text,food_cost integer,
         recommendyn boolean,bestfoodyn boolean,source_created_at date,source_updated_at date,app_visible boolean)
       ON CONFLICT (source_key) DO UPDATE SET
         std_rest_cd=EXCLUDED.std_rest_cd, seq=EXCLUDED.seq, rest_cd=EXCLUDED.rest_cd,
         food_nm=EXCLUDED.food_nm,food_cost=EXCLUDED.food_cost,recommendyn=EXCLUDED.recommendyn,
         bestfoodyn=EXCLUDED.bestfoodyn,source_created_at=EXCLUDED.source_created_at,
         source_updated_at=EXCLUDED.source_updated_at,app_visible=EXCLUDED.app_visible,
         source_present=true,collected_at=EXCLUDED.collected_at,last_seen_at=EXCLUDED.last_seen_at,
         missing_since=null`,
      [JSON.stringify(values), at],
    );
  }
  const counts = matches.reduce((summary, match) => {
    summary[match.status]++;
    return summary;
  }, {matched: 0, unmatched: 0, ambiguous: 0});
  const visible = await client.query<{count: string}>(
    "SELECT count(*)::text AS count FROM public.test_food_menus WHERE source_present AND app_visible",
  );
  return {matches, counts, visibleMenuCount: Number(visible.rows[0]?.count ?? 0)};
}

export async function synchronizeFoodMenus({pool, fetchMenus, loadAreas, now = () => new Date()}: FoodMenuSyncDependencies): Promise<Result<FoodMenuSyncSummary>> {
  let runId: string | undefined;
  let client: PoolClient | undefined;
  try {
    const started = await pool.query<{id: string}>(
      "INSERT INTO public.test_food_menu_sync_runs(status) VALUES ('running') RETURNING id",
    );
    runId = started.rows[0]?.id;
    const [snapshot, areasResult] = await Promise.all([fetchMenus(), loadAreas()]);
    if (!snapshot.ok) throw Object.assign(new Error(snapshot.error.message), {code: snapshot.error.code});
    if (!areasResult.ok) throw Object.assign(new Error(areasResult.error.message), {code: areasResult.error.code});
    if (!snapshot.value.length) throw Object.assign(new Error("Empty source snapshot"), {code: "FOOD_SOURCE_INCOMPLETE"});
    client = await pool.connect();
    await client.query("BEGIN");
    const {counts, visibleMenuCount} = await writeSnapshot(client, snapshot.value, areasResult.value, now());
    await client.query(
      `UPDATE public.test_food_menu_sync_runs SET status='succeeded',completed_at=$2,source_count=$3,
       matched_area_count=$4,unmatched_area_count=$5,ambiguous_area_count=$6 WHERE id=$1`,
      [runId, now(), snapshot.value.length, counts.matched, counts.unmatched, counts.ambiguous],
    );
    await client.query("COMMIT");
    return {ok: true, value: {
      synchronizedAt: now().toISOString(), sourceMenuCount: snapshot.value.length,
      matchedAreaCount: counts.matched, unmatchedAreaCount: counts.unmatched,
      ambiguousAreaCount: counts.ambiguous, visibleMenuCount,
    }};
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "FOOD_SYNC_FAILED";
    const update = client ? client.query.bind(client) : pool.query.bind(pool);
    if (runId) await update(
      "UPDATE public.test_food_menu_sync_runs SET status='failed',completed_at=$2,error_code=$3 WHERE id=$1",
      [runId, now(), code.slice(0, 80)],
    ).catch(() => undefined);
    return fail(code, error instanceof Error ? error.message : "음식정보 동기화에 실패했습니다.");
  } finally {
    client?.release();
  }
}
