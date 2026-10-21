ALTER TABLE public.test_lounge
  ADD COLUMN IF NOT EXISTS std_rest_cd varchar(20),
  ADD COLUMN IF NOT EXISTS service_area_code varchar(20);

CREATE UNIQUE INDEX IF NOT EXISTS test_lounge_std_rest_cd_unique
  ON public.test_lounge (std_rest_cd) WHERE std_rest_cd IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS test_lounge_service_area_code_unique
  ON public.test_lounge (service_area_code) WHERE service_area_code IS NOT NULL;
