console.log("[CMOA content.js] Loaded");

// Listen for messages from inject.js (runs in MAIN world via manifest)
window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data.type && (event.data.type === "CMOA_INFO" || event.data.type === "CMOA_CONTENT")) {
        console.log("[CMOA content.js] Received:", event.data.type);
        chrome.runtime.sendMessage(event.data);
    }
});

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read image blob'));
        reader.readAsDataURL(blob);
    });
}

function loadImageElementAsDataUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.referrerPolicy = 'strict-origin-when-cross-origin';

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Failed to convert loaded image to blob'));
                        return;
                    }
                    blobToDataUrl(blob).then(resolve, reject);
                }, 'image/png');
            } catch (error) {
                reject(error);
            }
        };

        img.onerror = () => reject(new Error('Image element load failed'));
        img.src = url;
    });
}

async function fetchImageAsDataUrl(url) {
    const response = await fetch(url, {
        mode: 'cors',
        credentials: 'same-origin',
        referrer: window.location.origin + '/',
        referrerPolicy: 'strict-origin-when-cross-origin',
        headers: {
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
    });
    if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }
    return blobToDataUrl(await response.blob());
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'CMOA_FETCH_IMAGE') return false;

    loadImageElementAsDataUrl(message.url)
        .catch((imageError) => {
            console.warn('[CMOA content.js] Image element path failed, falling back to fetch:', imageError);
            return fetchImageAsDataUrl(message.url);
        })
        .then((dataUrl) => {
            sendResponse({ ok: true, dataUrl });
        })
        .catch((error) => {
            console.error('[CMOA content.js] Reader-page image load failed:', error);
            sendResponse({ ok: false, error: error.message });
        });

    return true;
});
