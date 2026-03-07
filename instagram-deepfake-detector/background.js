// Service worker for Instagram AI Deepfake Detector

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeImage') {
    handleAnalyzeImage(request.imageUrl, sendResponse);
    return true; // Indicates we will respond asynchronously
  }
});

// Helper to fetch image and convert to base64
async function getBase64FromUrl(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // reader.result contains the base64 string including the data: URL scheme
        const base64data = reader.result.split(',')[1];
        resolve({
          mimeType: blob.type,
          data: base64data
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Failed to fetch image:", err);
    throw new Error("Could not fetch the image for analysis.");
  }
}

async function handleAnalyzeImage(imageUrl, sendResponse) {
  try {
    console.log("Attempting to analyze image URL:", imageUrl);

    // 1. Get the Gemini API Key from storage
    const storageResult = await chrome.storage.local.get(['geminiApiKey']);
    const apiKey = storageResult.geminiApiKey;

    if (!apiKey) {
      sendResponse({
        success: false,
        error: "Gemini API Key missing. Please set it in the extension popup."
      });
      return;
    }

    // 2. Fetch image and convert to Base64
    const imageData = await getBase64FromUrl(imageUrl);

    // 3. Construct Gemini prompt
    const promptText = `
    Analyze the provided image to determine if it is likely AI-generated, deepfaked, or heavily manipulated by AI.
    Return ONLY a valid JSON object with exactly these two keys:
    - "probability": A number between 0.0 and 1.0 indicating the likelihood that the image is AI-generated (1.0 = highly likely AI, 0.0 = highly likely real).
    - "explanation": A 2-3 sentence clear string explaining the specific visual artifacts, lighting inconsistencies, or reasons why you gave it that score.
    Do not include any Markdown wrapping like \`\`\`json. Return raw JSON.
    `;

    // 4. Call Gemini API endpoint
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const apiResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!apiResponse.ok) {
      const errData = await apiResponse.json();
      throw new Error(errData.error?.message || `API Error: ${apiResponse.status}`);
    }

    const geminiData = await apiResponse.json();

    // 5. Parse response
    let rawText = geminiData.candidates[0].content.parts[0].text;

    try {
      const resultJson = JSON.parse(rawText);
      const score = resultJson.probability || 0;

      sendResponse({
        success: true,
        score: score,
        isFake: score > 0.6,
        explanation: resultJson.explanation || "No explanation provided."
      });
    } catch (parseErr) {
      console.error("Failed to parse Gemini JSON:", parseErr, rawText);
      sendResponse({
        success: false,
        error: "Failed to parse API response."
      });
    }

  } catch (error) {
    console.error("Analysis failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}
