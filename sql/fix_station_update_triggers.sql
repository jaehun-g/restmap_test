-- 기존 공용 함수는 다른 스키마에서도 사용하므로 변경하지 않는다.
CREATE OR REPLACE FUNCTION public.set_tb_ex_station_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.ex_updated_at = CURRENT_TIMESTAMP(3);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tb_ex_station_override_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.eo_updated_at = CURRENT_TIMESTAMP(3);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_test_ex_station_geocodes_updated_at ON public.tb_ex_station_geocodes;
DROP TRIGGER IF EXISTS set_tb_ex_station_geocodes_updated_at ON public.tb_ex_station_geocodes;
CREATE TRIGGER set_tb_ex_station_geocodes_updated_at
BEFORE UPDATE ON public.tb_ex_station_geocodes
FOR EACH ROW EXECUTE FUNCTION public.set_tb_ex_station_updated_at();

DROP TRIGGER IF EXISTS set_test_ex_station_geocode_overrides_updated_at ON public.tb_ex_station_geocode_overrides;
DROP TRIGGER IF EXISTS set_updated_at ON public.tb_ex_station_geocode_overrides;
DROP TRIGGER IF EXISTS set_tb_ex_station_overrides_updated_at ON public.tb_ex_station_geocode_overrides;
CREATE TRIGGER set_tb_ex_station_overrides_updated_at
BEFORE UPDATE ON public.tb_ex_station_geocode_overrides
FOR EACH ROW EXECUTE FUNCTION public.set_tb_ex_station_override_updated_at();
