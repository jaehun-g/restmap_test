-- Rename the eight application tables and prefix every column.
-- The caller must execute this file inside one transaction. The migration
-- uses PostgreSQL transactional DDL, so any failure rolls back all renames.
-- PostgreSQL keeps row data, constraints, indexes, and FK targets attached
-- to the same relation/column identities when they are renamed.

LOCK TABLE
  public.test_ex_station_geocode_overrides,
  public.test_ex_station_geocodes,
  public.test_food_area_mappings,
  public.test_food_menu_sync_runs,
  public.test_food_menus,
  public.test_gscargo,
  public.test_highway_routes,
  public.test_lounge
IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE _tb_prefix_migration_counts (
  legacy_name text PRIMARY KEY,
  new_name text NOT NULL,
  column_prefix text NOT NULL,
  row_count bigint NOT NULL
) ON COMMIT DROP;

DO $migration$
DECLARE
  item record;
  column_item record;
  fk_count_before bigint;
  fk_count_after bigint;
  count_before bigint;
  count_after bigint;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('test_lounge', 'tb_lounge', 'lg_'),
      ('test_gscargo', 'tb_gscargo', 'gs_'),
      ('test_ex_station_geocodes', 'tb_ex_station_geocodes', 'ex_'),
      ('test_ex_station_geocode_overrides', 'tb_ex_station_geocode_overrides', 'eo_'),
      ('test_highway_routes', 'tb_highway_routes', 'hr_'),
      ('test_food_menus', 'tb_food_menus', 'fm_'),
      ('test_food_area_mappings', 'tb_food_area_mappings', 'am_'),
      ('test_food_menu_sync_runs', 'tb_food_menu_sync_runs', 'sr_')
    ) AS mappings(legacy_name, new_name, prefix)
  LOOP
    IF to_regclass(format('public.%I', item.legacy_name)) IS NULL THEN
      RAISE EXCEPTION 'Expected table public.% does not exist', item.legacy_name;
    END IF;
    IF to_regclass(format('public.%I', item.new_name)) IS NOT NULL THEN
      RAISE EXCEPTION 'Target table public.% already exists', item.new_name;
    END IF;
    EXECUTE format(
      'INSERT INTO _tb_prefix_migration_counts VALUES (%L, %L, %L, (SELECT count(*) FROM public.%I))',
      item.legacy_name, item.new_name, item.prefix, item.legacy_name
    );
  END LOOP;

  SELECT count(*) INTO fk_count_before
  FROM pg_constraint
  WHERE contype = 'f'
    AND (conrelid = ANY (ARRAY[
      'public.test_lounge'::regclass, 'public.test_gscargo'::regclass,
      'public.test_ex_station_geocodes'::regclass,
      'public.test_ex_station_geocode_overrides'::regclass,
      'public.test_highway_routes'::regclass, 'public.test_food_menus'::regclass,
      'public.test_food_area_mappings'::regclass,
      'public.test_food_menu_sync_runs'::regclass
    ]) OR confrelid = ANY (ARRAY[
      'public.test_lounge'::regclass, 'public.test_gscargo'::regclass,
      'public.test_ex_station_geocodes'::regclass,
      'public.test_ex_station_geocode_overrides'::regclass,
      'public.test_highway_routes'::regclass, 'public.test_food_menus'::regclass,
      'public.test_food_area_mappings'::regclass,
      'public.test_food_menu_sync_runs'::regclass
    ]));

  FOR item IN
    SELECT * FROM (VALUES
      ('test_lounge', 'tb_lounge', 'lg_'),
      ('test_gscargo', 'tb_gscargo', 'gs_'),
      ('test_ex_station_geocodes', 'tb_ex_station_geocodes', 'ex_'),
      ('test_ex_station_geocode_overrides', 'tb_ex_station_geocode_overrides', 'eo_'),
      ('test_highway_routes', 'tb_highway_routes', 'hr_'),
      ('test_food_menus', 'tb_food_menus', 'fm_'),
      ('test_food_area_mappings', 'tb_food_area_mappings', 'am_'),
      ('test_food_menu_sync_runs', 'tb_food_menu_sync_runs', 'sr_')
    ) AS mappings(legacy_name, new_name, prefix)
  LOOP
    EXECUTE format('ALTER TABLE public.%I RENAME TO %I', item.legacy_name, item.new_name);
    FOR column_item IN
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = item.new_name
      ORDER BY ordinal_position
    LOOP
      IF octet_length(item.prefix || column_item.column_name) > 63 THEN
        RAISE EXCEPTION 'Prefixed column name exceeds PostgreSQL limit: %.%',
          item.new_name, item.prefix || column_item.column_name;
      END IF;
      EXECUTE format(
        'ALTER TABLE public.%I RENAME COLUMN %I TO %I',
        item.new_name, column_item.column_name, item.prefix || column_item.column_name
      );
    END LOOP;
  END LOOP;

  SELECT count(*) INTO fk_count_after
  FROM pg_constraint
  WHERE contype = 'f'
    AND (conrelid = ANY (ARRAY[
      'public.tb_lounge'::regclass, 'public.tb_gscargo'::regclass,
      'public.tb_ex_station_geocodes'::regclass,
      'public.tb_ex_station_geocode_overrides'::regclass,
      'public.tb_highway_routes'::regclass, 'public.tb_food_menus'::regclass,
      'public.tb_food_area_mappings'::regclass,
      'public.tb_food_menu_sync_runs'::regclass
    ]) OR confrelid = ANY (ARRAY[
      'public.tb_lounge'::regclass, 'public.tb_gscargo'::regclass,
      'public.tb_ex_station_geocodes'::regclass,
      'public.tb_ex_station_geocode_overrides'::regclass,
      'public.tb_highway_routes'::regclass, 'public.tb_food_menus'::regclass,
      'public.tb_food_area_mappings'::regclass,
      'public.tb_food_menu_sync_runs'::regclass
    ]));

  IF fk_count_after <> fk_count_before THEN
    RAISE EXCEPTION 'Foreign key count changed: % -> %', fk_count_before, fk_count_after;
  END IF;

  FOR item IN SELECT * FROM _tb_prefix_migration_counts LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', item.new_name) INTO count_after;
    IF count_after <> item.row_count THEN
      RAISE EXCEPTION 'Row count changed for %: % -> %',
        item.new_name, item.row_count, count_after;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = item.new_name
        AND left(column_name, length(item.column_prefix)) <> item.column_prefix
    ) THEN
      RAISE EXCEPTION 'Unprefixed column remains on public.%', item.new_name;
    END IF;
  END LOOP;
END
$migration$;

