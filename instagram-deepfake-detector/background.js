// Service worker for social-media-ai-detector

let model = "gemini";

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "UPDATE_SETTING") {
    console.log("Background script processing:", request.data);
    model = request.data;
  } else if (request.action === 'analyzeImage' && model === "gemini") {
    geminiModel(request.imageUrl, sendResponse);
    console.log("gemini");
    return true; // Indicates we will respond asynchronously
  } else if (request.action === 'analyzeImage' && model === "openai") {
    handleOpenAIAnalysis(request.imageUrl, sendResponse);
    console.log("openai");
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

async function geminiModel(imageUrl, sendResponse) {
  try {
    console.log("Attempting to analyze image URL:", imageUrl);

    // 1. Use hardcoded Gemini API Key
    const apiKey = GEMINI_API_KEY;

    if (!apiKey || apiKey === "secretkey") {
      sendResponse({
        success: false,
        error: "Gemini API Key missing."
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
    console.error("Gemini Analysis failed, attempting backup fallback:", error);
    try {
      await handleOpenAIAnalysis(imageData, sendResponse);
    } catch (fallbackError) {
      console.error("Fallback failed:", fallbackError);
      sendResponse({ success: false, error: "Both Gemini and fallback analysis failed." });
    }
  }
}


async function handleOpenAIAnalysis(imageData, sendResponse) {
  const apiKey = OPENAI_API_KEY;

  if (!apiKey || apiKey === "secretkey") {
    throw new Error("OpenAI API Key missing");
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


async function modelChange(changeTo) {

}