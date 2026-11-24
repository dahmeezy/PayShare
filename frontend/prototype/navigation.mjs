export const groups = {
  "34:113": "Auth and onboarding", "30:18": "Contractor desktop", "30:19": "Contractor mobile",
  "30:20": "Worker desktop", "30:21": "Worker mobile", "30:22": "Client desktop",
  "30:23": "Client mobile", "30:24": "WhatsApp",
};

const mobile = {
  c01: "mc01", c06: "mc02", c10: "mc03", c11: "mc04", c12: "mc05",
  c15: "mc06", c19: "mc07", c21: "mc08", c23: "mc09", c32: "mc10",
  w01: "mw01", w02: "mw02", w04: "mw03", w03: "mw05", w05: "mw06",
  w08: "mw07", w09: "mw08", w10: "mw09", w12: "mw10",
  d01: "md01", d03: "md02", d04: "md03", d05: "md04", d06: "md05", d07: "md06",
};
export const roleFor = (route) => /^(mc|c)\d/.test(route) ? "contractor"
  : /^(mw|w)\d/.test(route) ? "worker" : /^(md|d)\d/.test(route) ? "client" : "";
export function displayRoute(route, screenIndex, { narrow, compact, dark }) {
  const base = route.replace(/-(dark|360)$/, "");
  const display = narrow ? (mobile[base] || base) : base;
  if (route !== base && route.endsWith("-360")) return route;
  if (route !== base && route.endsWith("-dark")) return narrow && screenIndex.has(display + "-dark") ? display + "-dark" : route;
  if (dark && screenIndex.has(display + "-dark")) return display + "-dark";
  if (compact && screenIndex.has(display + "-360")) return display + "-360";
  return display;
}

const nav = {
  contractor: { overview:"c01", home:"c01", projects:"c02", workers:"c15", tasks:"c18", budget:"c10",
    "budget & allocations":"c10", approvals:"c23", payouts:"c23", transactions:"c29", "agent activity":"c31",
    notifications:"c32", settings:"c33" },
  worker: { overview:"w01", home:"w01", tasks:"w02", "my tasks":"w02", "assigned tasks":"w02",
    submissions:"w05", "my allocation":"w08", allocation:"w08", payments:"w12", history:"w12",
    "payment history":"w12", notifications:"w13", settings:"@settings" },
  client: { overview:"d01", home:"d01", projects:"d02", finances:"d04", "project finances":"d04",
    "worker allocations":"d05", deliverables:"d06", "deliverables & approvals":"d06",
    approvals:"d07", payments:"d08", transactions:"d08", notifications:"md07", settings:"@settings" },
};
const menuItems = {
  contractor: ["overview", "projects", "workers", "tasks", "budget & allocations", "approvals", "transactions", "agent activity", "notifications", "settings"],
  worker: ["overview", "my tasks", "submissions", "my allocation", "payment history", "notifications", "settings"],
  client: ["overview", "projects", "project finances", "worker allocations", "deliverables & approvals", "transactions", "notifications", "settings"],
};
export function roleLinks(role) {
  return menuItems[role].map(label => [label[0].toUpperCase() + label.slice(1), nav[role][label]]);
}

