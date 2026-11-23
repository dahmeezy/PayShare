// The screen templates supply the sample project and transaction text from Figma.
// Interactions use local state only. No requests are sent to an authentication or payment service.
export const roles = {
  contractor: { label: "Contractor", home: "c01", mobile: "mc01" },
  worker: { label: "Worker", home: "w01", mobile: "mw01" },
  client: { label: "Client", home: "d01", mobile: "md01" },
};

export const demoMessages = {
  receipt: "Demo receipt. No transaction was submitted, so there is no live Stellar receipt.",
  payment: "This is a sample payment screen. No funds have moved.",
  attachment: "This attachment is a sample from the design.",
  voice: "This voice note is a sample from the design. No audio was recorded.",
  saved: "Demo update saved for this preview. Nothing was sent.",
};

const storage = window.sessionStorage;
export function readPreference(name, fallback) {
  return storage.getItem(`payshare-demo-${name}`) || fallback;
}

export function savePreference(name, value) {
  storage.setItem(`payshare-demo-${name}`, value);
}
