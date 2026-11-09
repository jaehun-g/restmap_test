import type {GasStationsResponse} from "./gas-stations";
import type {RestAreasResponse, Result} from "./rest-areas";

export type InitialMapData = {
  restAreas: Result<RestAreasResponse>;
  stations: Result<GasStationsResponse>;
};