const common = {
  "get started":"a02", "create a free account":"a02", "sign up":"a02", "create an account":"a02",
  "i was invited to a project":"a06", "log out":"a01", "sign out":"a01", "forgot password?":"a04",
  "forgot password":"a04", "back to log in":"a03", "go to log in":"a03", "create project":"c03",
  "new project":"c03", "create task":"c19", "new task":"c19", "invite worker":"c16",
  "view budget":"c10", "all tasks":"c18", "add expense":"c14", "propose change":"c12",
  "review submissions":"c21", "open agent activity":"c31", "view worker":"c17", "edit project":"c09",
  "fund a project":"d09", "fund project":"d09", "review & confirm":"d06",
  "resolve incomplete task":"c22", "report a problem":"w10", "submit work":"w05",
  "review & accept":"w03", "review and accept":"w03", "accept task":"w04",
  "view receipt":"w11", "payment history":"w12", "view transaction":"c30",
};
const local = {
  a01: { "log in":"a03" }, a02: { "create account":"a05", "log in":"a03" },
  a03: { "log in":"@home", "get a login code on whatsapp":"a05", "sign up":"a02" },
  a04: { "send reset link":"a05", "send reset code":"a05" },
  a05: { verify:"a07", "verify account":"a07", "verify & continue":"a07", continue:"a07" },
  a06: { "join project":"w01" },
  a07: { continue:"a08" }, a08: { continue:"a09", "save profile":"a09" },
  a09: { "enable notifications":"a10", "turn on notifications":"a10", "skip for now":"a10", continue:"a10", "finish setup":"a10" },
  a10: { "go to dashboard":"@home", "start exploring":"@home", "got it":"@home", invite:"c16" },
  c01: { review:"c21", view:"c13" }, c02: { "lagos wedding decoration":"c06" }, c03: { cancel:"c02", "continue to budget":"c04" },
  c04: { back:"c03", "continue to workers":"c05" }, c05: { back:"c04", "skip for now":"c06", "send 5 invites & finish":"c06" },
  c06: { overview:"c06", tasks:"c18", budget:"c10", members:"c07", activity:"c08", settings:"c09" },
  c07: { overview:"c06", tasks:"c18", budget:"c10", members:"c07", activity:"c08", settings:"c09" },
  c08: { overview:"c06", tasks:"c18", budget:"c10", members:"c07", activity:"c08", settings:"c09" },
  c09: { overview:"c06", tasks:"c18", budget:"c10", members:"c07", activity:"c08", settings:"c09" },
  c10: { "worker allocations":"c11", "amara okafor":"c11", "change history":"c13" }, c12: { cancel:"c11", "send to amara":"c13" },
  c14: { cancel:"c10", "save expense":"c10", "add expense":"c10", "send to david for approval":"c10" }, c16: { cancel:"c15", "send invitation":"c15", "send invite":"c15" },
  c17: { "assign task":"c19", "view allocation & history":"c11" },
  c18: { "sew wedding outfits":"c20", "review report":"c22" },
  c19: { "create task":"c20", "save task":"c20", "send task to amara":"c20", cancel:"c18" },
  c20: { "review submission":"c21" },
  c21: { approve:"c23", "approve submission":"c23", "approve work":"c23" },
  c24: { cancel:"c23" }, c25: { "back to approvals":"c23", "view approvals":"c23" },
  c26: { "view receipt":"c30" }, c27: { retry:"c24", "retry payment":"c24", "back to approvals":"c23" },
  c28: { "back to approvals":"c23" }, c29: { "payment to amara okafor":"c30" },
  c30: { "back to transactions":"c29" },
  mc01: { review:"mc08", decide:"c22" }, mc04: { "amara okafor":"mc05" }, mc05: { cancel:"mc04", "send to amara":"c13" },
  mc07: { "create task":"mc02", "send to amara":"mc02", cancel:"mc02" }, mc08: { approve:"mc09" }, mc09: { "authorize 150 usdc":"c25" },
  w01: { "all tasks":"w02" }, w02: { "sew wedding outfits":"w03", view:"w04", receipt:"w11" },
  w03: { "accept task & payment":"w04", "report a problem":"w10" }, w04: { send:"w05", "submit work":"w05" },
  w05: { "submit for review":"w06", cancel:"w04" }, w06: { "back to task":"w04", "back to my tasks":"w02" },
  w07: { "resubmit work":"w05", "submit revised work":"w05", "submit again":"w05" }, w08: { "respond to change request":"w09" },
  w09: { "accept change":"w08", "decline change":"w08", "send counteroffer":"w08", "send my answer":"w08" },
  w10: { "send report":"w04", "submit report":"w04", "send to tola":"w04", cancel:"w04" }, w12: { "view receipt":"w11" },
  mw02: { "sew wedding outfits":"mw03", "review & accept":"mw05" }, mw03: { "voice note":"mw04", "accept task":"mw05", "submit work":"mw06", "report problem":"mw09" },
  mw04: { "back to task":"mw03" }, mw05: { "accept task & payment":"mw03", accept:"mw03", ask:"wa02" }, mw06: { "submit for review":"w06" },
  mw07: { respond:"mw08" }, mw08: { "accept change":"mw07", "decline change":"mw07", "send answer":"mw07" }, mw09: { "send report":"mw03", "send to tola":"mw03" }, mw10: { "view receipt":"w11" },
  d02: { "lagos wedding decoration":"d04" }, d03: { overview:"d03", finances:"d04", allocations:"d05", deliverables:"d06" },
  d06: { confirm:"d01", "confirm deliverable":"d01", "confirm & release":"d01", "request changes":"d01" },
  d04: { "view receipt":"d08" }, d07: { "approve change":"d04", "decline change":"d04", reject:"d04" }, d09: { cancel:"d01" },
  md01: { review:"md05", decide:"md06" }, md05: { confirm:"md01", "confirm deliverable":"md01", approve:"md01" }, md06: { "approve change":"md03", approve:"md03", reject:"md01" },
};

export function normalize(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}
export function authoredRoutes(reactions) {
  const result = {};
  const id = name => (name.match(/\b(?:C|W|D)\d\d\b/) || [""])[0].toLowerCase();
  for (const [from, layer, label, to] of reactions) {
    (result[id(from)] ||= {})[layer + ":" + normalize(label)] = id(to);
  }
  return result;
}
export function targetFor(route, layer, label, authored) {
  const base = route.replace(/-(dark|360)$/, "");
  const text = normalize(label);
  const key = text.replace(/\s*\d+$/, "");
  if (authored[base]?.[layer + ":" + text]) return authored[base][layer + ":" + text];
  if (/^(Sidebar item|Bottom nav item)$/i.test(layer)) return nav[roleFor(base)]?.[key];
  if (layer === "Logo") return nav[roleFor(base)]?.overview || "a01";
  if (/^wa\d/.test(base) && layer === "CTA") {
    if (base === "wa09" && /fund/i.test(text)) return "d09";
    return { wa01:"a06", wa02:"w03", wa04:"w05", wa05:"w11", wa06:"w09",
      wa08:"d06", wa09:"d07", wa10:"w12" }[base];
  }
  if (base === "wa03" && layer === "Quick reply" && /more time/i.test(text)) return "w10";
  if (layer === "Chip" && ["mc02", "md02"].includes(base)) {
    return (base === "mc02" ? { overview:"mc02", tasks:"c18", budget:"mc03", members:"c07", activity:"c08" }
      : { overview:"md02", finances:"md03", allocations:"md04", deliverables:"md05" })[text];
  }
  return local[base]?.[text] || common[text];
}
