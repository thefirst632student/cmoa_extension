importScripts('core.js');

let capturedInfo = null;
let capturedContent = null;
let capturedCid = null;
let capturedK = null;
let popupPort = null;
let offscreenDocumentCreated = false;

// Listen for popup connection
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'popup') {
        popupPort = port;
        port.onDisconnect.addListener(() => {
            popupPort = null;
        });
    }
});

function sendProgress(current, total, status) {
    if (popupPort) {
        popupPort.postMessage({ type: 'download_progress', current, total, status });
    }
}

function sendComplete() {
    if (popupPort) {
        popupPort.postMessage({ type: 'download_complete' });
    }
}

function sendError(error) {
    if (popupPort) {
        popupPort.postMessage({ type: 'download_error', error });
    }
}

// Setup offscreen document
async function setupOffscreenDocument() {
    if (offscreenDocumentCreated) return;
    
    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['BLOBS'],
            justification: 'Create ZIP file and save using File System Access API'
        });
        offscreenDocumentCreated = true;
    } catch (e) {
        if (!e.message.includes('already exists')) {
            throw e;
        }
        offscreenDocumentCreated = true;
    }
}

// Backup: Capture bibGetCntntInfo via webRequest
chrome.webRequest.onCompleted.addListener(
    async (details) => {
        if (details.url.includes('bibGetCntntInfo.php')) {
            console.log("[webRequest] bibGetCntntInfo detected:", details.url.substring(0, 80));
            
            try {
                const urlObj = new URL(details.url);
                capturedCid = urlObj.searchParams.get("cid");
                capturedK = urlObj.searchParams.get("k");
                console.log("[webRequest] CID:", capturedCid, "K:", capturedK);
            } catch(e) {
                console.error("[webRequest] Failed to parse URL:", e);
            }
        }
    },
    { urls: ["*://www.cmoa.jp/*bibGetCntntInfo*"] }
);

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (details.url.includes('bibGetCntntInfo.php')) {
            console.log("[webRequest] bibGetCntntInfo request:", details.url.substring(0, 80));
            
            try {
                const urlObj = new URL(details.url);
                capturedCid = urlObj.searchParams.get("cid");
                capturedK = urlObj.searchParams.get("k");
            } catch(e) {}
        }
    },
    { urls: ["*://www.cmoa.jp/*"] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CMOA_INFO") {
        console.log("Captured INFO, URL:", message.url);
        capturedInfo = message.data;
        
        try {
            const urlObj = new URL(message.url);
            capturedCid = urlObj.searchParams.get("cid");
            capturedK = urlObj.searchParams.get("k");
            console.log("CID:", capturedCid, "K:", capturedK);
        } catch(e) {
            console.error("Failed to parse URL params. URL was:", message.url, e);
        }

    } else if (message.type === "CMOA_CONTENT") {
        console.log("Captured CONTENT");
        capturedContent = message.data;
    } else if (message.action === "download") {
        handleDownload().then(result => {
            sendResponse(result);
        }).catch(err => {
            sendResponse({ error: err.message });
        });
        return true;
    }
});

