import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createElement, type ComponentType} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {compile} from "@tailwindcss/node";
import {Scanner} from "@tailwindcss/oxide";
import postcss, {type Rule} from "postcss";
import {buttonClasses, fieldClasses} from "../lib/design-system.ts";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const source = await readFile(new URL("app/globals.css", root), "utf8");
const compiler = await compile(source, {
  base: fileURLToPath(new URL("app/", root)),
  onDependency() {},
});
const scanner = new Scanner({sources: compiler.sources});
const candidates = scanner.scan();
const presentations = new Map<string, string[][]>();
for (const path of scanner.files.filter(path => /\.tsx?$/.test(path))) {
  const file = ts.createSourceFile(
    path,
    await readFile(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node: ts.Node) {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const classes = node.text.trim().split(/\s+/);
      for (const item of classes) {
        const values = presentations.get(item) ?? [];
        values.push(classes);
        presentations.set(item, values);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}
const css = postcss.parse(compiler.build(candidates));
const rules = new Map<string, Record<string, string>>();
const variables = new Map<string, string>();
css.walkDecls(decl => {
  if (decl.prop.startsWith("--") && decl.parent?.type === "rule") {
    const selector = decl.parent.selector;
    if (selector.includes(":root") || selector.includes(":host")) {
      variables.set(decl.prop, decl.value);
    }
  }
});
css.walkRules(rule => {
  const values = rules.get(rule.selector) ?? {};
  rule.each(node => {
    if (node.type === "decl") values[node.prop] = node.value;
  });
  rules.set(rule.selector, values);
});

function normalize(value: string): string {
  for (let pass = 0; pass < 8; pass++) {
    value = value.replace(/var\((--[\w-]+)\)/g, (match, name) => variables.get(name) ?? match);
  }
  return value
    .replace(/calc\(0\.25rem \* 0\)/g, "0")
    .replace(/\b0px\b/g, "0")
    .replace(/\s+/g, " ")
    .replace(/,\s*/g, ",")
    .replace(/#([\da-f])\1([\da-f])\2([\da-f])\3\b/gi, "#$1$2$3")
    .trim();
}

const selector = (candidate: string) => `.${candidate.replace(/[^\w-]/g, char => `\\${char}`)}`;
function declarations(classes: string[]) {
  const selected = new Set(classes.map(selector));
  const result: Record<string, string> = {};
  // Use emitted order, rather than className order, to catch conflicting utilities.
  css.walkRules((rule: Rule) => {
    if (!selected.has(rule.selector)) return;
    rule.each(node => {
      if (node.type === "decl") result[node.prop] = node.value;
    });
  });
  return result;
}

test("migrated layout declarations survive actual application source scanning and Tailwind compilation", async () => {
  const fixtures: {name: string; properties: Record<string, string>}[] = JSON.parse(
    await readFile(new URL("tests/fixtures/style-migration.json", root), "utf8"),
  );
  const failures: string[] = [];
  for (const fixture of fixtures) {
    const applied = presentations.get(fixture.name);
    assert.ok(applied, `baseline must cover a used presentation: ${fixture.name}`);
    const actual = {...declarations(applied.flat()), ...rules.get(`.${fixture.name}`)};
    for (const [property, expected] of Object.entries(fixture.properties)) {
      const value =
        actual[property] ?? (property === "background" ? actual["background-color"] : undefined);
      if (value === undefined || normalize(value) !== normalize(expected)) {
        failures.push(`${fixture.name} ${property}: ${expected} -> ${value}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("shared control utilities compile and retain native control geometry", () => {
  for (const variant of ["primary", "secondary", "ghost"] as const) {
    const button = declarations(buttonClasses(variant).split(" "));
    assert.equal(button["min-height"], "42px");
    assert.equal(button["font-size"], "13px");
    assert.equal(button.display, "inline-flex");
  }
  assert.equal(declarations(fieldClasses().split(" "))["min-height"], "34px");
  assert.equal(rules.get(".lounge-toggle")?.["background-color"], "#f6f8fb");
  assert.equal(rules.get(".map-card-back")?.width, "40px");
  assert.equal(rules.get(".map-card-close")?.width, "40px");
  assert.equal(rules.get(".cluster-popover-list")?.["overflow-y"], "auto");
  assert.equal(rules.get(".map-card-body")?.["overflow-y"], "auto");
  assert.equal(compiler.root, "none");
  assert.ok(compiler.sources.every(item => !item.pattern.includes("tests")));
});

// Node strips .ts types but cannot load TSX. Compile only these native wrappers in memory.
async function loadUI(
  path: string,
): Promise<Record<string, ComponentType<Record<string, unknown>>>> {
  const input = await readFile(new URL(path, root), "utf8");
  const {outputText} = ts.transpileModule(input, {
    compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext},
  });
  const code = outputText.replace(/from "([^"]+)"/g, (_match, specifier: string) => {
    const url = specifier.startsWith("@/")
      ? new URL(`${specifier.slice(2)}.ts`, root).href
      : pathToFileURL(require.resolve(specifier)).href;
    return `from ${JSON.stringify(url)}`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

test("native design system controls preserve form, accessibility and input attributes", async () => {
  const {Button, IconButton} = await loadUI("components/ui/button.tsx");
  const {Input, Select} = await loadUI("components/ui/field.tsx");
  const {Badge} = await loadUI("components/ui/badge.tsx");
  const {FilterChip} = await loadUI("components/ui/filter-chip.tsx");
  const html = renderToStaticMarkup(
    createElement(
      "form",
      {action: "/save"},
      createElement(Button, {name: "save", value: "yes", variant: "primary"}, "저장"),
      createElement(IconButton, {type: "button", "aria-label": "닫기", disabled: true}),
      createElement(Input, {type: "password", name: "password", required: true, maxLength: 1024}),
      createElement(
        Select,
        {name: "route", defaultValue: "50"},
        createElement("option", {value: "50"}, "영동선"),
      ),
      createElement(Badge, {variant: "route"}, "50"),
      createElement(FilterChip, {variant: "lounge", active: true, "aria-pressed": true}, "라운지"),
    ),
  );
  const saveButton = html.match(/<button[^>]*name="save"[^>]*>저장<\/button>/)?.[0] ?? "";
  assert.match(saveButton, /value="yes"/);
  assert.doesNotMatch(saveButton, /type=/);
  assert.match(html, /type="button" aria-label="닫기" disabled=""/);
  const passwordInput = html.match(/<input[^>]*name="password"[^>]*>/)?.[0] ?? "";
  assert.match(passwordInput, /type="password"/);
  assert.match(passwordInput, /required=""/);
  assert.match(passwordInput, /maxLength="1024"/);
  assert.match(html, /<select[^>]*name="route"/);
  assert.match(html, /<option value="50" selected="">영동선/);
  assert.match(html, /route-number/);
  assert.match(html, /lounge-toggle on[^>]*aria-pressed="true"/);
  assert.doesNotMatch(html, /\bvariant=|\bactive=/);
});
