console.log("[credify] content script loaded:", location.href);

const convertToHtml = (html_content) => {
  const parser = new DOMParser();
  return parser.parseFromString(html_content, "text/html");
};

const sendNotification = async (heading, content) => {
  try {
    await chrome.runtime.sendMessage({ notify: true, heading, content });
    console.log("message sent to background.js");
  } catch {
    console.log("failed to send message to background.js");
  }
};

// Tablet SPA has no `_csrf` hidden input. The token lives in data-csrfname/
// data-csrfvalue attributes on buttons inside AJAX fragments (see the page's own
// viewRegistrationOption/callViewSlots). Grab it from the first fragment each cycle.
let csrf = null;

const getCsrf = (doc) => {
  const el = doc.querySelector("[data-csrfname]");
  return el
    ? {
        name: el.getAttribute("data-csrfname"),
        value: el.getAttribute("data-csrfvalue"),
      }
    : null;
};

const makeRequest = async (path, custom_params = {}) => {
  const url = `https://vtopreg.vit.ac.in/tablet/${path}`;
  const params = { ...custom_params };
  if (csrf) params[csrf.name] = csrf.value;
  const body = new URLSearchParams(params).toString();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await response.text();
    return convertToHtml(text);
  } catch (e) {
    await sendNotification(
      "Could not fetch courses :(",
      "Please logout and login to resume the extension :) Your current session might have expired"
    );
    console.log("could not make a successful request");
    console.log(url);
    console.log(e);
    throw e;
  }
};

const scrapeSlot = (slot) => {
  let slot_names = slot.children[0].innerText.replace(/(\t|\n)+/g, "").trim();
  slot_names = slot_names.split("+");
  const venue = slot.children[1].innerText.replace(/(\t|\n)+/g, "").trim();
  const faculty = slot.children[2].innerText.replace(/(\t|\n)+/g, "").trim();
  let clashed = slot.children[3].innerText.toLowerCase();
  clashed = clashed.includes("clashed") || clashed.includes("similar");
  const total = parseInt(
    slot.children[4].innerText.replace(/(\t|\n)+/g, "").trim()
  );
  const alloted = parseInt(
    slot.children[5].innerText.replace(/(\t|\n)+/g, "").trim()
  );
  const available = parseInt(
    slot.children[6].innerText.replace(/(\t|\n)+/g, "").trim()
  );

  const seats = {
    total,
    alloted,
    available,
  };
  return { slots: slot_names, venue, faculty, clashed, seats };
};

const findCourseInfo = (document) => {
  const theory_slots = [];
  const lab_slots = [];

  const thead = document.getElementsByTagName("thead")[1];

  const slots = Array.from(thead.children).slice(2);

  for (let count = 0; count < slots.length; count++) {
    if (slots[count].children[0].innerText.toLowerCase().includes("project")) {
      break;
    }
    if (slots[count].children[0].innerText.toLowerCase().includes("lab")) {
      for (let index = count + 1; index < slots.length; index++) {
        if (
          slots[index].children[0].innerText.toLowerCase().includes("project")
        ) {
          break;
        }
        const slot_info = scrapeSlot(slots[index]);
        lab_slots.push(slot_info);
      }
      break;
    }
    const slot_info = scrapeSlot(slots[count]);
    theory_slots.push(slot_info);
  }

  return { theory: theory_slots, lab: lab_slots };
};

