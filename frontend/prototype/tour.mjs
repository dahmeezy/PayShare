// A short, role-specific tour of the dashboard for first-time users. Its card follows the
// navy "Meet the PayShare Agent" card in the Figma first-run frame (A10).
import { button, el, say, status } from "./ui-kit.mjs";

// `nav` names the sidebar item (desktop) and `tab` the bottom-bar item (phone) to point at.
export const tourSteps = {
  client: [
    { title: "Your projects", text: "Create a project and follow its progress, tasks and deliverables.", nav: "Projects", tab: "Home" },
    { title: "Funding", text: "Record funding and see exactly where every USDC of the budget goes.", nav: "Project finances", tab: "Finances" },
    { title: "Invite your contractor", text: "Open a project’s funding page and choose Invite contractor to share a private link.", nav: "Projects", tab: "More" },
    { title: "Confirm the work", text: "Deliverables that need your sign-off wait here before anyone is paid.", nav: "Deliverables & approvals", tab: "Deliverables" },
  ],
  contractor: [
    { title: "Your projects", text: "Create projects and open any one to see its team and tasks.", nav: "Projects", tab: "Home" },
    { title: "Budgets", text: "Set your compensation, record expenses and see what is left for workers.", nav: "Budget & allocations", tab: "Budget" },
    { title: "Invite workers", text: "Share a private invitation link with each person on the team.", nav: "Workers", tab: "More" },
    { title: "Assign tasks", text: "Give each task an agreed payment. The worker accepts it before starting.", nav: "Tasks", tab: "Tasks" },
    { title: "Approvals and payouts", text: "Review submitted work, then authorize each payout with your PIN.", nav: "Approvals", tab: "Payouts" },
  ],
  worker: [
    { title: "Assigned tasks", text: "Read the task and its payment, then accept or decline it.", nav: "My tasks", tab: "Tasks" },
    { title: "Submit your work", text: "Send a note or a link when you finish. Requested changes come back here.", nav: "Submissions", tab: "Tasks" },
    { title: "Payment history", text: "Follow your agreed pay and every payment and receipt.", nav: "Payment history", tab: "Payments" },
  ],
};

let active = null;
export const tourOpen = () => Boolean(active);
export function closeTour() {
  active?.();
  active = null;
}

function findTarget(screen, step) {
  const named = (selector, name) => [...screen.querySelectorAll(selector)].find(node =>
    node.querySelector("p")?.textContent.trim() === name && node.getClientRects().length);
  return named('[data-layer="Sidebar item"]', step.nav) || named('[data-layer="Bottom nav item"]', step.tab);
}

// onEnd receives "completed" or "skipped" and saves it; the tour closes once that succeeds.
export function startTour({ screen, role, onEnd }) {
  closeTour();
  const steps = tourSteps[role];
  if (!steps) return;
  const returnFocus = document.activeElement;
  let index = 0;
  const spot = el("div", { class: "ps-tour-spot", "aria-hidden": "true" });
  const count = el("p", { class: "ps-tour-count" });
  const title = el("h2", { id: "ps-tour-title" });
  const text = el("p", { id: "ps-tour-text" });
  const feedback = status();
  const back = button("Back", { variant: "ghost", onclick: () => show(index - 1) });
  const next = button("Next", { variant: "light", onclick: () => index === steps.length - 1 ? end("completed") : show(index + 1) });
  const skip = button("Skip tour", { variant: "ghost", onclick: () => end("skipped") });
  const card = el("div", { class: "ps-tour-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "ps-tour-title", "aria-describedby": "ps-tour-text" },
    count, title, text, feedback, el("div", { class: "ps-tour-actions" }, skip, el("span", { class: "ps-spacer" }), back, next));
  const overlay = el("div", { class: "ps-tour" }, spot, card);

  async function end(result) {
    next.disabled = skip.disabled = true;
    try {
      await onEnd(result);
      closeTour();
      returnFocus?.isConnected && returnFocus.focus({ preventScroll: true });
    } catch (error) {
      next.disabled = skip.disabled = false;
      say(feedback, error.message, "error");
    }
  }
  function place() {
    const target = findTarget(screen, steps[index]);
    const box = target?.getBoundingClientRect();
    overlay.classList.toggle("has-target", Boolean(box));
    if (box) Object.assign(spot.style, { left: box.left - 4 + "px", top: box.top - 4 + "px", width: box.width + 8 + "px", height: box.height + 8 + "px" });
  }
  function show(position) {
    index = position;
    const step = steps[index];
    count.textContent = "Step " + (index + 1) + " of " + steps.length;
    title.textContent = step.title;
    text.textContent = step.text;
    back.hidden = index === 0;
    next.textContent = index === steps.length - 1 ? "Finish" : "Next";
    findTarget(screen, step)?.scrollIntoView({ block: "nearest" });
    place();
    next.focus();
  }
  const keys = event => {
    if (event.key === "Escape") { event.preventDefault(); void end("skipped"); }
    if (event.key !== "Tab") return;
    const controls = [skip, back, next].filter(node => !node.hidden && !node.disabled);
    const position = controls.indexOf(document.activeElement);
    event.preventDefault();
    controls.at((position + (event.shiftKey ? -1 : 1)) % controls.length)?.focus();
  };
  document.addEventListener("keydown", keys, true);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  active = () => {
    document.removeEventListener("keydown", keys, true);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    overlay.remove();
  };
  document.body.append(overlay);
  show(0);
}
