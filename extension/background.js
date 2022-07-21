console.log("hello from background.js");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.notify) {
      const options = {
        type: "basic",
        title: request.heading,
        message: request.content,
        iconUrl: "icons/icon_128.png",
      };

        chrome.notifications.create(options, (id) => {
          console.log(`notification sent - ${id}`);
        });
      
    }
  });