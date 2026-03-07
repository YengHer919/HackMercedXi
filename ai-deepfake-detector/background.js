// Service worker for AI Deepfake Detector

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeImage') {
    handleAnalyzeImage(request.imageUrl, sendResponse);
    return true; // Indicates we will respond asynchronously
  } else if (request.action === 'captureScreenshot') {
    handleCaptureScreenshot(sendResponse);
    return true;
  }
});

async function handleAnalyzeImage(imageUrl, sendResponse) {
  try {
    console.log("Analyzing image URL via Reality Defender:", imageUrl);
    
    // const rdApiKey = "rd_e4090ad702acaea5_4c68fb69aad1492877059f995de722a4";
    // const rdResponse = await fetch('https://api.realitydefender.com/v1/analyze', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'x-api-key': rdApiKey
    //   },
    //   body: JSON.stringify({ image_url: imageUrl })
    // });
    // const rdData = await rdResponse.json();
    // const isFake = rdData.deepfake_score > 0.5;
    // const score = rdData.deepfake_score;
    
    // Mock values for current demonstration
    const mockDefenderScore = Math.random(); 
    const isFake = mockDefenderScore > 0.5;
    const score = mockDefenderScore;

    console.log("Fetching context via Gemini API for image:", imageUrl);
    
    const geminiApiKey = "AIzaSyB9lEU_2ondw2P6WAal8v0yGAZVKKDH9qI";
    const geminiPrompt = `Analyze this image (AI probability: ${(score*100).toFixed(1)}%). Explain specific visual artifacts or inconsistencies that indicate it is manipulated or synthetic.`;
    
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: geminiPrompt }, { fileData: { fileUri: imageUrl, mimeType: "image/jpeg" } }]
        }]
      })
    });
    const geminiData = await geminiResponse.json();
    const explanation = geminiData.candidates[0].content.parts[0].text;

    // Mock values for current demonstration
    //const explanation = `The image exhibits visual artifacts typical of AI generation. The lighting on the subject's face is inconsistent with the background, and there are distortions around the edges of objects. Score: ${(score * 100).toFixed(2)}% probability of being AI-generated.`;

    // 3. Return results
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
    // Basic screenshot capture for the active tab window
    chrome.tabs.captureVisibleTab(null, {format: 'png'}, (dataUrl) => {
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
