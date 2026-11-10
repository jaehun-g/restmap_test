import type {GasStationsResponse} from "./gas-stations";
import type {RestAreasResponse, Result} from "./rest-areas";

export type InitialMapData = {
  restAreas: Promise<Result<RestAreasResponse> | undefined>;
  stations: Promise<Result<GasStationsResponse> | undefined>;
};