async function handleDownload() {
    const missing = [];
    if (!capturedInfo) missing.push("INFO");
    if (!capturedContent) missing.push("CONTENT");
    if (!capturedCid) missing.push("CID");
    if (!capturedK) missing.push("K");
    
    if (missing.length > 0) {
        const errorMsg = `Missing: ${missing.join(", ")}. Refresh the reader page.`;
        sendError(errorMsg);
        return { error: errorMsg };
    }

    console.log("Starting download process...");

    // Decrypt Tables
    const item = capturedInfo.items[0];
    const ptbl = SpeedBinB.decryptKeyTable(capturedCid, capturedK, item.ptbl);
    const ctbl = SpeedBinB.decryptKeyTable(capturedCid, capturedK, item.ctbl);
    
    if (!ptbl || !ctbl) {
        const errorMsg = "Failed to decrypt key tables";
        sendError(errorMsg);
        return { error: errorMsg };
    }
    
    // Parse ttx to find unique images
    const ttx = capturedContent.ttx;
    const seenSrcs = new Set();
    const images = [];
    const tImgMatches = ttx.match(/<t-img\s+[^>]+>/g);
    
    if (tImgMatches) {
        for (const tag of tImgMatches) {
            const srcMatch = tag.match(/src="([^"]+)"/);
            const wMatch = tag.match(/orgwidth="(\d+)"/);
            const hMatch = tag.match(/orgheight="(\d+)"/);
            
            if (srcMatch && wMatch && hMatch) {
                const src = srcMatch[1];
                if (!seenSrcs.has(src)) {
                    seenSrcs.add(src);
                    images.push({
                        src: src,
                        w: parseInt(wMatch[1]),
                        h: parseInt(hMatch[1])
                    });
                }
            }
        }
    }

    console.log(`Found ${images.length} unique images`);
    
    // Base URL for images
    let baseUrl = item.ContentsServer;
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    
    const p = item.p || '';
    
    // Sanitize title for filename (use SubTitle)
    const safeTitle = (item.SubTitle || item.Title || 'manga').replace(/[^\w\s\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf-]/g, '').trim().substring(0, 50);
    
    // Setup offscreen document first
    await setupOffscreenDocument();
    
    // Initialize ZIP in offscreen document
    await chrome.runtime.sendMessage({
        action: 'initZip',
        title: safeTitle,
        total: images.length
    });
    
    // Process images and add to ZIP one by one
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const imgUrl = `${baseUrl}sbcGetImg.php?cid=${encodeURIComponent(capturedCid)}&src=${encodeURIComponent(img.src)}&p=${encodeURIComponent(p)}`;
        
        sendProgress(i + 1, images.length, `Processing ${i + 1}/${images.length}`);
        
        try {
            const resp = await fetch(imgUrl);
            if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
            const blob = await resp.blob();
            const bitmap = await createImageBitmap(blob);
            
            const { keyS, keyH, scramblerType } = SpeedBinB.deriveImageKey(img.src, ptbl, ctbl);
            let coords = [];
            
            if (scramblerType === "Type1") {
                const scrambler = new SpeedBinB.Type1(keyH, keyS);
                coords = scrambler.calculateCoords(bitmap.width, bitmap.height);
            } else if (scramblerType === "Type2") {
                const scrambler = new SpeedBinB.Type2(keyS, keyH);
                coords = scrambler.calculateCoords(bitmap.width, bitmap.height);
            } else {
                coords = [{ xsrc: 0, ysrc: 0, width: bitmap.width, height: bitmap.height, xdest: 0, ydest: 0 }];
            }

            const canvas = new OffscreenCanvas(img.w, img.h);
            const ctx = canvas.getContext('2d');
            
            for (const c of coords) {
                ctx.drawImage(bitmap, c.xsrc, c.ysrc, c.width, c.height, c.xdest, c.ydest, c.width, c.height);
            }
            
            const blobOut = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
            
            // Convert to base64
            const reader = new FileReader();
            const base64 = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blobOut);
            });
            
            // Add to ZIP one by one
            await chrome.runtime.sendMessage({
                action: 'addImage',
                index: i + 1,
                base64: base64
            });
            
        } catch (err) {
            console.error(`Error processing image ${i}:`, err);
        }
    }
    
    // Finalize ZIP and save
    sendProgress(images.length, images.length, 'Saving ZIP file...');
    
    const zipResult = await chrome.runtime.sendMessage({
        action: 'finalizeZip'
    });
    
    if (zipResult.error) {
        sendError(zipResult.error);
        return { error: zipResult.error };
    }
    
    // If fallback to blob URL
    if (zipResult.fallback && zipResult.url) {
        try {
            await chrome.downloads.download({
                url: zipResult.url,
                filename: zipResult.filename,
                saveAs: true
            });
        } catch (downloadErr) {
            await chrome.downloads.download({
                url: zipResult.url,
                filename: zipResult.filename
            });
        }
    }
    
    console.log("Download complete.");
    sendComplete();
    
    return { totalImages: images.length };
}
