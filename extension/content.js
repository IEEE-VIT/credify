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

// ---- course catalog (per category) -----------------------------------------
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
    id: btn ? btn.getAttribute("data-parameter1") : null,
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

// ---- slots + seats (per course) --------------------------------------------
// processCourseRegistration renders the slot-selection page. It's read-only —
// actual registration is a separate endpoint (registerCourse -> processRegisterCourse).
// A permitted course returns <form id="regForm">; a blocked one returns the list.
const scrapeSlots = (doc) => {
  const slots = [];
  for (const radio of doc.querySelectorAll("input[name^=classnbr]")) {
    const tr = radio.closest("tr");
    if (!tr) continue;
    const tds = tr.querySelectorAll("td"); // [slot, venue, faculty, seat-td]
    const seatSpan = radio.closest("td")?.querySelector("span");
    const available = parseInt((seatSpan?.textContent || "").trim(), 10);
    slots.push({
      slot: (tds[0]?.textContent || "").trim(),
      venue: (tds[1]?.textContent || "").trim(),
      faculty: (tds[2]?.textContent || "").trim(),
      available: Number.isNaN(available) ? null : available,
      classId: radio.value, // stable key, e.g. "GEN/VL2026270103582"
      component: radio.name, // classnbr1=theory, classnbr2=lab, classnbr3=embedded
    });
  }
  return slots;
};

// { "OPT|CODE": [slots] }. Skips whole categories that come back "not permitted".
// ponytail: one request per registerable course in permitted categories — the
// volume ceiling. Blocked categories short-circuit after their first probe.
const fetchSlots = async (catalog) => {
  const out = {};
  for (const [opt, courses] of Object.entries(catalog)) {
    let permitted = true;
    for (const c of courses) {
      if (!permitted || !c.registerable || !c.id) continue;
      const doc = await post("processCourseRegistration", {
        courseId: c.id,
        page: 1,
        searchType: 0,
        searchVal: "NONE",
      });
      if (!doc.getElementById("regForm")) {
        permitted = false; // "already earned required credits" wall for this category
        continue;
      }
      out[`${opt}|${c.code}`] = scrapeSlots(doc);
    }
  }
  return out;
};

// ---- diffs (pure) ----------------------------------------------------------
const diffCatalog = (oldCat, newCat) => {
  const events = [];
  for (const [opt, courses] of Object.entries(newCat)) {
    const before = Object.fromEntries((oldCat[opt] || []).map((c) => [c.code, c]));
    for (const c of courses) {
      const prev = before[c.code];
      if (!prev) events.push({ type: "new-course", opt, c });
      else if (!prev.registerable && c.registerable)
        events.push({ type: "course-open", opt, c });
    }
  }
  return events;
};

const slotKey = (s) => s.classId || `${s.slot}|${s.faculty}`;

const diffSlots = (oldSlots, newSlots) => {
  const events = [];
  for (const [key, slots] of Object.entries(newSlots)) {
    const before = Object.fromEntries(
      (oldSlots[key] || []).map((s) => [slotKey(s), s])
    );
    for (const s of slots) {
      const prev = before[slotKey(s)];
      if (!prev) events.push({ type: "slot-added", key, s });
      else if ((prev.available || 0) === 0 && (s.available || 0) > 0)
        events.push({ type: "seats-open", key, s });
    }
  }
  return events;
};

// ---- sync ------------------------------------------------------------------
const sync = async () => {
  // The reg shell always has #mainPageForm; login page and unrelated frames don't.
  if (!document.getElementById("mainPageForm")) {
    log("not the registration page — skipping");
    return;
  }

  log("sync...");
  const catalog = await fetchCatalog();
  const slots = await fetchSlots(catalog);
  const courseCount = Object.values(catalog).reduce((n, a) => n + a.length, 0);
  const slotCount = Object.values(slots).reduce((n, a) => n + a.length, 0);

  const prev = await chrome.storage.local.get(["catalog", "slots"]);
  if (prev.catalog || prev.slots) {
    for (const e of diffCatalog(prev.catalog || {}, catalog)) {
      if (e.type === "new-course") {
        notify(`New course in ${e.opt}`, `${e.c.code} - ${e.c.title}`);
        log(`new-course: ${e.c.code} (${e.opt})`);
      } else {
        notify(`${e.c.code} is now open (${e.opt})`, e.c.title);
        log(`course-open: ${e.c.code} (${e.opt})`);
      }
    }
    for (const e of diffSlots(prev.slots || {}, slots)) {
      const code = e.key.split("|")[1];
      if (e.type === "seats-open") {
        notify(
          `Seats open: ${code}`,
          `${e.s.slot} · ${e.s.faculty} — ${e.s.available} available`
        );
        log(`seats-open: ${code} ${e.s.slot} = ${e.s.available}`);
      } else {
        notify(`New slot: ${code}`, `${e.s.slot} · ${e.s.faculty}`);
        log(`slot-added: ${code} ${e.s.slot}`);
      }
    }
  } else {
    log("first run — baseline stored");
  }

  await chrome.storage.local.set({ catalog, slots });
  log(`sync done: ${courseCount} courses, ${slotCount} slots tracked`);
};

let running = false; // prevent overlapping runs if a sync outlasts the interval
const run = async () => {
  if (running) return;
  running = true;
  try {
    await sync();
  } catch (e) {
    log("sync failed: " + (e && e.stack ? e.stack : e));
  } finally {
    running = false;
  }
};

setTimeout(run, 2000); // let the SPA settle after load
setInterval(run, 60 * 1000);
