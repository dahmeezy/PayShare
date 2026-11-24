import { api } from "./api.mjs";
import { form, makeWorkspace } from "./workspace.mjs";

export const liveMode = new URLSearchParams(location.search).get("app") === "1";

export function liveApplication({ screen, goto, render, roleFor, roles, switchTheme }) {
  let user = null;
  let draft;
  let awaiting = false;
  let invitation;
  let invitationToken = sessionStorage.getItem("payshare-invitation") || "";
  let ignoredToken = "";
  let startError = "";

  function el(tag, text) {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    return element;
  }
  function button(caption, action) {
    const element = el("button", caption);
    element.type = "button";
    element.className = "btn btn-sm";
    element.addEventListener("click", action);
    return element;
  }
  function link(caption, path) {
    const element = el("a", caption);
    element.href = "#/" + path;
    return element;
  }
  function feedback(container) {
    let message = container.querySelector(".workspace-feedback");
    if (!message) {
      message = el("p", startError);
      message.className = "workspace-feedback";
      message.setAttribute("role", "status");
      container.append(message);
    }
    return message;
  }
  function open(route) {
    if (location.hash === "#/" + route) render();
    else goto(route);
  }
  function afterAuth() {
    open(invitationToken ? "a06" : roles[user.role].home);
  }
  async function logout() {
    await api("/logout", "POST");
    user = null;
    open("a03");
  }
  function expire() {
    user = null;
    open("a03");
  }
  function saveInvitation(token) {
    invitationToken = token;
    invitation = undefined;
    if (token) sessionStorage.setItem("payshare-invitation", token);
    else sessionStorage.removeItem("payshare-invitation");
  }

  return {
    async start() {
      try { user = await api("/session"); }
      catch (error) { if (error.status !== 401) startError = error.message; }
    },
    route(requested) {
      const token = requested.match(/^join-([\w-]{43})$/)?.[1];
      if (token && token !== ignoredToken && token !== invitationToken) saveInvitation(token);
      if (token || requested === "a06") return "a06";
      if (user) return roles[user.role].home;
      if (roleFor(requested)) return "a03";
      if (requested === "a07" && !draft) return "a02";
      return ["a01", "a02", "a03", "a04", "a07"].includes(requested) ? requested : "a03";
    },
    handle(button, label, route, scope) {
      const run = async (operation) => {
        if (awaiting) return;
        awaiting = true;
        button.setAttribute("aria-disabled", "true");
        const message = feedback(scope.querySelector('[data-layer="Form"]') || scope);
        message.textContent = "Working…";
        try { message.textContent = (await operation()) || ""; }
        catch (error) { message.textContent = error.message; }
        finally { awaiting = false; button.removeAttribute("aria-disabled"); }
      };
      const value = name => scope.querySelector(`[aria-label="${name}"]`)?.value || "";
      if (route === "a02" && label === "Create account") {
        draft = { name: value("Full name"), email: value("Email address").trim(), password: value("Create a password") };
        if (invitationToken) {
          void run(async () => {
            invitation ||= await api("/workspace/invitations/lookup", "POST", { token: invitationToken });
            user = await api("/register", "POST", { ...draft, role: invitation.role });
            draft = undefined;
            afterAuth();
          });
        } else open("a07");
        return true;
      }
      if (route === "a03" && label === "Log in" && button.hasAttribute("data-submit")) {
        void run(async () => {
          user = await api("/login", "POST", { email: value("Email address").trim(), password: value("Password") });
          afterAuth();
        });
        return true;
      }
      if (route === "a03" && /login code/i.test(label)) {
        feedback(scope.querySelector('[data-layer="Form"]') || scope).textContent = "WhatsApp login is unavailable. Sign in with your password.";
        return true;
      }
      if (route === "a04" && label === "Send reset link") {
        void run(async () => (await api("/forgot", "POST", { email: value("Email address").trim() })).message);
        return true;
      }
      return false;
    },
    install(route) {
      const auth = screen.querySelector('[data-layer="Form"]');
      if (route === "a01") {
        const sample = [...screen.querySelectorAll("p")].find(p => p.textContent === "Lagos Wedding Decoration");
        if (sample) sample.textContent = "Sample project · Lagos Wedding Decoration";
      }
      if (["a02", "a03", "a04"].includes(route) && auth) {
        const input = auth.querySelector('input[data-contact]');
        if (input) {
          const caption = input.closest('[data-layer="Input"]')?.firstElementChild;
          if (caption) caption.textContent = "Email address";
          input.setAttribute("aria-label", "Email address");
          delete input.dataset.contact;
          input.type = "email";
          input.autocomplete = "email";
        }
        const password = auth.querySelector('input[data-password]');
        if (password && route === "a03") password.autocomplete = "current-password";
        if (route === "a02") {
          auth.querySelector('[data-figma="56:210"]').textContent = invitationToken
            ? "Use the email address that received your invitation." : "Use your email address.";
        }
        if (route === "a03") auth.querySelector('[data-layer="Checkbox"]')?.remove();
        if (route === "a04") {
          auth.querySelector('[data-figma="56:378"]').textContent = "Password recovery is unavailable without a message delivery service.";
          auth.querySelector('[data-figma="31:351"]')?.parentElement.remove();
          const submit = [...auth.querySelectorAll("[data-submit]")].find(item => item.innerText.trim() === "Send reset link");
          if (submit) submit.setAttribute("aria-label", "Check password recovery availability");
        }
        feedback(auth);
      }
      if (route === "a07" && auth) {
        const select = el("select");
        select.name = "role";
        for (const [value, { label }] of Object.entries(roles)) {
          const option = el("option", label);
          option.value = value;
          select.append(option);
        }
        const label = el("label", "Account role");
        label.append(select);
        auth.replaceChildren(el("h1", "How will you use PayShare?"), form("Finish registration", [label], async values => {
          user = await api("/register", "POST", { ...draft, role: values.role });
          draft = undefined;
          afterAuth();
        }), link("Back to account details", "a02"));
        auth.classList.add("workspace-auth");
      }
      if (route === "a06" && auth) {
        auth.classList.add("workspace-auth");
        auth.replaceChildren(el("h1", "Project invitation"), el("p", invitationToken ? "Loading invitation…" : "Open the private link shared by your teammate."));
        if (!invitationToken) {
          auth.append(link("Back to PayShare", "a01"));
          return;
        }
        const token = invitationToken;
        void api("/workspace/invitations/lookup", "POST", { token }).then(result => {
          if (!auth.isConnected || token !== invitationToken) return;
          invitation = result;
          auth.replaceChildren(el("h1", result.name), el("p", "You’ve been invited to join as a " + result.role + "."));
          if (!user) {
            auth.append(link("Sign in to respond", "a03"), link("Create an account to respond", "a02"));
            return;
          }
          const finish = decision => async () => {
            await api("/workspace/invitations/respond", "POST", { token, decision });
            ignoredToken = token;
            saveInvitation("");
            afterAuth();
          };
          auth.append(el("p", "Signed in as " + user.email), form("Accept invitation", [], finish("accept")),
            form("Decline invitation", [], finish("decline")),
            button("Sign out", async () => {
              try { await logout(); } catch (error) { feedback(auth).textContent = error.message; }
            }));
        }).catch(error => { if (auth.isConnected) feedback(auth).textContent = error.message; });
      }
      if (user && roleFor(route)) {
        const header = screen.querySelector('[data-layer="Top bar"],[data-layer="App bar"]');
        const content = screen.querySelector('[data-layer="Content"]');
        const nav = screen.querySelector('[data-layer="Sidebar"],[data-layer="Bottom nav"]');
        if (!content) return;
        if (nav) {
          nav.classList.add("workspace-nav");
          nav.replaceChildren(el("strong", "PayShare"), button("Projects", () => content.scrollIntoView()),
            button("Profile", () => document.querySelector("#workspace-profile")?.scrollIntoView()));
        }
        if (header) {
          header.classList.add("workspace-header");
          header.replaceChildren(el("strong", user.name), button("Switch theme", switchTheme), button("Sign out", async () => {
            try { await logout(); } catch (error) { feedback(content).textContent = error.message; }
          }));
        }
        makeWorkspace(content, user, {
          user: next => {
            user = next;
            const name = header?.querySelector("strong");
            if (name) name.textContent = user.name;
          },
          expired: expire,
        });
      }
    },
  };
}
