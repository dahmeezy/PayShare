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

async function register(page, name, email, role, invited = false) {
  if (invited) await page.getByRole("link", { name: "Create an account to respond" }).click();
  else await page.getByRole("link", { name: "Create a free account" }).click();
  assert.equal(await page.getByLabel("Full name").getAttribute("placeholder"), "Enter your full name");
  assert.equal(await page.getByLabel("Email address").getAttribute("placeholder"), "e.g. name@example.com");
  assert.equal(await page.getByLabel("Create a password").getAttribute("placeholder"), "At least 8 characters");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Create a password").fill(password);
  await page.getByRole("checkbox").check();
  const toggle = page.getByRole("button", { name: "Show password" });
  await toggle.click();
  assert.equal(await page.getByLabel("Create a password").getAttribute("type"), "text");
  await page.getByRole("button", { name: "Hide password" }).press("Space");
  await page.locator('[data-submit]').filter({ hasText: 'Create account' }).click();
  if (!invited) {
    await click(page.locator('[data-demo-role="' + role + '"]'));
    await show(page, "Continue");
  }
}

const click = locator => locator.first().click();
const show = (page, name) => click(page.getByText(name, { exact: true }));
const route = (page, frame) => page.waitForSelector('#screen[data-route^="' + frame + '"]:not([aria-busy])');
async function onboarding(page, name) {
  await route(page, "a08");
  assert.equal(await page.getByLabel("Profile name").getAttribute("placeholder"), "Enter your display name");
  assert.equal(await page.getByLabel("Public Stellar wallet").getAttribute("placeholder"), "Enter your public Stellar address (G...)");
  if (name) await page.getByLabel("Profile name").fill(name);
  await show(page, "Continue");
  await route(page, "a09");
  await show(page, "Finish setup");
  await route(page, "a10");
  await show(page, "Go to dashboard");
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
  let browser;
  let server;
  const browserErrors = [];
  const pages = [];
  const badAssets = [];
  try {
    await (await source("workspace-store.mjs")).initializeWorkspace();
    const { createApp } = await source("server.mjs");
    server = createApp().listen(0, "127.0.0.1");
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
    await onboarding(client);
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
    await onboarding(contractor);
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
    await onboarding(worker, "Worker One Updated");
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
    await contractor.getByLabel("Assign to").selectOption({ label: "Worker One" });
    await contractor.getByLabel("Require client confirmation").check();
    await show(contractor, "Assign task");
    await route(contractor, "c20");

    await worker.reload();
    await route(worker, mobile ? "mw01" : "w01");
    await worker.getByText("Worker One Updated", { exact: true }).waitFor();
    assert.equal(await worker.getByText("Contractor compensation", { exact: true }).count(), 0);
    await show(worker, "Decorate stage");
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
    await show(contractor, mobile ? "Approve" : "Approve work");
    await route(contractor, mobile ? "mc09" : "c23");
    await client.goto(origin + "/");
    await show(client, mobile ? "Review" : "Review & confirm");
    await route(client, mobile ? "md05" : "d06");
    await show(client, mobile ? "Confirm" : "Confirm deliverable");
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
    await show(contractor, "Run payout simulation");
    await route(contractor, "c29");
    await contractor.getByText("Simulated · No funds moved", { exact: true }).waitFor();

    await worker.goto(origin + "/frontend/prototype.html?app=1#/w12");
    await route(worker, mobile ? "mw10" : "w12");
    await worker.getByText("Simulated · No funds moved", { exact: true }).waitFor();
    assert.equal(await worker.getByRole("link", { name: "View verified transaction" }).count(), 0);
    for (const width of [360, 390, 768, 1024, 1440]) {
      for (const [page, role] of [[client, "d"], [contractor, "c"], [worker, "w"]]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + "/");
        await route(page, (width < 768 ? "m" : "") + role + "01");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${role} overflows at ${width}px`);
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
    await route(worker, "a08");
    assert.equal(await worker.getByLabel("Profile name").inputValue(), "Worker One Updated");
    await worker.goto(origin + "/");
    await route(worker, "w01");
    await worker.locator('[data-layer="icon/log-out"]').click();
    await worker.getByLabel("Email address").waitFor();
    await worker.getByText("Forgot password?", { exact: true }).click();
    await route(worker, "a04");
    await worker.getByLabel("Email address").fill("worker@example.test");
    await show(worker, "Check recovery availability");
    await worker.locator(".live-message").getByText("Password recovery is unavailable. No message was sent.", { exact: true }).waitFor();
    await worker.goto(origin + "/frontend/prototype.html?app=1#/d01");
    await worker.getByLabel("Email address").fill("worker@example.test");
    await worker.getByLabel("Password", { exact: true }).fill(password);
    await click(worker.locator('[data-submit]').filter({ hasText: 'Log in' }));
    await route(worker, "w01");
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(badAssets, []);
    console.log((mobile ? "Mobile" : "Desktop") + " browser MVP passed: three roles, invitations, funding, expense, budget, assignment, submission, approval, simulation, refresh and sign-out.");
    console.log("All three dashboards fit at 360, 390, 768, 1024 and 1440 px. No browser exceptions or broken frontend assets.");
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
