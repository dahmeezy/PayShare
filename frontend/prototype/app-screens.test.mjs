import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { csvCell, paymentRows } from "./live-cleanup.mjs";
import { roleFor, virtualViews } from "./navigation.mjs";
import { passwordStrength } from "./password-strength.mjs";
import { destination } from "./notifications-screen.mjs";
import { tourSteps } from "./tour.mjs";

test("password strength follows what is typed", () => {
  const scores = ["", "abc", "password123", "abcdefgh", "abcdefg1", "Abcdefg1", "Abcdefg1!longer"].map(value => passwordStrength(value).score);
  assert.deepEqual(scores, [0, 1, 1, 1, 2, 3, 4]);
  assert.equal(passwordStrength("abc").label, "Too short");
  assert.equal(passwordStrength("        ").label, "Too short");
});

test("each role has its own short tour covering its duties", () => {
  const text = role => tourSteps[role].map(step => step.title + " " + step.text).join(" ");
  assert.match(text("client"), /project.*fund.*contractor.*confirm/is);
  assert.match(text("contractor"), /project.*budget.*worker.*task.*approv.*payout/is);
  assert.match(text("worker"), /task.*submit.*payment history/is);
  for (const steps of Object.values(tourSteps)) assert.ok(steps.length >= 3 && steps.length <= 5);
});

test("borrowed screens and notification links stay in the person's own workspace", async () => {
  for (const [route, shell] of Object.entries(virtualViews)) {
    assert.equal(roleFor(route), roleFor(shell));
    await readFile(new URL("views/" + shell + ".html", import.meta.url));
  }
  for (const role of ["client", "contractor", "worker"]) {
    for (const kind of ["funding", "assigned", "review", "accepted", "declined", "submitted", "confirmed", "confirm", "payout"]) {
      assert.equal(roleFor(destination(role, { kind })), role);
    }
  }
});

test("statements neutralise spreadsheet formulas and give workers all of their projects", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell("Stage"), '"Stage"');
  const project = name => ({ name, tasks: [{ title: name + " task", workerName: "Ivo", amount: 150, payout: { status: "pending" } }] });
  const data = { projects: [project("One"), project("Two")] };
  data.project = data.projects[0];
  assert.equal(paymentRows({ role: "worker" }, data).length, 3);
  assert.equal(paymentRows({ role: "client" }, data).length, 2);
});
