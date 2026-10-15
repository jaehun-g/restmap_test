import test from "node:test";
import assert from "node:assert/strict";
import {
  geocodeKakaoAddress,
  kakaoRestApiKey,
  normalizeKakaoAddressQuery,
  parseKakaoAddressResponse,
  searchKakaoKeywordPlaces,
  selectKakaoKeywordPlace,
} from "../lib/kakao-local.ts";

test("Kakao address geocoder sends the REST key in a header and returns Kakao map coordinates", async () => {
  const calls: {url: string; init: RequestInit}[] = [];
  const result = await geocodeKakaoAddress("  서울   강남구 테헤란로 152 ", {
    apiKey: "rest-key",
    fetch: async (url, init) => {
      calls.push({url, init});
      return new Response(
        JSON.stringify({
          documents: [
            {
              address_name: "서울 강남구 역삼동 737",
              address_type: "ROAD_ADDR",
              x: "127.0420000",
              y: "37.5000000",
              address: {address_name: "서울 강남구 역삼동 737"},
              road_address: {address_name: "서울 강남구 테헤란로 152"},
            },
          ],
        }),
      );
    },
  });
  assert.deepEqual(result, {
    ok: true,
    value: {
      latitude: 37.5,
      longitude: 127.042,
      addressName: "서울 강남구 역삼동 737",
      addressType: "ROAD_ADDR",
      parcelAddressName: "서울 강남구 역삼동 737",
      roadAddressName: "서울 강남구 테헤란로 152",
    },
  });
  assert.equal(new URL(calls[0].url).searchParams.get("query"), "서울 강남구 테헤란로 152");
  assert.equal(new URL(calls[0].url).searchParams.get("analyze_type"), "exact");
  assert.equal(new Headers(calls[0].init.headers).get("Authorization"), "KakaoAK rest-key");
  assert.ok(!calls[0].url.includes("rest-key"));
});

test("Kakao keyword search returns WGS84 OL7 places and selects an exact station name", async () => {
  const calls: {url: string; init: RequestInit}[] = [];
  const result = await searchKakaoKeywordPlaces("안성(서울)주유소", {
    apiKey: "rest-key",
    fetch: async (url, init) => {
      calls.push({url, init});
      return new Response(
        JSON.stringify({
          documents: [
            {
              place_name: "안성휴게소 서울방향 주유소",
              category_group_code: "OL7",
              address_name: "경기 안성시 원곡면 반제리 137-3",
              road_address_name: "",
              phone: "031-000-0000",
              x: "127.1600000",
              y: "37.0000000",
            },
          ],
        }),
      );
    },
  });
  assert.ok(result.ok);
  assert.equal(new URL(calls[0].url).searchParams.get("query"), "안성(서울)주유소");
  assert.equal(new URL(calls[0].url).searchParams.get("category_group_code"), "OL7");
  assert.equal(new Headers(calls[0].init.headers).get("Authorization"), "KakaoAK rest-key");
  if (!result.ok) return;
  const selected = selectKakaoKeywordPlace(result.value, "안성(서울)주유소", "031-000-0000");
  assert.ok(selected.ok);
  if (selected.ok)
    assert.deepEqual([selected.value.latitude, selected.value.longitude], [37, 127.16]);
});

test("Kakao keyword search does not auto-select a mismatched or ambiguous station", () => {
  const place = {
    name: "안성휴게소 서울방향 주유소",
    categoryGroupCode: "OL7",
    addressName: null,
    roadAddressName: null,
    phone: null,
    placeUrl: null,
    latitude: 37,
    longitude: 127,
  };
  const mismatch = selectKakaoKeywordPlace([place], "안성(부산)주유소");
  assert.equal(mismatch.ok, false);
  const ambiguous = selectKakaoKeywordPlace(
    [place, {...place, phone: "031-000-0000"}],
    "안성(서울)주유소",
  );
  assert.equal(ambiguous.ok, false);
});

test("Kakao address geocoder validates configuration, input and address search responses", async () => {
  assert.equal(kakaoRestApiKey({}).ok, false);
  assert.deepEqual(normalizeKakaoAddressQuery("   "), {
    ok: false,
    error: {code: "VALIDATION_ERROR", message: "주소를 입력해 주세요."},
  });
  const notFound = parseKakaoAddressResponse({documents: []});
  assert.equal(notFound.ok, false);
  if (!notFound.ok) assert.equal(notFound.error.code, "GEOCODE_NOT_FOUND");
  const malformed = parseKakaoAddressResponse({
    documents: [{address_name: "주소", address_type: "ROAD_ADDR", x: "200", y: "37"}],
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "GEOCODE_DATA_INVALID");
  const unauthorized = await geocodeKakaoAddress("서울", {
    apiKey: "rest-key",
    fetch: async () => new Response(null, {status: 401}),
  });
  assert.equal(unauthorized.ok, false);
  if (!unauthorized.ok) assert.equal(unauthorized.error.code, "KAKAO_GEOCODE_UNAUTHORIZED");
});
