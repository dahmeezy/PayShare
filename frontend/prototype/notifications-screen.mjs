// The in-app notification feed, built from real project events.
import { api } from "./api.mjs";
import { busy, button, el, status } from "./ui-kit.mjs";

// Where each kind of event is handled, by role.
export function destination(role, item) {
  if (role === "worker") return item.kind === "payout" ? "w12" : "w04";
  if (role === "client") return item.kind === "confirm" ? "d06" : ["funding", "payout"].includes(item.kind) ? "d08" : "d03";
  return item.kind === "submitted" ? "c21" : ["funding", "payout"].includes(item.kind) ? "c29" : "c20";
}
const when = value => new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function renderNotifications(content, { feed, role, open, refresh, settingsHref }) {
  const feedback = status();
  const mark = button("Mark all as read", { variant: "secondary", disabled: !feed?.unread });
  mark.addEventListener("click", () => busy(mark, "Saving…", feedback, async () => {
    await api("/workspace/notifications/read", "POST", {});
    await refresh();
  }));
  const empty = (title, text, action) => el("div", { class: "ps-card ps-empty" }, el("h2", {}, title), el("p", {}, text), action);
  const body = !feed ? empty("Notifications couldn’t load", "Check your connection, then try again.", button("Try again", { onclick: refresh }))
    : !feed.enabled ? empty("In-app notifications are off", "Turn them on to see tasks, approvals and payments here.",
      el("a", { class: "ps-button ps-button-primary", href: settingsHref }, "Notification settings"))
      : !feed.items.length ? empty("No notifications yet", "Task, approval and payment updates from your projects will appear here.")
        : el("ul", { class: "ps-feed" }, feed.items.map(item => el("li", {},
          el("button", { type: "button", class: "ps-feed-item" + (item.unread ? " is-unread" : ""), onclick: () => open(destination(role, item), item) },
            el("span", { class: "ps-dot", "aria-hidden": "true" }),
            el("span", { class: "ps-feed-text" }, el("strong", {}, item.title), el("span", {}, item.detail)),
            item.unread && el("span", { class: "ps-visually-hidden" }, "Unread"),
            el("time", { datetime: item.at }, when(item.at))))));
  content.replaceChildren(
    el("header", { class: "ps-page-header" }, el("div", {}, el("h1", {}, "Notifications"), el("p", {}, "Updates from all your projects.")),
      feed?.enabled && mark), feedback, body);
  content.classList.add("ps-page");
}
