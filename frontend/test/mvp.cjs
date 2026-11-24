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

async function register(page, name, email, role, invited = false) {
  if (invited) await page.getByRole("link", { name: "Create an account to respond" }).click();
  else await page.getByRole("link", { name: "Create a free account" }).click();
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
    await page.getByLabel("Account role").selectOption(role);
    await page.getByRole("button", { name: "Finish registration" }).click();
  }
}

async function invite(page, email, role) {
  await page.getByText("Invite teammate", { exact: true }).click();
  await page.getByLabel("Invite email").fill(email);
  await page.getByLabel("Invitation role").selectOption(role);
  await page.getByRole("button", { name: "Create invitation link" }).click();
  await page.getByLabel("Invitation link").waitFor();
  return page.getByLabel("Invitation link").inputValue();
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
      result.setDefaultTimeout(7500);
      result.on("pageerror", error => browserErrors.push(error.message));
      result.on("response", response => {
        if (response.status() >= 400 && response.url().includes("/frontend/") && !response.url().endsWith("favicon.ico")) {
          badAssets.push(response.url());
        }
      });
      return result;
    }
    const client = await page(1440);
    await client.goto(origin);
    await register(client, "Client One", "client@example.test", "client");
    await client.getByRole("heading", { name: "Client workspace" }).waitFor();
    await client.getByText("No projects yet.").waitFor();
    await client.getByLabel("Project name").fill("Lagos launch");
    await client.getByLabel("Project budget (USDC)").fill("100");
    await client.getByRole("button", { name: "Create project" }).click();
    await client.getByRole("heading", { name: "Lagos launch" }).waitFor();
    await client.getByText("Fund project", { exact: true }).click();
    await client.getByLabel("Funding amount (USDC)").fill("101");
    await client.getByRole("button", { name: "Record simulated funding" }).click();
    await client.getByText("Funding exceeds the project budget").waitFor();
    await client.getByLabel("Funding amount (USDC)").fill("100");
    let response = client.waitForResponse(res => res.url().endsWith("/funding") && res.status() === 200);
    await client.getByRole("button", { name: "Record simulated funding" }).click();
    await response;
    const contractorURL = await invite(client, "contractor@example.test", "contractor");

    const contractor = await page(1024);
    await contractor.goto(contractorURL);
    await register(contractor, "Contractor One", "contractor@example.test", "contractor", true);
    await contractor.getByRole("button", { name: "Accept invitation" }).click();
    await contractor.getByRole("heading", { name: "Contractor workspace" }).waitFor();
    await contractor.getByText("Manage budget", { exact: true }).click();
    await contractor.getByLabel("Contractor compensation (USDC)").fill("10");
    response = contractor.waitForResponse(res => res.url().endsWith("/budget") && res.status() === 200);
    await contractor.getByRole("button", { name: "Save budget" }).click();
    await response;
    await contractor.getByText("Record expense", { exact: true }).click();
    await contractor.getByLabel("Expense description").fill("Materials");
    await contractor.getByLabel("Expense amount (USDC)").fill("5");
    response = contractor.waitForResponse(res => res.url().endsWith("/expenses") && res.status() === 200);
    await contractor.getByRole("button", { name: "Save expense" }).click();
    await response;
    const workerURL = await invite(contractor, "worker@example.test", "worker");

    const worker = await page(390);
    await worker.goto(workerURL);
    await register(worker, "Worker One", "worker@example.test", "worker", true);
    await worker.getByRole("button", { name: "Accept invitation" }).click();
    await worker.getByRole("heading", { name: "Worker workspace" }).waitFor();
    await worker.getByRole("heading", { name: "Lagos launch" }).waitFor();
    await worker.getByLabel("Profile name").fill("Worker One Updated");
    await worker.getByRole("button", { name: "Save profile" }).click();
    await worker.getByText("Profile saved.").waitFor();

    await contractor.getByRole("button", { name: "Refresh projects" }).click();
    await contractor.getByText("Assign task", { exact: true }).click();
    await contractor.getByLabel("Task title").fill("Decorate stage");
    await contractor.getByLabel("Task description").fill("Install the event backdrop");
    await contractor.getByLabel("Worker allocation (USDC)").fill("45");
    await contractor.getByLabel("Client confirmation", { exact: true }).selectOption("yes");
    await contractor.getByRole("button", { name: "Assign task and allocation" }).click();
    await contractor.getByRole("heading", { name: "Decorate stage" }).waitFor();

    await worker.reload();
    await worker.getByRole("heading", { name: "Decorate stage" }).waitFor();
    await worker.getByText("Worker One Updated", { exact: true }).waitFor();
    assert.equal(await worker.getByText("Contractor compensation", { exact: true }).count(), 0);
    await worker.getByLabel("Submission notes or work link").fill("Backdrop installed. Ready for review.");
    await worker.getByRole("button", { name: "Submit work" }).click();
    await worker.getByText(/Worker One .*submitted/).waitFor();
    await contractor.getByRole("button", { name: "Refresh projects" }).click();
    await contractor.getByLabel("Review decision").selectOption("approved");
    await contractor.getByRole("button", { name: "Save review" }).click();
    await client.getByRole("button", { name: "Refresh projects" }).click();
    await client.getByRole("button", { name: "Confirm deliverable" }).click();
    await client.getByText("Client confirmed", { exact: true }).waitFor();
    await contractor.getByRole("button", { name: "Refresh projects" }).click();
    await contractor.getByRole("button", { name: "Run payout simulation" }).click();
    await contractor.getByText("Simulated payout · No funds moved").waitFor();

    await worker.reload();
    await worker.getByText("Simulated payout · No funds moved").waitFor();
    assert.equal(await worker.getByRole("link", { name: "View verified transaction" }).count(), 0);
    for (const width of [360, 390, 768, 1024, 1440]) {
      for (const [page, role] of [[client, "Client"], [contractor, "Contractor"], [worker, "Worker"]]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForFunction(mobile => {
          const screen = document.querySelector("#screen");
          return screen.classList.contains("phone") === mobile && !screen.hasAttribute("aria-busy");
        }, width < 768);
        await page.getByRole("heading", { name: role + " workspace" }).waitFor();
        await page.getByRole("heading", { name: "Decorate stage" }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${role} overflows at ${width}px`);
      }
    }
    await worker.getByRole("button", { name: "Sign out" }).click();
    await worker.getByLabel("Email address").waitFor();
    await worker.getByText("Forgot password?", { exact: true }).click();
    await worker.getByLabel("Email address").fill("worker@example.test");
    await worker.getByRole("link", { name: "Check password recovery availability" }).click();
    await worker.getByText("Password recovery is unavailable. No message was sent.", { exact: true }).waitFor();
    await worker.goto(origin + "/frontend/prototype.html?app=1#/d01");
    await worker.getByLabel("Email address").fill("worker@example.test");
    await worker.getByLabel("Password", { exact: true }).fill(password);
    await worker.locator('[data-submit]').filter({ hasText: 'Log in' }).click();
    await worker.getByRole("heading", { name: "Worker workspace" }).waitFor();
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(badAssets, []);
    console.log("Browser MVP passed: three roles, invitations, funding, expense, budget, assignment, submission, approval, simulation, refresh and sign-out.");
    console.log("All three dashboards fit at 360, 390, 768, 1024 and 1440 px. No browser exceptions or broken frontend assets.");
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
