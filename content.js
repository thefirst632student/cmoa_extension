console.log("[CMOA content.js] Loaded");

// Listen for messages from inject.js (runs in MAIN world via manifest)
window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data.type && (event.data.type === "CMOA_INFO" || event.data.type === "CMOA_CONTENT")) {
        console.log("[CMOA content.js] Received:", event.data.type);
        chrome.runtime.sendMessage(event.data);
    }
});
