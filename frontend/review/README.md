# PayShare frontend review

Start a web server from the repository root.

```sh
python3 -m http.server 8080
```

Open [the demo](http://localhost:8080/frontend/prototype.html) and choose **Explore screens** to find the contractor, worker and client dashboards. The verification code is **481026**. Open **Invite worker** from the contractor dashboard to create a sample invitation. The worker can review the project, accept or decline, and finish their profile before entering the worker dashboard.

## Screenshots

- [Contractor dashboard at 768, 1024 and 1440 px](dashboard-desktop.webp)
- [Contractor dashboard at 360 and 390 px](dashboard-mobile.webp)
- [Landing page on desktop and mobile](landing.webp)
- [Password visibility, verification and invitation onboarding](onboarding.webp)

## What changed

| Issue | Fix |
| --- | --- |
| The contractor sidebar clipped navigation text, and the dashboard table became too narrow on tablets. | Let dashboard sections stack and give wide tables their own scroll area. |
| The landing project card hid its rows and crowded the Funded badge. | Let the card grow with its contents and align the badge with the project name. |
| Password fields had inconsistent show and hide controls. | Reuse an eye button that works with Enter and Space and has a label that updates with the state. |
| Verification digits had uneven sizing and the form could imply that a message was sent. | Use six equal boxes with numeric entry, focus movement, paste and feedback for wrong or incomplete codes. |
| Invited workers landed on the role picker. | Add an invitation decision before the profile, then take accepted workers to their dashboard. |
| Some controls were decorative or opened another role’s screen. | Use role-specific links, local form and dialog actions, filters, file selection and theme settings. |

## Checks

The existing navigation tests passed. Chromium also checked 127 screen routes at each of 360, 390, 768, 1024 and 1440 px, for 635 renders. The sweep checked for page overflow, clipped sidebar items, visible controls without handlers, browser errors and broken assets. All 127 Chromium screen captures were compared with the corresponding Figma exports, with a side-by-side review of the landing, verification, invitation and contractor dashboard. The expanded landing card, empty verification fields and separate invitation decision are intentional differences.

```sh
node --test frontend/prototype/navigation.test.mjs
```

With Playwright and Chromium available in your Node environment, leave the server running and start the browser checks from the repository root.

```sh
node frontend/prototype/browser-check.cjs
```

Use `PLAYWRIGHT_MODULE` to point to a local Playwright install, `BROWSER_EXECUTABLE` to use a system Chromium, or `PAYSHARE_FRONTEND_URL` to test a different local server.

## Demo limits

The frontend uses sample data. Sign-in, password reset, approvals and payments give demo feedback. Sample invitation details carry over within the open demo. File selection only shows local filenames, messages and voice notes use text drafts, and receipts and exports are sample text files. A backend is needed to send messages, upload files, persist project updates, connect a wallet or move funds.