const scrapeCourses = async (document, page) => {
  const tbody = document.querySelector(`#pageDivId${page} tbody`);
  if (!tbody) return []; // ponytail: fragment DOM unverified; fail soft instead of throwing
  const courses = Array.from(tbody.children);
  const final_courses = [];

  for (let count = 0; count < courses.length; count++) {
    const course = courses[count];
    const course_name = course.children[0].innerText.replace(/(\t|\n)+/g, "");
    let credit_info = course.children[1].innerText.replace(/(\t|\n)+/g, "");
    const parts = credit_info.split(" ");
    const [lecture, tutorial, practical, project] = parts;
    credit_info = {
      lecture,
      tutorial,
      practical,
      project,
    };
    const credits = course.children[2].innerText.replace(/(\t|\n)+/g, "");
    const pre_requisite = course.children[3].innerText.replace(/(\t|\n)+/g, "");
    const done =
      course.children[6].innerText.replace(/(\t|\n)+/g, "") === "-"
        ? false
        : true;
    const course_id =
      course.children[7].children[0].getAttribute("data-parameter1");

    const temp_html = await makeRequest("processViewSlots", {
      courseId: course_id,
      page: "",
      searchType: "",
      searchVal: "",
    });

    const course_info = findCourseInfo(temp_html);

    final_courses.push({
      course_name,
      credit_info,
      credits,
      pre_requisite,
      done,
      course_id,
      course_info,
    });
  }

  return final_courses;
};

const scrapeOption = async (option) => {
  const response = await makeRequest("processRegistrationOption", {
    registrationOption: option,
    pageSize: 10,
    page: 1,
    subCourseOption: "",
    flag: 0,
  });

  // One response holds all pages as #pageDivId1..N divs (the SPA only toggles their
  // visibility). Scrape each present div instead of re-fetching per page number.
  const page_divs = response.querySelectorAll("[id^=pageDivId]");
  const pages = page_divs.length
    ? Array.from(page_divs, (div) => div.id.replace("pageDivId", ""))
    : [1];

  const final_courses = [];
  for (const page of pages) {
    final_courses.push(...(await scrapeCourses(response, page)));
  }
  return final_courses;
};

const findCourseOptions = (document) => {
  const inputs = document.getElementsByName("registrationOption");
  const options = [];
  Array.from(inputs)
    .slice(0, inputs.length - 2)
    .forEach((option) => {
      options.push(option.value);
    });
  return options;
};

const findCourses = async () => {
  const options_html = await makeRequest("viewRegistrationOption");
  csrf = getCsrf(options_html); // token comes from the fragment, not the shell page
  const options = findCourseOptions(options_html);
  const courses = {};
  for (let count = 0; count < options.length; count++) {
    const option = options[count];
    courses[option] = await scrapeOption(option);
  }
  return courses;
};

const findFromCourseName = (courses, course_name) => {
  for (let count = 0; count < courses.length; count++) {
    if (courses[count].course_name === course_name) {
      return courses[count].course_info;
    }
  }
};

const findSameSlot = (slots, slot) => {
  for (let count = 0; count < slots.length; count++) {
    const temp_slot = slots[count];
    // check temp_slot === slot
    if (slot.faculty === temp_slot.faculty) {
      const slots1 = temp_slot.slots;
      const slots2 = slot.slots;

      if (
        slots1.filter((slot_name) => !slots2.includes(slot_name)).length ===
          0 && // in 1 but not in 2
        slots2.filter((slot_name) => !slots1.includes(slot_name)).length === 0 // in 2 but not in 1
      ) {
        return true;
      }
    }
  }
  return false;
};

const checkAddedSlots = (slots1, slots2, course_name, cat, slot_type) => {
  if (!(slots1 && slots2)) {
    return;
  }
  if (slots1.length != slots2.length) {
    console.log(`${slot_type} slots were added in ${course_name} (${cat})`);
    slots2.forEach((slot) => {
      if (!findSameSlot(slots1, slot)) {
        sendNotification(
          `${slot_type} slots were added in ${course_name} (${cat})`,
          `Slot added - ${slot.slots.join("+")} and Faculty name - ${
            slot.faculty
          }`
        );
        console.log(
          `Slot added - ${slot.slots.join("+")} and Faculty name - ${
            slot.faculty
          }`
        );
      }
    });
  }

  for (let count = 0; count < slots1.length; count++) {
    const slot1 = slots1[count];
    const slot2 = slots2[count];
    if (
      slot1.seats.available === 0 &&
      slot2.seats.available > 0
      // slot2.seats.available > slot1.seats.available
    ) {
      sendNotification(
        `Seats are available in ${course_name} (${cat})`,
        `Slot - ${slot2.slots.join("+")} and Faculty name - ${slot2.faculty}`
      );
      console.log(`Seats are available in ${course_name} (${cat})`);
      console.log(slot2);
    }
  }
};

