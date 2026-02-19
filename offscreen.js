// Offscreen document for ZIP creation with File System Access API
let zip = null;
let imgFolder = null;
let safeTitle = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'initZip') {
        initZip(message.title);
        sendResponse({ success: true });
        return false;
    } else if (message.action === 'addImage') {
        addImage(message.index, message.base64);
        sendResponse({ success: true });
        return false;
    } else if (message.action === 'finalizeZip') {
        finalizeZip().then(sendResponse).catch(err => {
            sendResponse({ error: err.message });
        });
        return true;
    }
});

function initZip(title) {
    zip = new JSZip();
    imgFolder = zip.folder(title);
    safeTitle = title;
}

function addImage(index, base64) {
    if (!imgFolder) return;
    const filename = String(index).padStart(3, '0') + '.jpg';
    imgFolder.file(filename, base64, { base64: true });
}

async function finalizeZip() {
    if (!zip) {
        return { error: 'ZIP not initialized' };
    }
    
    const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });
    
    // Use File System Access API to save
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: (safeTitle || 'manga') + '.zip',
            types: [{
                description: 'ZIP Archive',
                accept: { 'application/zip': ['.zip'] }
            }]
        });
        
        const writable = await handle.createWritable();
        await writable.write(zipBlob);
        await writable.close();
        
        return { success: true };
    } catch (e) {
        if (e.name === 'AbortError') {
            return { error: 'Cancelled by user' };
        }
        // Fallback to blob URL download
        const url = URL.createObjectURL(zipBlob);
        return { url, filename: (safeTitle || 'manga') + '.zip', fallback: true };
    }
}
