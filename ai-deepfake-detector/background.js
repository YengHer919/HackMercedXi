// Service worker for AI Deepfake Detector

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeImage') {
    handleAnalyzeImage(request.imageUrl, sendResponse);
    return true;
  } else if (request.action === 'captureScreenshot') {
    handleCaptureScreenshot(sendResponse);
    return true;
  }
});

async function handleAnalyzeImage(imageUrl, sendResponse) {
  try {
    // 1. Load both API keys securely from storage
    const storageResult = await chrome.storage.local.get(['geminiApiKey', 'rdApiKey']);
    const geminiApiKey = storageResult.geminiApiKey;
    const rdApiKey = storageResult.rdApiKey;

    if (!geminiApiKey) {
      sendResponse({ success: false, error: "Gemini API key missing. Please set it in the extension popup." });
      return;
    }

    console.log("Analyzing image URL via Reality Defender:", imageUrl);

    // 2. Reality Defender (uncomment when ready)
    // if (!rdApiKey) {
    //   sendResponse({ success: false, error: "Reality Defender API key missing." });
    //   return;
    // }
    // const rdResponse = await fetch('https://api.realitydefender.com/v1/analyze', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', 'x-api-key': rdApiKey },
    //   body: JSON.stringify({ image_url: imageUrl })
    // });
    // const rdData = await rdResponse.json();
    // const score = rdData.deepfake_score;
    // const isFake = score > 0.5;

    // Mock score (remove when Reality Defender is active)
    const score = Math.random();
    const isFake = score > 0.5;

    console.log("Fetching context via Gemini API for image:", imageUrl);

    const geminiPrompt = `Analyze this image (AI probability: ${(score * 100).toFixed(1)}%). Explain specific visual artifacts or inconsistencies that indicate if it is real or not.`;

    // 3. Convert image to base64
    let base64Image;
    if (imageUrl.startsWith('data:')) {
      base64Image = imageUrl.split(',')[1];
    } else {
      const imageResponse = await fetch(imageUrl);
      const arrayBuffer = await imageResponse.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      base64Image = btoa(binary);
    }

    // 4. Call Gemini
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: geminiPrompt },
              { inlineData: { mimeType: "image/jpeg", data: base64Image } }
            ]
          }]
        })
      }
    );

const geminiData = await geminiResponse.json();
console.log("Gemini response:", JSON.stringify(geminiData));

// Check for API-level errors before parsing
if (geminiData.error) {
  throw new Error(`Gemini API error: ${geminiData.error.message}`);
}

const explanation = geminiData.candidates[0].content.parts[0].text;
    sendResponse({
      success: true,
      score: score,
      isFake: isFake,
      explanation: explanation,
      sources: ["https://example.com/source1", "https://example.com/source2"]
    });

  } catch (error) {
    console.error("Analysis failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCaptureScreenshot(sendResponse) {
  try {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, dataUrl: dataUrl });
      }
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}