ALTER TABLE public.tb_lounge
  ADD COLUMN IF NOT EXISTS lg_std_rest_cd varchar(20),
  ADD COLUMN IF NOT EXISTS lg_service_area_code varchar(20);

CREATE UNIQUE INDEX IF NOT EXISTS tb_lounge_lg_std_rest_cd_unique
  ON public.tb_lounge (lg_std_rest_cd) WHERE lg_std_rest_cd IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tb_lounge_lg_service_area_code_unique
  ON public.tb_lounge (lg_service_area_code) WHERE lg_service_area_code IS NOT NULL;