const checkSimilarity = (options1, options2) => {
  Object.entries(options1).forEach(([key, value]) => {
    if (!Object.hasOwn(options2, key)) {
      sendNotification(
        `${key} option was removed`,
        "The extension is under development, and thus, may be a bug. Let us know of any issues that you encounter. We would be more than happy to help :)"
      );
      console.log(`${key} option was removed`);
    } else {
      const courses1 = value;
      const courses2 = options2[key];

      const course_names1 = courses1.map((course) => course.course_name);
      const course_names2 = courses2.map((course) => course.course_name);

      let unmatched_course_names = [];

      if (course_names1.length != course_names2.length) {
        unmatched_course_names.push(
          ...course_names2.filter(
            (course_name) => !course_names1.includes(course_name)
          ),
          ...course_names1.filter(
            (course_name) => !course_names2.includes(course_name)
          )
        );
      }

      course_names2.forEach((course_name) => {
        if (!unmatched_course_names.includes(course_name)) {
          const course_info1 = findFromCourseName(courses1, course_name);
          const course_info2 = findFromCourseName(courses2, course_name);
          const theory1 = course_info1.theory;
          const theory2 = course_info2.theory;
          const lab1 = course_info1.lab;
          const lab2 = course_info2.lab;

          checkAddedSlots(theory1, theory2, course_name, key, "Theory");
          checkAddedSlots(lab1, lab2, course_name, key, "Lab");
        }
      });
    }
  });
};

const convertToNames = (options) => {
  const course_names = [];
  Object.entries(options).forEach(([option, courses]) => {
    course_names.push(...courses.map((course) => course.course_name));
  });
  return course_names;
};

const findCat = (options, course_name) => {
  const entries = Object.entries(options);
  for (let i = 0; i < entries.length; i++) {
    const cat = entries[i][0];
    const courses = entries[i][1];
    for (let j = 0; j < courses.length; j++) {
      if (courses[j].course_name === course_name) {
        return { cat, course: courses[j] };
      }
    }
  }
};

const main = async () => {
  const courses = await findCourses();
  const course_names = convertToNames(courses);

  const response = await chrome.storage.local.get(["courses", "course_names"]);
  const old_courses = response.courses;
  const old_course_names = response.course_names;

  if (!old_courses || Object.entries(old_courses).length === 0) {
    console.log("run for the 1st time or old_courses is empty");
  } else {
    checkSimilarity(old_courses, courses);
  }

  if (old_course_names) {
    const new_course_names = course_names.filter(
      (course_name) => !old_course_names.includes(course_name)
    );
    for (const course_name of new_course_names) {
      const course = findCat(courses, course_name);
      if (course) {
        await sendNotification(`${course_name} has been added in ${course.cat}`);
        console.log(`${course_name} has been added in ${course.cat}`);
        console.log(course);
      }
    }
  }

  await chrome.storage.local.set({ courses, course_names });
  console.log("successfully synced courses");
};

const interval = 1 * 60 * 1000; // 1 minute

const run = async () => {
  if (document.getElementById("username")) {
    console.log("[credify] login page — waiting for sign-in, skipping sync");
    return; // don't fire requests while user is logging in
  }
  console.log("[credify] sync starting...");
  try {
    await main();
    console.log("[credify] sync done ✓");
  } catch (e) {
    console.error("[credify] sync failed ✗", e);
  }
};

setTimeout(run, 2000); // let the page/login settle before first attempt
setInterval(run, interval);
