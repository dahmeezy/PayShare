import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authoredRoutes, displayRoute, groups, targetFor } from "./navigation.mjs";

const load = (name) => readFile(new URL(name, import.meta.url), "utf8");
const frames = JSON.parse(await load("screens.json"));
const index = new Map(frames.map(frame => [frame.route, frame]));
const prototype = authoredRoutes(JSON.parse(await load("reactions.json")));

test("all active design views have a unique, local route and their SVGs are bundled", async () => {
  assert.equal(index.size, 127);
  assert.equal(new Set(frames.map(frame => frame.id)).size, frames.length);
  assert.deepEqual(new Set(frames.map(frame => frame.page)), new Set(Object.keys(groups)));
  const assets = new Set();
  for (const frame of frames) {
    const markup = await load(`views/${frame.route}.html`);
    assert.ok(markup.includes(`data-figma="${frame.id}"`), frame.route);
    assert.doesNotMatch(markup, /figma\.com\/api\/mcp\/asset|data-asset=/, frame.route);
    for (const [, filename] of markup.matchAll(/src="prototype\/assets\/([^"]+)"/g)) assets.add(filename);
  }
  for (const filename of assets) {
    assert.match(await load(`assets/${filename}`), /<svg width="[^"]+" height="[^"]+"/, filename);
  }
});

test("uses the authored desktop, mobile and dark variants", () => {
  const phone = { narrow: true, compact: false, dark: false };
  assert.equal(displayRoute("c01", index, phone), "mc01");
  assert.equal(displayRoute("w01", index, { ...phone, compact: true }), "mw01-360");
  assert.equal(displayRoute("d01", index, { ...phone, dark: true }), "md01-dark");
  assert.equal(displayRoute("c01", index, { ...phone, narrow: false, dark: true }), "c01-dark");
});

test("follows authored project, worker and review paths", () => {
  assert.equal(targetFor("c01", "Sidebar item", "Projects", prototype), "c02");
  assert.equal(targetFor("c03", "Button", "Continue to budget", prototype), "c04");
  assert.equal(targetFor("w03", "Button", "Accept task & payment", prototype), "w04");
  assert.equal(targetFor("c24", "Button", "Authorize 150 USDC", prototype), "c25");
  assert.equal(targetFor("wa01", "CTA", "View invitation", prototype), "a06");
  assert.equal(targetFor("wa04", "CTA", "Submit securely", prototype), "w05");
  assert.equal(targetFor("wa09", "CTA", "Fund securely", prototype), "d09");
  assert.equal(targetFor("wa10", "CTA", "Fix securely", prototype), "w12");
  assert.equal(targetFor("a03", "Button", "Log in", prototype), "@home");
});
