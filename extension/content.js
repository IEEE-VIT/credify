window.onload = () => {
  console.log("hello from content.js");
};

const convertToHtml = (html_content) => {
  const parser = new DOMParser();
  return parser.parseFromString(html_content, "text/html");
};

const makeRequest = (path, custom_params) => {
  let url = new URL(`https://vtopreg.vit.ac.in/adddropnew/${path}`);

  let params = {
    _csrf: document.getElementsByName("_csrf")[0].value,
    ...custom_params,
  };

  url.search = new URLSearchParams(params).toString();

  return new Promise(async (resolve, reject) => {
    fetch(url, { method: "POST" })
      .then((response) => {
        // console.log(response);
        return response.text();
      })
      .then((html_content) => {
        html_content = convertToHtml(html_content);
        resolve(html_content);
      })
      .catch((e) => {
        console.log("could not make a successful request");
        console.log(url);
        console.log(e);
        reject(e);
      });
  });
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
  const courses = Array.from(tbody.children);
  const final_courses = [];

  courses.forEach(async (course) => {
    const course_name = course.children[0].innerText.replace(/(\t|\n)+/g, "");
    let credit_info = course.children[1].innerText.replace(/(\t|\n)+/g, "");
    credit_info = credit_info.split(" ");
    lecture = credit_info[0];
    tutorial = credit_info[1];
    practical = credit_info[2];
    project = credit_info[3];
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
  });

  return final_courses;
};

const scrapeOption = async (option) => {
  const response = await makeRequest("processRegistrationOption", {
    registrationOption: option,
    page: 1,
  });
  const courses = await scrapeCourses(response, 1);

  const pages = response.getElementsByClassName("pageLink");
  let last_page_number = pages[pages.length - 2].innerText
    .replace(/(\t|\n)+/g, "")
    .trim();
  last_page_number = parseInt(last_page_number);

  for (let count = 2; count <= last_page_number; count++) {
    const temp_response = await makeRequest("processRegistrationOption", {
      registrationOption: option,
      page: count,
    });

    const temp_courses = await scrapeCourses(temp_response, count);
    courses.push(temp_courses);
  }
  const final_courses = [];
  courses.forEach((course) => {
    if (Array.isArray(course)) {
      course.forEach((temp_course) => {
        final_courses.push(temp_course);
      });
    } else {
      final_courses.push(course);
    }
  });
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

const checkSimilarity = (options1, options2) => {
  Object.entries(options1).forEach(([key, value]) => {
    if (!options2.hasOwnProperty(key)) {
      console.log(`${key} option was removed`);
    } else {
      const courses1 = value;
      const courses2 = options2[key];

      const course_names1 = courses1.map((course) => {
        return course.course_name;
      });
      const course_names2 = courses2.map((course) => {
        return course.course_name;
      });

      let new_course_names = [];

      if (course_names1.length != course_names2.length) {
        new_course_names = course_names2.filter(
          (course_name) => !course_names1.includes(course_name)
        );
        new_course_names.forEach((course_name) => {
          console.log(`${course_name} was added`);
          console.log(findFromCourseName(courses2, course_name));
        });
      }

      course_names2.forEach((course_name) => {
        if (!new_course_names.includes(course_name)) {
          const course_info1 = findFromCourseName(courses1, course_name);
          const course_info2 = findFromCourseName(courses2, course_name);
          const theory1 = course_info1.theory;
          const theory2 = course_info2.theory;
          const lab1 = course_info1.lab;
          const lab2 = course_info2.lab;
          if (theory1.length != theory2.length) {
            console.log(`Theory slots were added in ${course_name}`);
            theory2.forEach((slot) => {
              if (!findSameSlot(theory1, slot)) {
                console.log(
                  `Slot added - ${slot.slots.join(", ")} and Faculty name - ${
                    slot.faculty
                  }`
                );
              }
            });
          }
          // assumption - only new slots were added and not removed
          for (let count = 0; count < theory1.length; count++) {
            const slot1 = theory1[count];
            const slot2 = theory2[count];
            if (slot2.seats.available > slot1.seats.available) {
              console.log(`Seats are available in ${course_name}`);
              console.log(slot2);
            }
          }
          if (lab1.length != lab2.length) {
            console.log(`Lab slots were added in ${course_name}`);
            lab2.forEach((slot) => {
              if (!findSameSlot(lab1, slot)) {
                console.log(
                  `Slot added - ${slot.slots.join(", ")} and Faculty name - ${
                    slot.faculty
                  }`
                );
              }
            });
          }
          for (let count = 0; count < lab1.length; count++) {
            const slot1 = lab1[count];
            const slot2 = lab2[count];
            if (slot2.seats.available > slot1.seats.available) {
              console.log(`Seats are available in ${course_name}`);
              console.log(slot2);
            }
          }
        }
      });
    }
  });
};

const main = async () => {
  const courses = await findCourses();
  chrome.storage.local.get(["courses"], (response) => {
    old_courses = response.courses;
    if (!old_courses || Object.entries(old_courses).length === 0) {
      console.log("run for the 1st time or old_courses is empty");
    } else {
      console.log("old_courses", old_courses);
      console.log("courses", courses);
      checkSimilarity(old_courses, courses);
    }
  });
  chrome.storage.local.set({ courses }, () => {
    console.log("successfully synced courses");
  });
};

const interval = 1 * 60 * 1000; // 1 minute

setInterval(async () => {
  await main();
}, interval);
