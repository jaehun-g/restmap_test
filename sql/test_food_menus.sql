CREATE TABLE IF NOT EXISTS public.test_food_area_mappings (
  std_rest_cd text PRIMARY KEY,
  rest_cd text,
  source_name text NOT NULL,
  source_route_name text,
  source_direction text,
  rest_area_id integer REFERENCES public.test_lounge(id) ON DELETE SET NULL,
  match_status text NOT NULL CHECK (match_status IN ('matched', 'unmatched', 'ambiguous')),
  candidate_rest_area_ids integer[] NOT NULL DEFAULT '{}',
  mapping_method text NOT NULL DEFAULT 'automatic' CHECK (mapping_method IN ('automatic', 'manual')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((match_status = 'matched' AND rest_area_id IS NOT NULL) OR match_status <> 'matched')
);

CREATE INDEX IF NOT EXISTS test_food_area_mappings_rest_area_id_idx
  ON public.test_food_area_mappings(rest_area_id) WHERE match_status = 'matched';

CREATE TABLE IF NOT EXISTS public.test_food_menus (
  source_key text PRIMARY KEY,
  std_rest_cd text NOT NULL REFERENCES public.test_food_area_mappings(std_rest_cd) ON DELETE CASCADE,
  seq text NOT NULL,
  rest_cd text,
  food_nm text NOT NULL,
  food_cost integer CHECK (food_cost IS NULL OR food_cost >= 0),
  recommendyn boolean,
  bestfoodyn boolean,
  source_created_at date,
  source_updated_at date,
  app_visible boolean NOT NULL DEFAULT true,
  source_present boolean NOT NULL DEFAULT true,
  collected_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  missing_since timestamptz,
  UNIQUE (std_rest_cd, seq)
);

CREATE INDEX IF NOT EXISTS test_food_menus_area_visible_idx
  ON public.test_food_menus(std_rest_cd, source_present, app_visible);

CREATE TABLE IF NOT EXISTS public.test_food_menu_sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  source_count integer,
  matched_area_count integer,
  unmatched_area_count integer,
  ambiguous_area_count integer,
  error_code text
);

COMMENT ON TABLE public.test_food_area_mappings IS 'EX 음식정보 휴게소 코드와 test_lounge.id 매핑. 자동 매칭은 이름·노선·방향 모두 일치할 때만 허용.';
COMMENT ON TABLE public.test_food_menus IS 'EX 휴게소 음식정보. 식별/동기화 필드는 내부 관리용이며 화면에는 음식명·가격·추천·인기 여부만 표시.';
