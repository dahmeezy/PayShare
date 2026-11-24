const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.PAYSHARE_FRONTEND_URL || "http://127.0.0.1:8080/frontend/";
const url = base + "prototype.html";

(async() => {
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true });
const errors = [];
const bad = [];
const page = await browser.newPage({viewport:{width:1440,height:960}});
page.on("pageerror",e=>errors.push(e.message));
page.on("response",r=>{if(r.status()>=400&&!r.url().includes("favicon"))bad.push(r.status()+" "+r.url());});
const wait = route => page.waitForFunction(route => {
  const screen = document.querySelector("#screen");
  return screen.dataset.route === route && !!screen.querySelector("[data-figma]") && !screen.hasAttribute("aria-busy");
},route,{timeout:5500});
const go = async(route, expected=route) => {await page.goto(url+"#/"+route);await wait(expected);};
const click = text => page.locator("#screen .demo-action").filter({hasText:text}).first().click({timeout:5500});
const input = text => page.getByLabel(text,{exact:true});
async function enter(text) {
 const first=page.getByLabel("Verification digit 1");
 await first.focus();
 await first.evaluate((node,text) => {
   const box=new DataTransfer();box.setData("text",text);
   node.dispatchEvent(new ClipboardEvent("paste",{clipboardData:box,bubbles:true,cancelable:true}));
 },text);
}
try {
 await go("a01");
 await click("Create a free account");
 await wait("a02");
 await click("Create account");
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute("aria-label")),"Full name");
 await input("Full name").fill("Demo Person");
 await input("Email or WhatsApp number").fill("invalid");
 await input("Create a password").fill("test-demo-password");
 await click("Create account");
 assert.equal(await page.evaluate(()=>document.activeElement.validationMessage),"Enter an email address or a phone number with its country code.");
 await input("Email or WhatsApp number").fill("demo@example.test");
 const toggle=page.getByRole("button",{name:"Show password"});
 await toggle.click();
 assert.equal(await input("Create a password").getAttribute("type"),"text");
 await page.getByRole("button",{name:"Hide password"}).press("Space");
 assert.equal(await input("Create a password").getAttribute("type"),"password");
 assert.equal(await input("Create a password").inputValue(),"test-demo-password");
 await page.getByRole("checkbox",{name:/agree to the terms/i}).check();
 await click("Create account");await wait("a05");

 const digits=page.locator(".verification-digit");
 assert.equal(await digits.count(),6);
 const centers=await digits.evaluateAll(n=>n.map(x=>[x.clientWidth,x.clientHeight,getComputedStyle(x).textAlign]));
 assert.equal(new Set(centers.map(JSON.stringify)).size,1);
 await digits.first().focus();await page.keyboard.type("x4");
 assert.equal(await digits.first().inputValue(),"4");
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute("aria-label")),"Verification digit 2");
 await digits.nth(1).press("Backspace");
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute("aria-label")),"Verification digit 1");
 await enter("123456");await click("Verify");
 await page.locator("#screen .auth-feedback").getByText(/doesn’t match/).waitFor();
 await enter("481,026");await click("Verify");await wait("a07");

 await go("a06");
 assert.equal(await input("Your name").isVisible(),false);
 await page.getByRole("button",{name:"Decline invitation"}).click();
 await page.getByText("Invitation declined in this demo.").waitFor();
 await page.getByRole("button",{name:"Back to welcome"}).click();await wait("a01");
 await go("wa01");await click("View invitation");await wait("a06");
 await page.getByRole("button",{name:"Accept invitation"}).click();
 await input("Your name").fill("Demo Worker");
 await input("WhatsApp number").fill("+234 803 555 0192");
 await click("Join project");await wait("w01");
 await page.locator('[data-layer="Sidebar item"]').filter({hasText:"Settings"}).click();
 await page.getByRole("dialog",{name:"Settings"}).getByText("Worker demo preferences").waitFor();
 await page.keyboard.press("Escape");await wait("w01");

 await go("a04");
 await input("Email or WhatsApp number").fill("demo@example.test");
 await click("Send reset link");await wait("a05");
 await enter("481026");await click("Verify");await wait("reset-password");
 await input("New password").fill("sample-pass");
 await input("Confirm password").fill("different-pass");
 assert.equal(await page.getByRole("button",{name:"Show password"}).count(),2);
 await click("Save new password");
 assert.equal(await page.evaluate(()=>document.activeElement.validationMessage),"The passwords must match.");
 await input("Confirm password").fill("sample-pass");
 await click("Save new password");await wait("a03");

 await go("c16");
 await input("Name").fill("Demo Worker");
 await input("WhatsApp number or email").fill("+234 803 555 0192");
 await click("Send invite");
 const invite = page.getByRole("dialog", { name: "Sample invitation ready" });
 await invite.getByRole("link", { name: "Open worker invitation" }).click();
 await wait("a06");
 await page.getByRole("button", { name: "Accept invitation" }).click();
 assert.equal(await input("Your name").inputValue(), "Demo Worker");

 await go("c12");
 await page.getByRole("dialog").waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute("role")),"dialog");
 await page.keyboard.press("Shift+Tab");
 assert.equal(await page.evaluate(()=>!!document.activeElement.closest('[role="dialog"]')),true);
 await page.keyboard.press("Escape");await wait("c11");

 await go("c15");
 const workers=page.locator('[data-layer="Worker card"]:visible');
 const total=await workers.count();assert.ok(total>=4);
 await click("Invited (1)");assert.ok(await workers.count()<total);
 await click("All (6)");assert.equal(await workers.count(),total);
 await input("Search by name or skill").fill("Amara");assert.equal(await workers.count(),1);

 await go("d01");await page.locator('[data-layer="Sidebar item"]').filter({hasText:"Settings"}).click();
 await page.getByRole("dialog",{name:"Settings"}).getByText("Client demo preferences").waitFor();
 await page.getByRole("button",{name:"Use dark theme"}).click();await wait("d01-dark");
 await page.getByRole("button",{name:"Explore screens"}).click();
 await page.getByRole("button",{name:"Switch theme"}).click();await wait("d01");
 await page.keyboard.press("Escape");
 await page.setViewportSize({width:390,height:844});
 await go("d01","md01");await click("Payments");await wait("d08");
 await page.getByRole("button",{name:"Client menu"}).click();
 const menu=page.getByRole("dialog",{name:"Client navigation"});
 assert.equal(await menu.getByRole("link",{name:"Worker allocations"}).count(),1);
 assert.equal(await menu.getByRole("link",{name:"My allocation"}).count(),0);
 await page.keyboard.press("Escape");
 await go("w05","mw06");
 const file=page.locator('input[type="file"]').first();
 if(await file.count()) {
  await file.setInputFiles({name:"demo.txt",mimeType:"text/plain",buffer:Buffer.from("sample")});
  await page.getByText("Selected locally: demo.txt").waitFor();
 }
 for (const width of [360, 390, 768, 1024, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await go("c01", width <= 600 ? (width === 360 ? "mc01-360" : "mc01") : "c01");
  const layout = await page.evaluate(() => ({
   documentWidth: document.documentElement.scrollWidth,
   clippedSidebarItem: [...document.querySelectorAll('#screen [data-layer="Sidebar item"]')]
    .some(item => item.offsetParent && (item.scrollWidth > item.clientWidth + 2 || item.scrollHeight > item.clientHeight + 2)),
  }));
  assert.ok(layout.documentWidth <= width);
  assert.equal(layout.clippedSidebarItem, false);
 }
 for(const name of ["login","signup","forgot","verify"]){
  await page.goto(base+name+".html");
  if(["login","signup"].includes(name)) assert.ok(await page.getByRole("button",{name:"Show password"}).count());
 }
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 console.log("Browser interactions passed: password and reset, code entry and paste, accept/decline invitation, role navigation, dialog focus, validation, filters, theme and five viewport widths.");
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
