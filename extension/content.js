const BASE = "https://vtopreg.vit.ac.in/tablet/";

// Log to BOTH the page console and the service-worker console (the reliable one:
// chrome://extensions -> Credify -> "service worker").
const log = (msg) => {
  console.log("[credify]", msg);
  chrome.runtime.sendMessage({ log: msg }).catch(() => {});
};

log("loaded: " + location.href);

const notify = async (heading, content) => {
  try {
    await chrome.runtime.sendMessage({ notify: true, heading, content });
  } catch {
    log("notify failed");
  }
};

// CSRF is not enforced for these read endpoints — the site's own
// viewSearchRegistrationOption/getResults/ViewSlotsBack POST here cookie-only.
const post = async (path, params = {}) => {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return new DOMParser().parseFromString(await res.text(), "text/html");
};

const scrapeCourse = (tr) => {
  const cells = tr.children;
  const spans = cells[0].querySelectorAll("span");
  const btn = tr.querySelector("[data-parameter1]");
  return {
    code: (spans[0]?.textContent || "").trim(),
    title: (spans[1]?.textContent || "").trim(),
    type: (spans[2]?.textContent || "").trim(),
    credit: (cells[2]?.textContent || "").trim(),
    registered: (cells[6]?.textContent || "").toLowerCase().includes("register"),
    registerable: !!btn, // has a "Proceed" button = open to register
  };
};

// One processRegistrationOption response inlines every page as #pageDivId1..N.
const scrapeCategory = (doc) =>
  Array.from(doc.querySelectorAll("[id^=pageDivId] tbody tr"))
    .map(scrapeCourse)
    .filter((c) => c.code);

const fetchCatalog = async () => {
  const optionsDoc = await post("viewRegistrationOption");
  const options = Array.from(
    optionsDoc.getElementsByName("registrationOption"),
    (r) => r.value
  );
  const catalog = {};
  for (const opt of options) {
    const doc = await post("processRegistrationOption", {
      registrationOption: opt,
      pageSize: 10,
      page: 1,
      subCourseOption: "",
      flag: 0,
    });
    catalog[opt] = scrapeCategory(doc); // categories that error just yield []
  }
  return catalog;
};

// Pure: returns events without side effects, so it can be unit-checked.
const diffEvents = (oldCat, newCat) => {
  const events = [];
  for (const [opt, courses] of Object.entries(newCat)) {
    const before = Object.fromEntries(
      (oldCat[opt] || []).map((c) => [c.code, c])
    );
    for (const c of courses) {
      const prev = before[c.code];
      if (!prev) events.push({ type: "new", opt, c });
      else if (!prev.registerable && c.registerable)
        events.push({ type: "open", opt, c });
    }
  }
  return events;
};

const sync = async () => {
  // The reg shell always has #mainPageForm; login page and unrelated frames don't.
  if (!document.getElementById("mainPageForm")) {
    log("not the registration page — skipping");
    return;
  }

  log("sync...");
  const catalog = await fetchCatalog();
  const total = Object.values(catalog).reduce((n, a) => n + a.length, 0);

  const { catalog: prev } = await chrome.storage.local.get("catalog");
  if (prev) {
    for (const e of diffEvents(prev, catalog)) {
      if (e.type === "new") {
        notify(`New course in ${e.opt}`, `${e.c.code} - ${e.c.title}`);
        log(`new: ${e.c.code} (${e.opt})`);
      } else {
        notify(`${e.c.code} is now open (${e.opt})`, e.c.title);
        log(`open: ${e.c.code} (${e.opt})`);
      }
    }
  } else {
    log("first run — baseline stored");
  }

  await chrome.storage.local.set({ catalog });
  log(`sync done: ${total} courses / ${Object.keys(catalog).length} categories`);
};

const run = () => sync().catch((e) => log("sync failed: " + (e && e.stack ? e.stack : e)));

setTimeout(run, 2000); // let the SPA settle after load
setInterval(run, 60 * 1000);
