importScripts('core.js');

let capturedInfo = null;
let capturedContent = null;
let capturedContentUrl = null;
let capturedContentParams = {};
let capturedReaderParams = {};
let capturedImageParams = {};
let capturedCid = null;
let capturedK = null;
let capturedTabId = null;
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

function parseQueryParams(url) {
    const params = {};
    try {
        const urlObj = new URL(url);
        for (const [name, value] of urlObj.searchParams.entries()) {
            if (value !== '') params[name] = value;
        }
    } catch (e) {
        console.warn('Failed to parse query params:', url, e);
    }
    return params;
}

function mergeReaderParams(target, ...sources) {
    for (const source of sources) {
        if (!source) continue;
        for (const name of ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9']) {
            if (source[name] && !target[name]) target[name] = source[name];
        }
    }
}

function deriveQualityParam(content) {
    // Mirrors SpeedBinb getImageUrl(): for non-singlequality content, default reader
    // mode sets q=1 unless high-quality mode is explicitly enabled by the page.
    if (capturedImageParams.q) return capturedImageParams.q;
    if (content && content.imageClass === 'singlequality') return '';
    return '1';
}

function resolveImageParams(item, content) {
    const params = {};

    // Prefer parameters that the real page already generated for sbcGetCntnt.php
    // or sbcGetImg.php. Fallbacks come from captured JSON fields, not sample HAR values.
    params.p = capturedContentParams.p || capturedImageParams.p || item.p || '';
    params.vm = capturedContentParams.vm || capturedImageParams.vm || item.viewmode || item.ViewMode || '';
    params.dmytime = capturedContentParams.dmytime || capturedImageParams.dmytime || (content && content.ContentDate) || '';
    params.q = deriveQualityParam(content);

    mergeReaderParams(params, capturedContentParams, capturedImageParams, capturedReaderParams);
    return params;
}

function buildImageUrl(baseUrl, cid, src, params) {
    const url = new URL('sbcGetImg.php', baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
    url.searchParams.set('cid', cid);
    url.searchParams.set('src', src);

    if (params.p) url.searchParams.set('p', params.p);
    if (params.q) url.searchParams.set('q', params.q);
    if (params.vm) url.searchParams.set('vm', params.vm);
    if (params.dmytime) url.searchParams.set('dmytime', params.dmytime);
    for (const name of ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9']) {
        if (params[name]) url.searchParams.set(name, params[name]);
    }
    return url.toString();
}

function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mimeMatch = /^data:([^;]+);base64$/.exec(parts[0]);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(parts[1] || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

async function fetchImageViaReaderPage(imgUrl) {
    if (!capturedTabId) {
        throw new Error('Reader tab is not known. Refresh the reader page and try again.');
    }

    const response = await chrome.tabs.sendMessage(capturedTabId, {
        type: 'CMOA_FETCH_IMAGE',
        url: imgUrl
    });

    if (!response || !response.ok) {
        throw new Error((response && response.error) || 'Reader-page fetch failed');
    }

    return dataUrlToBlob(response.dataUrl);
}


function rememberReaderTab(details) {
    if (details && details.tabId !== undefined && details.tabId >= 0) {
        capturedTabId = details.tabId;
    }
}

function captureReaderParamsFromUrl(url) {
    const params = parseQueryParams(url);
    mergeReaderParams(capturedReaderParams, params);
}

function captureImageParamsFromUrl(url) {
    const params = parseQueryParams(url);
    const next = {};
    for (const name of ['p', 'q', 'vm', 'dmytime', 'u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9']) {
        if (params[name]) next[name] = params[name];
    }
    if (Object.keys(next).length > 0) {
        capturedImageParams = { ...capturedImageParams, ...next };
        console.log('[webRequest] Captured real image params:', capturedImageParams);
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
        rememberReaderTab(details);
        if (details.url.includes('/bib/speedreader/') || details.url.includes('/bib/speedbinb/')) {
            captureReaderParamsFromUrl(details.url);
        }
        if (details.url.includes('bibGetCntntInfo.php')) {
            console.log("[webRequest] bibGetCntntInfo request:", details.url.substring(0, 80));
            
            try {
                const urlObj = new URL(details.url);
                capturedCid = urlObj.searchParams.get("cid");
                capturedK = urlObj.searchParams.get("k");
                captureReaderParamsFromUrl(details.url);
            } catch(e) {}
        }
    },
    { urls: ["*://www.cmoa.jp/*"] }
);

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        // Capture image parameters only from the reader page, not from extension-origin
        // retries. These are hints generated by the site's own SpeedBinb runtime.
        if (details.initiator && details.initiator.startsWith('chrome-extension://')) return;
        if (capturedTabId && details.tabId >= 0 && details.tabId !== capturedTabId) return;
        rememberReaderTab(details);
        captureImageParamsFromUrl(details.url);
    },
    { urls: ["*://*.akamaized.net/*sbcGetImg.php*"] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender && sender.tab && sender.tab.id !== undefined) {
        capturedTabId = sender.tab.id;
        if (sender.tab.url) captureReaderParamsFromUrl(sender.tab.url);
    }

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
        console.log("Captured CONTENT, URL:", message.url);
        capturedContent = message.data;
        capturedContentUrl = message.url;
        capturedContentParams = parseQueryParams(message.url);
        console.log("Content params:", capturedContentParams);
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
    if (!capturedTabId) missing.push("READER TAB");
    
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
    
    const imageParams = resolveImageParams(item, capturedContent);
    const missingImageParams = [];
    if (!imageParams.p) missingImageParams.push('p');
    if (!imageParams.vm) missingImageParams.push('vm');
    if (!imageParams.dmytime) missingImageParams.push('dmytime/ContentDate');
    if (missingImageParams.length > 0) {
        const errorMsg = `Missing image request params: ${missingImageParams.join(', ')}. Refresh the reader page so sbcGetCntnt.php is captured.`;
        sendError(errorMsg);
        return { error: errorMsg };
    }
    console.log('Resolved image params:', imageParams);
    
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
        const imgUrl = buildImageUrl(baseUrl, capturedCid, img.src, imageParams);
        
        sendProgress(i + 1, images.length, `Processing ${i + 1}/${images.length}`);
        
        try {
            // Load through the original reader tab instead of the extension service worker.
            // The content script uses an Image element first, matching the page request shape.
            const blob = await fetchImageViaReaderPage(imgUrl);
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
