const prefixes = Object.freeze({
  lounge: "lg",
  gscargo: "gs",
  ex_station_geocodes: "ex",
  ex_station_geocode_overrides: "eo",
  highway_routes: "hr",
  food_menus: "fm",
  food_area_mappings: "am",
  food_menu_sync_runs: "sr",
});

export function dbTable(name) {
  if (!(name in prefixes)) throw new Error(`Unknown database table: ${name}`);
  return `tb_${name}`;
}

export function dbColumn(table, name) {
  const prefix = prefixes[table];
  if (!prefix) throw new Error(`Unknown database table: ${table}`);
  return `${prefix}_${name}`;
}

export async function selectLegacyRows(client, table, suffix = "", values = []) {
  const prefix = prefixes[table];
  if (!prefix) throw new Error(`Unknown database table: ${table}`);
  const name = dbTable(table);
  const {rows} = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [name],
  );
  const columns = rows.map(({column_name}) => {
    const expected = `${prefix}_`;
    if (!column_name.startsWith(expected)) throw new Error(`${name} has unexpected column ${column_name}`);
    const legacyName = column_name.slice(expected.length);
    return `\"${column_name}\" AS \"${legacyName}\"`;
  });
  if (!columns.length) throw new Error(`${name} has no columns`);
  const result = await client.query(`SELECT ${columns.join(", ")} FROM public.${name} ${suffix}`, values);
  return result.rows;
}
