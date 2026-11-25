# UI/UX and functional review, November 2026

Reference: the PayShare Figma file. Screens were compared on a local, backend-connected instance with seeded test data.

## What was compared, and how

- **Directly against Figma screenshots:** A02, A05, A07, A09, A10, C19, C33, W03 and D04.
- **Against the bundled Figma exports** (`frontend/prototype/views`) and the running app: the other desktop, phone and dark screens, at 360, 390, 768, 1024 and 1440 px.
- Figma has **no settings frame for workers or clients**. Their settings follow the contractor frame (C33).
- Frames not opened in Figma during this review may still differ in small visual details.

## Before and after

Each image shows Figma, `main` before the change, and the result.

| Screen | Comparison |
| --- | --- |
| Sign up | [image](../frontend/review/ux-2026-11/a02-sign-up.webp) |
| Email verification | [image](../frontend/review/ux-2026-11/a05-verify.webp) |
| Role selection | [image](../frontend/review/ux-2026-11/a07-role.webp) |
| Notification preferences | [image](../frontend/review/ux-2026-11/a09-notifications.webp) |
| First run (checklist replaced by dashboard and tour) | [image](../frontend/review/ux-2026-11/a10-first-run.webp) |
| Contractor settings | [image](../frontend/review/ux-2026-11/c33-contractor-settings.webp) |
| Worker settings | [image](../frontend/review/ux-2026-11/worker-settings.webp) |
| Client settings | [image](../frontend/review/ux-2026-11/client-settings.webp) |
| Create task | [image](../frontend/review/ux-2026-11/c19-create-task.webp) |
| Accept task | [image](../frontend/review/ux-2026-11/w03-accept-task.webp) |
| Project finances | [image](../frontend/review/ux-2026-11/d04-finances.webp) |

The email verification image was taken on a server without email credentials, so it shows the "delivery unavailable" state.

## Deliberate differences from Figma

| Figma | PayShare | Reason |
| --- | --- | --- |
| Full name; email or WhatsApp number | First name, last name, email | Requested; only email can be verified |
| SMS channel and message language | Removed | Requested; English only |
| WhatsApp channel on | Disabled, "Not available yet" | No delivery service |
| Role preselected | Nothing preselected | The role decides access, so it should be a choice |
| First-run checklist (A10) | Dashboard with a short tour | Requested |
| File and voice uploads, reminders, messaging, change requests | Omitted or labelled unavailable | Not built |
| Sample people, amounts, files and limits | Real records or an empty state | The connected app must not show invented data |
