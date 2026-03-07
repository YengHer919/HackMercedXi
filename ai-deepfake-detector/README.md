# AI Deepfake Detector

A lightweight Chrome browser extension designed to help users detect AI-generated images and deepfakes on social media platforms like Instagram.

## Features
- **On-Page Image Scanning:** Injects a "Check AI Authenticity" button directly onto Instagram images.
- **Screenshot Capability:** Provides a popup UI to capture the current visible tab and analyze the image.
- **Deepfake Analysis:** Pre-configured architecture to communicate with the Reality Defender API to receive deepfake probability scores.
- **Context via AI:** Pre-configured architecture to request explanations, artifact identification, and context from the Google Gemini API.
- **Modern User Interface:** Sleek, animated popup built with standard HTML, CSS, and JS (Manifest V3).

## Folder Structure
```text
ai-deepfake-detector/
├── manifest.json       # Chrome extension manifest V3
├── popup.html          # HTML structure for the extension popup
├── popup.js            # Logic for capturing screenshots and updating UI
├── styles.css          # Modern, animated styling for popup and overlays
├── content.js          # Injected into Instagram to add image overlays
├── background.js       # Service worker for API requests and screenshots
└── README.md           # This document
```

## Setup Instructions

### 1. Load the Extension Locally in Chrome
1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in your address bar.
3. In the top right corner, turn on **Developer mode**.
4. Click the **Load unpacked** button in the top left.
5. Select the `ai-deepfake-detector` folder (located at `c:\Users\herye\OneDrive\Desktop\HackMercedXI\ai-deepfake-detector`).
6. The extension will appear in your list of extensions. Click the puzzle icon in Chrome's toolbar and "Pin" it for easy access.

### 2. Enabling Actual API Integrations
Currently, `background.js` uses a mock implementation to demonstrate the flow without requiring valid API keys immediately.
To enable the actual Real Defender and Google Gemini APIs:

1. Open `background.js` in a code editor.
2. Locate the `handleAnalyzeImage` function.
3. Uncomment the blocks labeled `--- REALITY DEFENDER API EXAMPLE ---` and `--- GEMINI API EXAMPLE ---`.
4. Replace `"YOUR_REALITY_DEFENDER_API_KEY"` with your valid API key from [Reality Defender](https://www.realitydefender.com/product/realapi).
5. Replace `"YOUR_GEMINI_API_KEY"` with your valid API key from [Google AI Studio](https://aistudio.google.com/).
6. Comment out the mock variables at the bottom of the function.
7. Go back to `chrome://extensions/` and click the refresh icon (⟳) on the "AI Deepfake Detector" card to reload the updated `background.js`.

### 3. Usage
- **Method 1 (Instagram Overlay):** Go to `instagram.com`. The extension will scan for large images and add a "Check AI Authenticity" button over them. Click it to analyze the image directly.
- **Method 2 (Screenshot):** Click the extension icon in your toolbar to open the popup. Click "Capture & Analyze" to take a screenshot of your active tab and run it through the detection pipeline.
