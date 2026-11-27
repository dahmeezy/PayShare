// Browser regression checks for verification, settings, notifications, the product tour,
// role limits, and every connected screen (no sample data, dead controls or sideways scroll).
//   PLAYWRIGHT_MODULE="$(pwd)/node_modules/playwright" node ../frontend/test/regression.cjs
// Set PAYSHARE_SCREENSHOTS=<dir> to keep a screenshot of every screen.
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, rm, readFile, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { resolve, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { once } = require("node:events");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const backend = resolve(__dirname, "../../backend");
const load = file => import(pathToFileURL(join(backend, file)).href);
const password = "Regression-Passw0rd";
const shots = process.env.PAYSHARE_SCREENSHOTS;
const widths = [360, 390, 768, 1024, 1440];
// Names that appear only in the Figma sample content. None may reach a signed-in person.
const sample = /Amara|Okafor|Tola|Adeyemi|David James|Chidi|Ngozi|Femi\b|Kemi|Lagos Wedding|Sew wedding|[Bb]ridal|Eko Hotel|James–Okon|\.jpg|\.pdf|GBX7|7a3f|3c9a|PS-00142|ACH-0007|Tailor|Yoruba|studioadeyemi|1[234] Nov|19 Nov|13 Dec/;

const routes = {
  client: ["d01", "d02", "d03", "d04", "d05", "d06", "d07", "d08", "d09", "d10", "d33", "c16", "md06", "md07"],
  contractor: ["c01", "c02", "c03", "c04", "c05", "c06", "c07", "c08", "c09", "c10", "c11", "c12", "c13", "c14", "c15", "c16", "c17", "c18",
    "c19", "c20", "c21", "c22", "c23", "c24", "c25", "c26", "c27", "c28", "c29", "c30", "c31", "c32", "c33", "mc09"],
  worker: ["w01", "w02", "w03", "w04", "w05", "w06", "w07", "w08", "w09", "w10", "w11", "w12", "w13", "w33", "mw04", "mw07"],
};
const home = { client: "d01", contractor: "c01", worker: "w01" };
const people = { client: ["Quinn", "Reyes"], contractor: ["Mara", "Voss"], worker: ["Ivo", "Lind"] };

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "payshare-regression-"));
  const usersFile = join(tmp, "users.json");
  Object.assign(process.env, {
    PAYSHARE_WORKSPACE_FILE: join(tmp, "workspace.json"), PAYSHARE_USERS_FILE: usersFile,
    PAYSHARE_ENABLE_TESTNET_PAYOUTS: "false", PAYSHARE_SECURE_COOKIES: "false", PAYSHARE_RATE_LIMIT_MULTIPLIER: "100",
  });
  await (await load("src/workspace-store.mjs")).initializeWorkspace();
  const { createApp } = await load("src/server.mjs");
  const mailer = (await load("test/helpers.mjs")).testMailer();
  const server = createApp(undefined, {}, mailer).listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
  const errors = [];
  const sessions = {};
  const problems = [];
  const passed = name => console.log("✓ " + name);

  async function session(name) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(7500);
    page.on("pageerror", error => errors.push(name + ": " + error.message));
    const call = async (method, path, data, expected) => {
      const response = await context.request.fetch(origin + "/api" + path, { method, data });
      if (expected) assert.equal(response.status(), expected, path + " " + await response.text());
      else assert.ok(response.ok(), path + " " + await response.text());
      return response.json();
    };
    return { context, page, call };
  }
  const ready = (page, route) => page.waitForSelector('#screen[data-route^="' + route + '"]:not([aria-busy])');
  // A full load, so no state survives from the previous screen.
  async function visit(page, route, expected = route.replace(/\?.*/, "")) {
    await page.goto("about:blank");
    await page.goto(origin + "/frontend/prototype.html?app=1#/" + route);
    if (expected) await ready(page, expected);
    else await page.waitForSelector("#screen:not([aria-busy])");
  }

  try {
    // ── Accounts and one project with work in several states ──
    for (const [role, [firstName, lastName]] of Object.entries(people)) {
      const who = sessions[role] = await session(role);
      const email = role + "@example.test";
      await who.call("POST", "/register", { firstName, lastName, email, role, password, acceptTerms: true });
      await who.call("GET", "/workspace/projects", undefined, 403);
      await who.call("POST", "/verify", { code: mailer.code(email) });
      await who.call("POST", "/onboarding/complete", {});
      await who.call("POST", "/onboarding/tour", { status: "skipped" });
    }
    const { client, contractor, worker } = sessions;
    const project = await client.call("POST", "/workspace/projects", { name: "Harbour Launch", budget: 100000 });
    const base = "/workspace/projects/" + project.id;
    await client.call("POST", base + "/funding", { amount: 100000 });
    for (const [from, role] of [[client, "contractor"], [contractor, "worker"]]) {
      const { token } = await from.call("POST", base + "/invitations", { role, email: role + "@example.test" });
      await sessions[role].call("POST", "/workspace/invitations/respond", { token, decision: "accept" });
    }
    await contractor.call("PUT", base + "/budget", { budget: 100000, compensation: 20000 });
    await contractor.call("POST", base + "/expenses", { description: "Printing", amount: 10000 });
    const workerId = (await worker.call("GET", "/session")).id;
    const task = title => contractor.call("POST", base + "/tasks", { workerId, title, description: title + " for the event.", allocation: 15000, clientApprovalRequired: false });
    const submitted = await task("Print the banners");
    const waiting = await task("Hang the lights");
    await worker.call("POST", base + "/tasks/" + submitted.id + "/accept", {});
    await worker.call("POST", base + "/tasks/" + submitted.id + "/submission", { notes: "Banners are ready." });

    // ── Verification screen: errors, expiry, resend and a different address ──
    const guest = await session("guest");
    await visit(guest.page, "a02");
    await guest.page.getByRole("button", { name: "Create account" }).click();
    for (const message of ["Enter first name.", "Enter last name.", "Enter email address."]) await guest.page.getByText(message).waitFor();
    await guest.page.getByLabel("First name").fill("Noa");
    await guest.page.getByLabel("Last name").fill("Berg");
    await guest.page.getByLabel("Email address").fill("noa@example.test");
    await guest.page.getByLabel("Create a password").fill(password);
    await guest.page.getByRole("checkbox", { name: /I agree/ }).check();
    await guest.page.getByRole("button", { name: "Create account" }).click();
    await ready(guest.page, "a05");
    const users = JSON.parse(await readFile(usersFile, "utf8"));
    Object.assign(users["noa@example.test"].verification, { expiresAt: Date.now() - 1000, sentAt: Date.now() - 61_000 });
    await writeFile(usersFile, JSON.stringify(users));
    await visit(guest.page, "a05");
    await guest.page.getByText("This code has expired. Request a new one.").waitFor();
    await guest.page.getByLabel("Verification digit 1").fill(mailer.code("noa@example.test"));
    await guest.page.getByRole("button", { name: "Verify", exact: true }).click();
    await guest.page.locator(".ps-status").getByText(/code has expired/).waitFor();
    const before = mailer.outbox.length;
    await guest.page.getByRole("button", { name: "Resend code" }).click();
    await guest.page.getByText("A new code is on its way.", { exact: false }).waitFor();
    assert.equal(mailer.outbox.length, before + 1);
    await guest.page.getByRole("button", { name: /Resend in/ }).waitFor();
    await guest.page.getByRole("button", { name: "Use a different email" }).click();
    await ready(guest.page, "a02");
    passed("sign-up validation, expired code, resend and changing the address");

    // ── Settings save for every role and survive a reload ──
    for (const [role, who] of Object.entries(sessions)) {
      const route = { client: "d33", contractor: "c33", worker: "w33" }[role];
      const { page } = who;
      await visit(page, route);
      assert.equal(await page.locator(".ps-tabs a").count(), 5);
      await page.getByLabel("First name").fill(people[role][0] + "a");
      await page.getByRole("button", { name: "Save profile" }).click();
      await page.getByText("Profile saved.").waitFor();
      await visit(page, route);
      assert.equal(await page.getByLabel("First name").inputValue(), people[role][0] + "a");

      await page.locator(".ps-tabs").getByRole("link", { name: "Notifications" }).click();
      assert.equal(await page.getByRole("switch", { name: /WhatsApp/ }).isDisabled(), true);
      assert.equal(await page.getByText(/SMS|Message language/).count(), 0);
      await page.locator('.ps-toggle[data-channel="email"]').click();
      await page.getByText("Notification preference saved.").waitFor();
      await visit(page, route + "?tab=notifications");
      assert.equal(await page.getByRole("switch", { name: /^Email/ }).isChecked(), true);

      await visit(page, route + "?tab=appearance");
      await page.locator(".ps-theme").filter({ hasText: "Dark" }).click();
      await page.getByText("Appearance saved.").waitFor();
      assert.equal(await page.locator("#screen.appearance-dark").count(), 1);
      await page.locator(".ps-chip").filter({ hasText: /^Large$/ }).click();
      await page.waitForResponse(response => response.url().endsWith("/api/preferences")).catch(() => {});
      // A different browser gets the same choices from the account.
      const elsewhere = await session(role + "-elsewhere");
      await elsewhere.call("POST", "/login", { email: role + "@example.test", password });
      await visit(elsewhere.page, route + "?tab=appearance");
      assert.equal(await elsewhere.page.locator("#screen.appearance-dark").count(), 1);
      assert.equal(await elsewhere.page.locator('input[value="large"]').isChecked(), true);
      assert.equal(await elsewhere.page.evaluate(() => document.documentElement.dataset.demoTextSize), "large");
      await elsewhere.context.close();
      await page.locator(".ps-theme").filter({ hasText: "Light" }).click();
      await page.locator(".ps-chip").filter({ hasText: "Default" }).click();
      await page.waitForTimeout(200);

      await visit(page, route + "?tab=wallet");
      await page.getByLabel("Public Stellar wallet").fill("not-a-wallet");
      await page.getByRole("button", { name: "Save wallet" }).click();
      await page.getByText("A public Stellar address starts with G", { exact: false }).waitFor();
      const wallet = require(join(backend, "node_modules/@stellar/stellar-sdk")).Keypair.random().publicKey();
      await page.getByLabel("Public Stellar wallet").fill(wallet);
      await page.getByRole("button", { name: "Save wallet" }).click();
      await page.getByText("Wallet saved.").waitFor();
      await visit(page, route + "?tab=wallet");
      assert.equal(await page.getByLabel("Public Stellar wallet").inputValue(), wallet);

      await visit(page, route + "?tab=security");
      assert.equal(await page.getByLabel("New payout PIN").count(), role === "contractor" ? 1 : 0, role + " PIN settings");
      await page.getByRole("button", { name: "Replay the product tour" }).click();
      await page.getByRole("dialog").getByText("Step 1 of", { exact: false }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });
    }
    await visit(contractor.page, "c33?tab=security");
    await contractor.page.getByLabel("New payout PIN").fill("135790");
    await contractor.page.getByRole("button", { name: "Create payout PIN" }).click();
    await contractor.page.getByText("Payout PIN saved.").waitFor();
    await visit(contractor.page, "c33?tab=security");
    await contractor.page.getByLabel("Current payout PIN").waitFor();
    await contractor.page.getByText("Help & guides").click();
    await contractor.page.getByRole("dialog").getByRole("button", { name: "Skip tour" }).click();
    passed("profile, notifications, appearance, wallet, PIN and tour replay persist for all roles");

    // ── Notifications ──
    await visit(worker.page, "w01");
    await worker.page.getByRole("link", { name: /Notifications, \d+ unread/ }).or(worker.page.locator('[data-layer="Bell"].ps-unread')).first().click();
    await ready(worker.page, "w13");
    await worker.page.getByText("New task assigned to you").first().waitFor();
    await worker.page.getByRole("button", { name: "Mark all as read" }).click();
    await worker.page.locator(".ps-feed-item.is-unread").first().waitFor({ state: "detached" });
    await visit(worker.page, "w13");
    assert.equal(await worker.page.locator(".is-unread").count(), 0);
    await worker.page.locator(".ps-feed-item").filter({ hasText: "Hang the lights" }).click();
    await ready(worker.page, "w0");
    assert.match(worker.page.url(), new RegExp("task=" + waiting.id), "a notification opens its own task");
    await visit(worker.page, "w33?tab=notifications");
    await worker.page.locator('.ps-toggle[data-channel="inApp"]').click();
    await worker.page.getByText("Notification preference saved.").waitFor();
    await visit(worker.page, "w13");
    await worker.page.getByText("In-app notifications are off").waitFor();
    await worker.call("PUT", "/preferences", { notifications: { inApp: true } });
    passed("notification feed, read state, deep links and the in-app switch");

    // ── Search results and phone header buttons ──
    await visit(contractor.page, "c01");
    const search = contractor.page.getByRole("searchbox", { name: /Search projects/ });
    await search.fill("lights");
    await search.press("Enter");
    await contractor.page.waitForTimeout(400);
    await ready(contractor.page, "c01");
    await contractor.page.getByRole("dialog").getByRole("button", { name: "Hang the lights" }).click();
    await ready(contractor.page, "c20");
    for (const [role, who] of Object.entries(sessions)) {
      await who.page.setViewportSize({ width: 390, height: 900 });
      await visit(who.page, home[role], "m" + home[role]);
      await who.page.locator('#screen [data-layer="App bar"]').getByRole("button", { name: /^Notifications/ }).click();
      await ready(who.page, { client: "d10", contractor: "mc10", worker: "w13" }[role]);
      await who.page.setViewportSize({ width: 1440, height: 900 });
    }
    await contractor.page.setViewportSize({ width: 390, height: 900 });
    await visit(contractor.page, "c15", "mc06");
    await contractor.page.getByRole("button", { name: "Invite a worker" }).click();
    await ready(contractor.page, "c16");
    await contractor.page.setViewportSize({ width: 1440, height: 900 });
    passed("search lists its results and phone header buttons work");

    // ── Roles stay in their own workspace ──
    for (const [role, who] of Object.entries(sessions)) {
      for (const other of Object.keys(home).filter(entry => entry !== role)) {
        await visit(who.page, home[other], home[role]);
        await visit(who.page, { client: "d33", contractor: "c33", worker: "w33" }[other], home[role]);
      }
      await visit(who.page, "a07", home[role]);
      await who.call("PUT", "/onboarding/role", { role: "client" }, 409);
    }
    await worker.call("POST", base + "/tasks/" + submitted.id + "/review", { decision: "approved" }, 403);
    await worker.call("POST", base + "/expenses", { description: "No", amount: 100 }, 403);
    await client.call("PUT", "/workspace/pin", { pin: "111111" }, 403);
    passed("role-restricted screens redirect and the server refuses other roles’ actions");

    // ── Review, payout and statement export ──
    await contractor.call("POST", base + "/tasks/" + submitted.id + "/review", { decision: "approved" });
    await visit(contractor.page, "c24?project=" + project.id + "&task=" + submitted.id);
    await contractor.page.getByLabel("Payout PIN").fill("000000");
    await contractor.page.getByRole("button", { name: "Run payout simulation" }).click();
    await contractor.page.locator(".ps-status").getByText(/PIN/).waitFor();
    await contractor.page.getByLabel("Payout PIN").fill("135790");
    await contractor.page.getByRole("button", { name: "Run payout simulation" }).click();
    await ready(contractor.page, "c29");
    await visit(contractor.page, "c29?project=" + project.id);
    const [file] = await Promise.all([contractor.page.waitForEvent("download"), contractor.page.getByText("Export CSV", { exact: true }).click()]);
    const csv = await readFile(await file.path(), "utf8");
    assert.match(csv, /"Print the banners"/);
    assert.match(csv, /Simulated/);
    await visit(worker.page, "w11?project=" + project.id + "&task=" + submitted.id);
    await worker.page.getByText("Demo mode. No funds moved.").waitFor();
    passed("PIN-protected payout, receipt and CSV statement");

    // ── Every screen, size and theme ──
    if (shots) await mkdir(shots, { recursive: true });
    for (const [role, list] of Object.entries(routes)) {
      const { page } = sessions[role];
      for (const theme of ["light", "dark"]) {
        await sessions[role].call("PUT", "/preferences", { appearance: theme });
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          for (const route of list) {
            await visit(page, route, null);
            await page.waitForTimeout(60);
            const state = await page.evaluate(() => ({
              over: document.documentElement.scrollWidth - innerWidth,
              text: document.querySelector("#screen").innerText,
              empty: document.querySelector("#screen").innerText.trim().length < 20,
              // An icon that looks like a header button must be one.
              inert: [...document.querySelectorAll('#screen [data-layer="App bar"] > :is([data-layer="Bell"], [data-layer="Right"], [data-layer="Header action"])')]
                .filter(node => node.getClientRects().length && node.querySelector('[data-layer^="icon/"]') && !node.matches("a,button")).length,
            }));
            const where = [role, route, width, theme].join(" ");
            if (state.over > 0) problems.push("scrolls sideways: " + where);
            if (state.empty) problems.push("blank: " + where);
            if (state.inert) problems.push("header icon does nothing: " + where);
            const leak = state.text.match(sample);
            if (leak) problems.push("sample content “" + leak[0] + "”: " + where);
            if (shots) await page.screenshot({ path: join(shots, [role, route, width, theme].join("-") + ".png"), fullPage: true });
          }
        }
      }
      // No visible control may answer with a dead end. Shared navigation is pressed once per size.
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const pressed = new Set();
        for (const route of list) {
          await visit(page, route, null);
          const controls = page.locator("#screen .demo-action:visible");
          const labels = await controls.evaluateAll(nodes => nodes.map(node =>
            node.dataset.layer + " " + (node.innerText.trim().replace(/\s+/g, " ") || node.querySelector("[data-layer]")?.dataset.layer || "")));
          let fresh = true;
          for (const [index, label] of labels.entries()) {
            if (pressed.has(label) || /log.?out|sign out/i.test(label)) continue;
            pressed.add(label);
            if (!fresh) await visit(page, route, null);
            const address = page.url();
            await controls.nth(index).click({ timeout: 1000 }).catch(() => {});
            await page.waitForTimeout(80);
            if (await page.getByText("This action is unavailable in the connected app.").count()) {
              problems.push("dead control “" + label + "”: " + [role, route, width].join(" "));
            }
            fresh = page.url() === address && !(await page.locator("dialog[open], .ps-tour").count());
          }
        }
      }
      console.log("  checked " + list.length + " " + role + " screens");
    }
    assert.deepEqual([...new Set(problems)], []);
    passed("all screens at " + widths.join(", ") + "px in light and dark: no overflow, sample content or dead controls");
    assert.deepEqual(errors, []);
    console.log("Browser regression checks passed.");
  } catch (error) {
    if (problems.length) console.error([...new Set(problems)].join("\n"));
    if (errors.length) console.error(errors.join("\n"));
    if (process.env.PAYSHARE_BROWSER_DEBUG) {
      for (const { page } of Object.values(sessions)) {
        console.error(page.url(), (await page.locator("#screen").innerText().catch(() => "")).slice(-1200));
      }
    }
    throw error;
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
