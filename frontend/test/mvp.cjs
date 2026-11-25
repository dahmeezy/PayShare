const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { resolve, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { once } = require("node:events");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const backend = resolve(__dirname, "../../backend");
const source = name => import(pathToFileURL(join(backend, "src", name)).href);
const password = "test-mvp-password";
const mobile = process.env.PAYSHARE_MVP_MOBILE === "1";

let mailer;
const frame = { client: "d", contractor: "c", worker: "w" };

// Signs up through the real screens: names, agreement, password feedback and the emailed code.
async function register(page, name, email, role, invited = false) {
  if (invited) await page.getByRole("link", { name: "Create an account to respond" }).click();
  else await page.getByRole("link", { name: "Create a free account" }).click();
  await route(page, "a02");
  const [firstName, lastName] = name.split(" ");
  for (const [label, hint] of [["First name", "Enter your first name"], ["Last name", "Enter your last name"],
    ["Email address", "e.g. name@example.com"], ["Create a password", "At least 8 characters"]]) {
    const input = page.getByLabel(label, { exact: true });
    assert.equal(await input.getAttribute("placeholder"), hint);
    assert.equal(await input.evaluate(node => getComputedStyle(node, "::placeholder").fontWeight), "400");
  }
  const strength = page.locator(".ps-strength");
  await page.getByLabel("Create a password").fill("abc");
  assert.match(await strength.innerText(), /Too short/);
  await page.getByLabel("Create a password").fill("password123");
  assert.equal(await strength.getAttribute("data-score"), "1");
  await page.getByLabel("Create a password").fill(password);
  assert.ok(Number(await strength.getAttribute("data-score")) >= 3);
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Email address").fill(email);
  const toggle = page.getByRole("button", { name: "Show password" });
  await toggle.click();
  assert.equal(await page.getByLabel("Create a password").getAttribute("type"), "text");
  await page.getByRole("button", { name: "Hide password" }).press("Space");
  assert.equal(await page.getByLabel("Create a password").getAttribute("type"), "password");
  // Agreement is required, unchecked by default and really clickable.
  const agree = page.getByRole("checkbox", { name: /I agree/ });
  assert.equal(await agree.isChecked(), false);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Agree to the Terms and Privacy Policy to continue.").waitFor();
  assert.equal(mailer.outbox.some(message => message.to === email), false);
  for (const [text, file] of [["Terms", "terms"], ["Privacy Policy", "privacy"]]) {
    const [policy] = await Promise.all([page.context().waitForEvent("page"), page.locator(".ps-check").getByRole("link", { name: text }).click()]);
    await policy.waitForLoadState();
    assert.match(policy.url(), new RegExp("legal/" + file + ".html"));
    assert.match(await policy.getByRole("note").innerText(), /Draft pending team approval/);
    await policy.close();
  }
  assert.equal(await agree.isChecked(), false);
  await page.locator(".ps-check").click({ position: { x: 10, y: 12 } });
  assert.equal(await agree.isChecked(), true);
  await page.getByRole("button", { name: "Create account" }).click();

  await route(page, "a05");
  await page.getByText("We sent a 6-digit code to " + email + ".").waitFor();
  assert.equal(await page.getByRole("button", { name: /Resend in/ }).isDisabled(), true);
  await fits(page, "verification");
  const code = mailer.code(email);
  await page.getByLabel("Verification digit 1").fill(code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.getByText(/That code doesn.t match/).waitFor();
  // Reloading keeps the person on the code screen.
  await page.goto(page.url().replace(/#.*/, "#/" + frame[role] + "01"));
  await route(page, "a05");
  await page.getByLabel("Verification digit 1").fill(code);
  assert.equal(await page.getByLabel("Verification digit 6").inputValue(), code[5]);
  await page.getByRole("button", { name: "Verify", exact: true }).click();

  if (invited) {
    await route(page, "a06");
    return;
  }
  await route(page, "a07");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Choose how you will use PayShare.").waitFor();
  const cards = page.locator(".ps-role");
  assert.equal(await cards.count(), 3);
  const other = cards.filter({ hasText: role === "worker" ? "I’m a client" : "I do the work" });
  await other.click();
  // Clicking anywhere on a card selects it, and only that card looks selected.
  const card = cards.filter({ hasText: { client: "I’m a client", contractor: "I manage projects", worker: "I do the work" }[role] });
  await card.click({ position: { x: 20, y: 20 } });
  assert.equal(await card.locator("input").isChecked(), true);
  assert.equal(await other.locator("input").isChecked(), false);
  const border = locator => locator.evaluate(node => getComputedStyle(node).borderColor);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  assert.equal(await border(card), "rgb(21, 154, 131)");
  assert.notEqual(await border(other), "rgb(21, 154, 131)");
  await page.getByRole("button", { name: "Continue" }).click();
}

const click = locator => locator.first().click();
const show = (page, name) => click(page.getByText(name, { exact: true }));
const route = (page, frame) => page.waitForSelector('#screen[data-route^="' + frame + '"]:not([aria-busy])');
async function fits(page, what) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), what + " scrolls sideways");
}
// Profile and notification steps, then straight to the dashboard and its first-run tour.
async function onboarding(page, role, { firstName, tour = "skip", invited = false } = {}) {
  await route(page, "a08");
  await page.getByText(invited ? "Step 1 of 2" : "Step 2 of 3").waitFor();
  assert.equal(await page.getByLabel("Public Stellar wallet").getAttribute("placeholder"), "Enter your public Stellar address (G...)");
  assert.equal(await page.getByRole("button", { name: "Back" }).count(), invited ? 0 : 1);
  if (firstName) await page.getByLabel("First name").fill(firstName);
  await page.getByRole("button", { name: "Continue" }).click();
  await route(page, "a09");
  assert.equal(await page.getByText("SMS", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Message language").count(), 0);
  assert.equal(await page.getByRole("switch", { name: /WhatsApp/ }).isDisabled(), true);
  await page.locator('.ps-toggle[data-channel="email"]').click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await route(page, (mobile ? "m" : "") + frame[role] + "01");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await fits(page, "tour");
  if (tour === "finish") {
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Back" }).click();
    await dialog.getByText("Step 1 of", { exact: false }).waitFor();
    while (await dialog.getByRole("button", { name: "Next" }).count()) await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Finish" }).click();
  } else await dialog.getByRole("button", { name: "Skip tour" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.reload();
  await route(page, (mobile ? "m" : "") + frame[role] + "01");
  await page.waitForTimeout(400);
  assert.equal(await page.getByRole("dialog").count(), 0, "the tour returned after reload");
}
async function invite(page, email, role) {
  await page.getByLabel("Invite email").fill(email);
  await page.getByLabel("Invitation role").selectOption(role);
  await show(page, "Create invitation link");
  await page.getByLabel("Invitation link").waitFor();
  const link = await page.getByLabel("Invitation link").inputValue();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  return link;
}

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "payshare-browser-"));
  process.env.PAYSHARE_WORKSPACE_FILE = join(tmp, "workspace.json");
  process.env.PAYSHARE_USERS_FILE = join(tmp, "users.json");
  process.env.PAYSHARE_ENABLE_TESTNET_PAYOUTS = "false";
  process.env.PAYSHARE_SECURE_COOKIES = "false";
  process.env.PAYSHARE_RATE_LIMIT_MULTIPLIER = "10";
  let browser;
  let server;
  const browserErrors = [];
  const pages = [];
  const badAssets = [];
  try {
    await (await source("workspace-store.mjs")).initializeWorkspace();
    const { createApp } = await source("server.mjs");
    ({ testMailer: mailer } = await import(pathToFileURL(join(backend, "test/helpers.mjs")).href));
    mailer = mailer();
    server = createApp(undefined, {}, mailer).listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
    async function page(width) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const result = await context.newPage();
      pages.push(result);
      result.setDefaultTimeout(7500);
      result.on("pageerror", error => browserErrors.push(error.message));
      result.on("response", response => {
        if (response.status() >= 400 && response.url().includes("/frontend/") && !response.url().endsWith("favicon.ico")) {
          badAssets.push(response.url());
        }
      });
      return result;
    }
    const client = await page(mobile ? 390 : 1440);
    await client.goto(origin);
    await register(client, "Client One", "client@example.test", "client");
    await onboarding(client, "client", { tour: "finish" });
    await route(client, mobile ? "md01" : "d01");
    await client.getByText(/^No project yet$/i).waitFor();
    await show(client, mobile ? "Create project" : "Fund a project");
    await route(client, "d09");
    await client.getByLabel("Project name").fill("Lagos launch");
    await client.getByLabel("Project budget (USDC)").fill("100");
    await show(client, "Create project");
    await client.getByLabel("Funding amount (USDC)").fill("101");
    await show(client, "Record simulated funding");
    await client.locator(".live-message").getByText("Funding exceeds the project budget", { exact: true }).waitFor();
    await client.getByLabel("Funding amount (USDC)").fill("100");
    let response = client.waitForResponse(res => res.url().endsWith("/funding") && res.status() === 200);
    await show(client, "Record simulated funding");
    await response;
    await client.goto(origin + "/frontend/prototype.html?app=1#/d09");
    await show(client, "Invite contractor");
    const contractorURL = await invite(client, "contractor@example.test", "contractor");

    const contractor = await page(mobile ? 390 : 1024);
    await contractor.goto(contractorURL);
    await register(contractor, "Contractor One", "contractor@example.test", "contractor", true);
    await show(contractor, "Accept invitation");
    await onboarding(contractor, "contractor", { invited: true });
    await route(contractor, mobile ? "mc01" : "c01");
    await show(contractor, mobile ? "Budget" : "View budget");
    await show(contractor, "Manage budget");
    await contractor.getByLabel("Your compensation (USDC)").fill("10");
    response = contractor.waitForResponse(res => res.url().endsWith("/budget") && res.status() === 200);
    await show(contractor, "Save changes");
    await response;
    await route(contractor, mobile ? "mc03" : "c10");
    await click(contractor.getByText("Add expense", { exact:true }));
    await contractor.getByLabel("Expense description").fill("Materials");
    await contractor.getByLabel("Amount (USDC)", { exact: true }).fill("5");
    response = contractor.waitForResponse(res => res.url().endsWith("/expenses") && res.status() === 200);
    await show(contractor, "Record approved expense");
    await response;
    await route(contractor, mobile ? "mc03" : "c10");
    if (mobile) {
      await route(contractor, "mc03");
      await contractor.getByText("5 USDC", { exact:true }).first().waitFor();
    } else await contractor.getByText("Materials", { exact:true }).waitFor();
    await contractor.goto(origin + "/frontend/prototype.html?app=1#/c01");
    if (mobile) {
      await show(contractor, "More");
      await contractor.getByRole("link", { name: "Workers", exact: true }).click();
      await route(contractor, "mc06");
    }
    await show(contractor, "Invite worker");
    const workerURL = await invite(contractor, "worker@example.test", "worker");

    const worker = await page(mobile ? 390 : 1440);
    await worker.goto(workerURL);
    await register(worker, "Worker One", "worker@example.test", "worker", true);
    await show(worker, "Accept invitation");
    await onboarding(worker, "worker", { invited: true, firstName: "Updated" });
    await route(worker, mobile ? "mw01" : "w01");

    await contractor.goto(origin + "/frontend/prototype.html?app=1#/c01");
    if (mobile) {
      await show(contractor, "Tasks");
      await route(contractor, "c18");
    }
    await show(contractor, "Create task");
    await contractor.getByLabel("Task title").fill("Decorate stage");
    await contractor.getByLabel("Task description").fill("Install the event backdrop");
    await contractor.getByLabel("Agreed payment (USDC)").fill("45");
    await contractor.getByLabel("Assign to").selectOption({ label: "Updated One" });
    await contractor.getByLabel("Require client confirmation").check();
    await show(contractor, "Assign task");
    await route(contractor, "c20");

    await worker.reload();
    await route(worker, mobile ? "mw01" : "w01");
    await worker.getByText("Updated One", { exact: true }).waitFor();
    assert.equal(await worker.getByText("Contractor compensation", { exact: true }).count(), 0);
    await show(worker, "Decorate stage");
    await route(worker, mobile ? "mw05" : "w03");
    await show(worker, "Accept task & payment");
    await worker.getByText("Tick the box to confirm", { exact: false }).waitFor();
    await worker.getByRole("checkbox", { name: /I understand the task/ }).check();
    await show(worker, "Accept task & payment");
    await route(worker, mobile ? "mw03" : "w04");
    await show(worker, "Submit work");
    await worker.getByLabel("Submission notes or work link").fill("Backdrop installed. Ready for review.");
    response = worker.waitForResponse(res => res.url().endsWith("/submission") && res.status() === 200);
    await show(worker, "Submit for review");
    await response;
    await route(worker, "w06");

    await contractor.goto(origin + "/frontend/prototype.html?app=1#/c01");
    await show(contractor, mobile ? "Review" : "Review submissions");
    await route(contractor, mobile ? "mc08" : "c21");
    await contractor.getByText("Backdrop installed. Ready for review.", { exact: true }).waitFor();
    await show(contractor, "Approve work");
    await route(contractor, mobile ? "mc09" : "c23");
    await client.goto(origin + "/");
    await show(client, mobile ? "Review" : "Review & confirm");
    await route(client, mobile ? "md05" : "d06");
    await client.getByRole("checkbox", { name: /checked the work/ }).check();
    await show(client, "Confirm deliverable");
    await route(client, mobile ? "md01" : "d01");
    if (mobile) {
      await show(client, "More");
      await client.getByRole("link", { name: "Projects", exact: true }).click();
    } else await show(client, "Projects");
    await route(client, "d02");
    await show(client, "Lagos launch");
    await route(client, mobile ? "md02" : "d03");
    await client.getByText("Decorate stage", { exact:true }).first().waitFor();
    const approvalPage = contractor.url();
    const params = new URLSearchParams(new URL(approvalPage).hash.split("?")[1]);
    params.set("task", "old-task-id");
    await contractor.goto(origin + "/frontend/prototype.html?app=1#/c24?" + params);
    await route(contractor, "c24");
    await contractor.getByText("This project or task is unavailable. Choose a record from the list.", { exact: true }).waitFor();
    assert.equal(await contractor.getByText("Run payout simulation", { exact: true }).isVisible(), false);
    await contractor.goto(approvalPage);
    await show(contractor, mobile ? "Run payout simulation" : "Authorize payout");
    await route(contractor, "c24");
    await contractor.getByLabel("Create a 6-digit payout PIN").fill("123456");
    await show(contractor, "Run payout simulation");
    await route(contractor, "c29");
    await contractor.getByText("Simulated", { exact: true }).first().waitFor();

    await worker.goto(origin + "/frontend/prototype.html?app=1#/w12");
    await route(worker, mobile ? "mw10" : "w12");
    await worker.getByText("Simulated", { exact: true }).first().waitFor();
    assert.equal(await worker.getByRole("link", { name: "View verified transaction" }).count(), 0);
    for (const width of [360, 390, 430, 768, 1024, 1440, 1920]) {
      for (const [page, role] of [[client, "d"], [contractor, "c"], [worker, "w"]]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + "/");
        await route(page, (width < 768 ? "m" : "") + role + "01");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${role} overflows at ${width}px`);
        assert.ok(await page.evaluate(() => { const box = document.querySelector("#screen").getBoundingClientRect(); return box.left === 0 && Math.round(box.width) === innerWidth; }),
          `${role} does not fill the screen at ${width}px`);
        const nav = width < 768 ? "Bottom nav" : "Sidebar";
        assert.equal(await page.locator('#screen [data-layer="' + nav + '"] img').count() > 0, true);
      }
    }
    for (const [page, role] of [[client, "d"], [contractor, "c"], [worker, "w"]]) {
      await page.goto(origin + "/frontend/prototype.html?app=1#/" + role + "01-dark");
      await route(page, role + "01-dark");
      assert.equal(await page.locator("#screen.appearance-dark").count(), 1);
    }
    await worker.goto(origin + "/frontend/prototype.html?app=1#/a08");
    await route(worker, "w33");
    assert.equal(await worker.getByLabel("First name").inputValue(), "Updated");
    await worker.goto(origin + "/");
    await route(worker, "w01");
    await worker.locator('[data-layer="icon/log-out"]').click();
    await worker.getByLabel("Email address").waitFor();
    await worker.getByText("Forgot password?", { exact: true }).click();
    await route(worker, "a04");
    await worker.getByLabel("Email address").fill("worker@example.test");
    await show(worker, "Check recovery availability");
    await worker.getByText("Password recovery is unavailable. No message was sent.", { exact: true }).waitFor();
    await worker.goto(origin + "/frontend/prototype.html?app=1#/d01");
    await worker.getByLabel("Email address").fill("worker@example.test");
    await worker.getByLabel("Password", { exact: true }).fill(password);
    await worker.getByRole("button", { name: "Log in", exact: true }).click();
    await route(worker, "w01");
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(badAssets, []);
    console.log((mobile ? "Mobile" : "Desktop") + " browser MVP passed: three roles, invitations, funding, expense, budget, assignment, submission, approval, simulation, refresh and sign-out.");
    console.log("All three dashboards fill the screen at 360, 390, 430, 768, 1024, 1440 and 1920 px. No browser exceptions or broken frontend assets.");
  } catch (error) {
    if (process.env.PAYSHARE_BROWSER_DEBUG) {
      for (const page of pages) {
        console.error(await page.locator("#screen").getAttribute("data-route"), (await page.locator("#screen").innerText()).slice(-2500));
      }
      console.error(browserErrors);
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
