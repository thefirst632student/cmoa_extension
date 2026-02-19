# CMOA Downloader - Chrome Extension

A Chrome extension to download manga from CMOA (cmoa.jp) as a ZIP file.

## Installation

### Step 1: Download the Extension
1. Download the `cmoa_extension` folder to your machine
2. Extract it if needed

### Step 2: Install into Chrome
1. Open Chrome and go to: `chrome://extensions/`
2. Enable **Developer mode** (top-right corner)
3. Click **Load unpacked**
4. Select the `cmoa_extension` folder

### Step 3: Usage
1. Go to a manga page on CMOA (e.g., `https://www.cmoa.jp/title/xxxxx`)
2. Open the reader
3. Click the extension icon in the Chrome toolbar
4. Click **Download as ZIP**
5. Choose where to save the ZIP file

---

## Features

- Download all manga images from CMOA
- Automatically decrypt and merge images (descrambling)
- Package everything into a ZIP file
- Show download progress in the popup

---

## Differences vs. pyspeedbinb

| Item | This extension | pyspeedbinb |
|------|----------------|------------|
| **Environment** | Chrome Extension (browser) | Python script (terminal) |
| **Interface** | GUI with popup, progress bar | CLI only |
| **Setup** | No Python required; install directly into Chrome | Requires Python and dependencies |
| **Image processing** | OffscreenCanvas, JSZip | Pillow (PIL) |
| **Storage** | File System Access API (lets you choose save location) | Saves to the current directory |
| **Speed** | Sequential processing, one image at a time | Can batch process |
| **Latency** | Requires reloading the page after installing the extension | Run directly |

### Technical details

1. **Key Table Decryption**
   - pyspeedbinb: Uses `ContentID` from the response to decrypt
   - This extension: Uses `cid` from the URL parameter (`req_cid`) — this is an important bug fix

2. **Type2 Scrambler**
   - pyspeedbinb: Notes that keyH/keyS need to be swapped
   - This extension: Implements the swap correctly

3. **Image URL Format**
   - pyspeedbinb: Direct image URL
   - This extension: Uses `sbcGetImg.php?cid=...&src=...&p=...`

4. **Deduplication**
   - pyspeedbinb: None
   - This extension: Automatically removes duplicate images (ttx has the same `src` twice)

---

## Troubleshooting

### "Missing: INFO, CONTENT..."
- Reload the manga reader page after installing/reloading the extension
- Make sure you are on the reader page (`/bib/speedreader/...`)

### "Failed to decrypt key tables"
- It may be because cid/k is incorrect; try reloading the page

### The extension doesn’t work
1. Verify the extension is enabled in `chrome://extensions/`
2. Check the Service Worker console (click "Service Worker" on the extensions page)
3. Reload the extension and refresh the manga page

---

## File Structure

```
cmoa_extension/
├── manifest.json      # Extension config (Manifest V3)
├── background.js      # Service worker - handles downloading
├── content.js         # Content script - receives messages from the page
├── inject.js          # Injected script - intercepts fetch/XHR
├── core.js            # SpeedBinB decryption logic
├── popup.html         # Popup UI
├── popup.js           # Popup logic
├── offscreen.html     # Offscreen document for ZIP
├── offscreen.js       # ZIP creation + File System Access
└── jszip.min.js       # JSZip library
```

---

## Credit

- **SpeedBinB decryption logic**: Converted from the [pyspeedbinb](https://github.com/suwatchai-uwm/pyspeedbinb) Python library
- **Code conversion & debugging**: GLM 5 (Zhipu AI)
- **Original algorithm**: Based on reverse engineering of the SpeedBinB reader JavaScript

---

## License

This project is for educational purposes only. Use responsibly and respect copyright laws.

---

## Disclaimer

This extension is for educational purposes only. Users are responsible for complying with CMOA’s terms of service and copyright laws.
