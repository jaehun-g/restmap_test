CREATE TABLE IF NOT EXISTS public.tb_food_area_mappings (
  am_std_rest_cd text PRIMARY KEY,
  am_rest_cd text,
  am_source_name text NOT NULL,
  am_source_route_name text,
  am_source_direction text,
  am_rest_area_id integer REFERENCES public.tb_lounge(lg_id) ON DELETE SET NULL,
  am_match_status text NOT NULL CHECK (am_match_status IN ('matched', 'unmatched', 'ambiguous')),
  am_candidate_rest_area_ids integer[] NOT NULL DEFAULT '{}',
  am_mapping_method text NOT NULL DEFAULT 'automatic' CHECK (am_mapping_method IN ('automatic', 'manual')),
  am_first_seen_at timestamptz NOT NULL DEFAULT now(),
  am_last_seen_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((am_match_status = 'matched' AND am_rest_area_id IS NOT NULL) OR am_match_status <> 'matched')
);

CREATE INDEX IF NOT EXISTS tb_food_area_mappings_rest_area_id_idx
  ON public.tb_food_area_mappings(am_rest_area_id) WHERE am_match_status = 'matched';

CREATE TABLE IF NOT EXISTS public.tb_food_menus (
  fm_source_key text PRIMARY KEY,
  fm_std_rest_cd text NOT NULL REFERENCES public.tb_food_area_mappings(am_std_rest_cd) ON DELETE CASCADE,
  fm_seq text NOT NULL,
  fm_rest_cd text,
  fm_food_nm text NOT NULL,
  fm_food_cost integer CHECK (fm_food_cost IS NULL OR fm_food_cost >= 0),
  fm_recommendyn boolean,
  fm_bestfoodyn boolean,
  fm_source_created_at date,
  fm_source_updated_at date,
  fm_app_visible boolean NOT NULL DEFAULT true,
  fm_source_present boolean NOT NULL DEFAULT true,
  fm_collected_at timestamptz NOT NULL,
  fm_last_seen_at timestamptz NOT NULL,
  fm_missing_since timestamptz,
  UNIQUE (fm_std_rest_cd, fm_seq)
);

CREATE INDEX IF NOT EXISTS tb_food_menus_area_visible_idx
  ON public.tb_food_menus(fm_std_rest_cd, fm_source_present, fm_app_visible);

CREATE TABLE IF NOT EXISTS public.tb_food_menu_sync_runs (
  sr_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sr_status text NOT NULL CHECK (sr_status IN ('running', 'succeeded', 'failed')),
  sr_started_at timestamptz NOT NULL DEFAULT now(),
  sr_completed_at timestamptz,
  sr_source_count integer,
  sr_matched_area_count integer,
  sr_unmatched_area_count integer,
  sr_ambiguous_area_count integer,
  sr_error_code text
);

COMMENT ON TABLE public.tb_food_area_mappings IS 'EX 음식정보 휴게소 코드와 tb_lounge.lg_id 매핑. 자동 매칭은 이름·노선·방향 모두 일치할 때만 허용.';
COMMENT ON TABLE public.tb_food_menus IS 'EX 휴게소 음식정보. 식별/동기화 필드는 내부 관리용이며 화면에는 음식명·가격·추천·인기 여부만 표시.';
