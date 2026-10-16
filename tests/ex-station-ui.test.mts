import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {createElement, type ComponentType} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
// Render the real TSX components using the existing compiler; no browser or extra dependency.
async function componentUrl(path: string): Promise<string> {
  const input = await readFile(new URL(path, root), "utf8");
  const {outputText} = ts.transpileModule(input, {
    compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext},
  });
  const urls = new Map<string, string>();
  for (const [, specifier] of outputText.matchAll(/from "([^"]+)"/g)) {
    if (urls.has(specifier)) continue;
    const url = specifier.startsWith("@/lib/")
      ? new URL(`${specifier.slice(2)}.ts`, root).href
      : specifier.startsWith("@/components/")
        ? await componentUrl(`${specifier.slice(2)}.tsx`)
        : specifier.startsWith("./")
          ? await componentUrl(`components/${specifier.slice(2)}.tsx`)
          : pathToFileURL(require.resolve(specifier)).href;
    urls.set(specifier, url);
  }
  const code = outputText.replace(
    /from "([^"]+)"/g,
    (_, specifier: string) => `from ${JSON.stringify(urls.get(specifier))}`,
  );
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}

const {default: Details} = (await import(
  await componentUrl("components/gas-station-details.tsx")
)) as {default: ComponentType<Record<string, unknown>>};
const {default: Controls} = (await import(await componentUrl("components/place-controls.tsx"))) as {
  default: ComponentType<Record<string, unknown>>;
};
const {default: DetailModal} = (await import(
  await componentUrl("components/admin-detail-modal.tsx")
)) as {default: ComponentType<Record<string, unknown>>};

function station() {
  const result = normalizeExGasStations([
    {
      id: 1,
      source_key: "0010|B00001|부산|AD",
      service_area_name: "서울만남(부산)주유소",
      route_name: "경부선",
      direction: "부산",
      gasoline_price: "1700",
      diesel_price: "1550.5",
      lpg_price: 0,
      source_fetched_at: new Date("2026-10-15T00:00:00Z"),
    },
  ]);
  assert.ok(result.ok);
  return result.value[0];
}

test("mobile and administrator detail views render only available fuel prices with source and collection time", () => {
  for (const audience of ["mobile", "admin"]) {
    const html = renderToStaticMarkup(
      createElement(Details, {station: station(), audience, onClose() {}}),
    );
    assert.match(html, /고속도로 주유소/);
    assert.match(html, /휘발유<\/dt><dd>1,700원\/L/);
    assert.match(html, /경유<\/dt><dd>1,550.5원\/L/);
    assert.doesNotMatch(html, /<dt>LPG<\/dt>/);
    assert.match(html, /한국도로공사 제공/);
    assert.match(html, /수집/);
    assert.doesNotMatch(html, /GS 코드|추가 정보 조회 중/);
  }
});

test("detail views omit the fuel price section if every price is missing", () => {
  const html = renderToStaticMarkup(
    createElement(Details, {
      station: {...station(), prices: {gasoline: null, diesel: null, lpg: null}},
      onClose() {},
    }),
  );
  assert.doesNotMatch(html, /aria-label="유가 정보"/);
  assert.doesNotMatch(html, /원\/L/);
});

test("administrator and mobile controls expose only rest areas and highway stations", () => {
  const admin = renderToStaticMarkup(
    createElement(Controls, {view: "ex", audience: "admin", onView() {}}),
  );
  assert.doesNotMatch(admin, /통합|GS 주유소/);
  assert.match(admin, /aria-pressed="true"[^>]*>고속도로 주유소/);
  assert.equal((admin.match(/<button/g) ?? []).length, 2);
  const mobile = renderToStaticMarkup(
    createElement(Controls, {view: "ex", audience: "mobile", onView() {}}),
  );
  assert.doesNotMatch(mobile, /통합|GS 주유소/);
  assert.match(mobile, /aria-pressed="true"[^>]*>고속도로 주유소/);
  assert.equal((mobile.match(/<button/g) ?? []).length, 2);
});

test("administrator detail modal exposes an accessible dialog container", () => {
  const html = renderToStaticMarkup(
    createElement(DetailModal, {onClose() {}}, createElement("p", null, "상세 내용")),
  );
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /상세 내용/);
});
