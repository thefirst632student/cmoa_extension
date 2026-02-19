let downloading = false;
let port = null;

// Connect to background script
function connectPort() {
    port = chrome.runtime.connect({ name: 'popup' });
    port.onMessage.addListener((message) => {
        handleProgress(message);
    });
    port.onDisconnect.addListener(() => {
        port = null;
    });
}

function handleProgress(message) {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const status = document.getElementById('status');
    const btn = document.getElementById('download');
    
    if (message.type === 'download_progress') {
        const percent = Math.round((message.current / message.total) * 100);
        progressFill.style.width = percent + '%';
        progressText.textContent = `${message.current} / ${message.total}`;
        if (message.status) {
            status.textContent = message.status;
        }
    } else if (message.type === 'download_complete') {
        status.textContent = 'Download complete!';
        progressFill.style.width = '100%';
        btn.disabled = false;
        btn.textContent = 'Download as ZIP';
        downloading = false;
    } else if (message.type === 'download_error') {
        status.textContent = 'Error: ' + message.error;
        btn.disabled = false;
        btn.textContent = 'Download as ZIP';
        downloading = false;
    }
}

document.getElementById('download').addEventListener('click', async () => {
    if (downloading) return;
    
    downloading = true;
    const btn = document.getElementById('download');
    const status = document.getElementById('status');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    btn.disabled = true;
    btn.textContent = 'Downloading...';
    status.textContent = 'Starting...';
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '0 / 0';
    
    // Connect port for progress updates
    connectPort();
    
    try {
        const response = await chrome.runtime.sendMessage({ action: "download" });
        
        if (response && response.error) {
            status.textContent = 'Error: ' + response.error;
            btn.disabled = false;
            btn.textContent = 'Download as ZIP';
            downloading = false;
        } else if (response && response.totalImages) {
            status.textContent = `Processing ${response.totalImages} images...`;
        }
    } catch (e) {
        status.textContent = 'Error: ' + e.message;
        btn.disabled = false;
        btn.textContent = 'Download as ZIP';
        downloading = false;
    }
});