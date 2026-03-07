// Service worker for social-media-ai-detector

// TODO: Replace this with your actual Gemini API key
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
// TODO: Replace this with your actual OpenAI API key for fallback
const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY_HERE";

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

    // 1. Use hardcoded Gemini API Key
    const apiKey = GEMINI_API_KEY;

    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
      sendResponse({
        success: false,
        error: "Gemini API Key missing. Please hardcode it in background.js."
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
    console.error("Gemini Analysis failed, attempting OpenAI fallback:", error);
    try {
      await handleOpenAIAnalysis(imageData, sendResponse);
    } catch (fallbackError) {
      console.error("OpenAI Fallback failed:", fallbackError);
      sendResponse({ success: false, error: "Both Gemini and OpenAI analysis failed." });
    }
  }
}

async function handleOpenAIAnalysis(imageData, sendResponse) {
  const apiKey = OPENAI_API_KEY;

  if (!apiKey || apiKey === "YOUR_OPENAI_API_KEY_HERE") {
    throw new Error("OpenAI API Key missing for fallback.");
  }

  const endpoint = "https://api.openai.com/v1/chat/completions";
  const promptText = `
    Analyze the provided image to determine if it is likely AI-generated, deepfaked, or heavily manipulated by AI.
    Return ONLY a valid JSON object with exactly these two keys:
    - "probability": A number between 0.0 and 1.0 indicating the likelihood that the image is AI-generated (1.0 = highly likely AI, 0.0 = highly likely real).
    - "explanation": A 2-3 sentence clear string explaining the specific visual artifacts, lighting inconsistencies, or reasons why you gave it that score.
  `;

  // Format data for OpenAI Vision
  const base64ImageUrl = `data:${imageData.mimeType};base64,${imageData.data}`;

  const requestBody = {
    model: "gpt-5-nano",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          {
            type: "image_url",
            image_url: {
              url: base64ImageUrl
            }
          }
        ]
      }
    ],
    max_tokens: 300
  };

  const apiResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!apiResponse.ok) {
    const errData = await apiResponse.json();
    throw new Error(errData.error?.message || `OpenAI API Error: ${apiResponse.status}`);
  }

  const resultData = await apiResponse.json();
  const rawText = resultData.choices[0].message.content;

  try {
    const resultJson = JSON.parse(rawText);
    const score = resultJson.probability || 0;

    sendResponse({
      success: true,
      score: score,
      isFake: score > 0.6,
      explanation: (resultJson.explanation || "No explanation provided.") + " (Used OpenAI Fallback)"
    });
  } catch (parseErr) {
    console.error("Failed to parse OpenAI JSON:", parseErr, rawText);
    throw new Error("Failed to parse OpenAI API response.");
  }
}
