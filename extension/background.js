chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.notify) {
    chrome.notifications.create({
      type: "basic",
      title: request.heading,
      message: request.content,
      iconUrl: "icons/icon_128.png",
    });
    sendResponse({ ok: true });
  } else if (request.log) {
    console.log("[credify]", request.log); // mirror content-script status to SW console
  }
});