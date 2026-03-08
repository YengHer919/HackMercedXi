// Service worker for social-media-ai-detector

//Replace this with Gemini API key
const GEMINI_API_KEY = "API_KEY";
//Replace this with OpenAI API key
const OPENAI_API_KEY = "API_KEY";

let model = "gemini";

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "UPDATE_SETTING") {
    console.log("Background script processing:", request.data);
    model = request.data;
  } else if (request.action === 'analyzeImage' && model === "gemini") {
    console.log("gemini");
    geminiModel(request.imageUrl, sendResponse, false);
    return true; // Indicates we will respond asynchronously
  } else if (request.action === 'analyzeImage' && model === "openai") {
    console.log("openai");
    handleOpenAIAnalysis(request.imageUrl, sendResponse, false);
    return true; // Indicates we will respond asynchronously
  } else if (request.action === 'analyzeVideoFrames') {
    handleAnalyzeVideoFrames(request.frames, sendResponse).catch(err => {
      console.error("Critical error in video analysis:", err);
      sendResponse({ success: false, error: "Internal extension error." });
    });
    return true;
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
        if (!reader.result) {
          reject(new Error("Failed to read blob data"));
          return;
        }
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

async function useFallback(imageData, sendResponse, fallback) {
  if (fallback === "openai") {
    handleOpenAIAnalysis(imageData, sendResponse, true);
  } else if (fallback === "gemini") {
    geminiModel(imageData, sendResponse, true);
  }
}

async function geminiModel(imageUrl, sendResponse, isfallback) {
  let imageData = null;
  let fallback = "openai";

  try {
    console.log("Attempting to analyze image URL:", imageUrl);

    // 1. Get Gemini API Key from storage, fallback to hardcoded
    const storageResult = await chrome.storage.local.get(['geminiApiKey']);
    const apiKey = storageResult.geminiApiKey || GEMINI_API_KEY;

    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
      sendResponse({
        success: false,
        error: "Gemini API Key missing. Please set it in the extension popup."
      });
      return;
    }

    // 2. Fetch image and convert to Base64
    imageData = await getBase64FromUrl(imageUrl);

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
    console.error("Gemini Analysis failed, attempting fallback:", error);
    try {
      await useFallback(imageData, sendResponse, fallback);
    } catch (fallbackError) {
      console.error("Fallback failed:", fallbackError);
      sendResponse({ success: false, error: "Both Gemini and fallback analysis failed." });
    }
  }
}

async function handleOpenAIAnalysis(imageData, sendResponse, isfallback) {
  let fallback = "gemini";
  const apiKey = OPENAI_API_KEY;
  try {

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
  } catch (err) {
    if (isfallback) {
      sendResponse({ success: false, error: "Fallback analysis failed." });
    }
    console.error("OpenAI Analysis failed, attempting backup fallback:", err);
    try {
      await useFallback(imageData, sendResponse, fallback);
    } catch (fallbackError) {
      console.error("Fallback failed:", fallbackError);
      sendResponse({ success: false, error: "Both Gemini and fallback analysis failed." });
    }
  }
}

async function handleAnalyzeVideoFrames(frames, sendResponse) {
  try {
    console.log(`Attempting to analyze ${frames.length} video frames`);

    // 1. Get the Gemini API Key from storage, fallback to hardcoded
    const storageResult = await chrome.storage.local.get(['geminiApiKey']);
    const apiKey = storageResult.geminiApiKey || GEMINI_API_KEY;

    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
      sendResponse({
        success: false,
        error: "Gemini API Key missing. Please set it in the extension popup."
      });
      return;
    }

    // 2. Construct Gemini prompt for video
    const promptText = `
    Analyze these sequential frames extracted from a social media video to determine if the video is likely AI-generated, deepfaked, or heavily manipulated by AI.
    Look for temporal inconsistencies across the frames, morphing artifacts, unnatural lighting changes, or typical AI generation flaws.
    Return ONLY a valid JSON object with exactly these two keys:
    - "probability": A number between 0.0 and 1.0 indicating the likelihood that the video is AI-generated (1.0 = highly likely AI, 0.0 = highly likely real).
    - "explanation": A 2-3 sentence clear string explaining the specific artifacts or temporal inconsistencies (or lack thereof) across the frames.
    Do not include any Markdown wrapping like \`\`\`json. Return raw JSON.
    `;

    // 3. Prepare the parts array containing the prompt and each frame
    const contentsParts = [{ text: promptText }];

    for (const dataUrl of frames) {
      // Format: data:image/jpeg;base64,...
      const parts = dataUrl.split(',');
      const mimeTypeMatch = parts[0].match(/:(.*?);/);
      if (parts.length === 2 && mimeTypeMatch) {
        contentsParts.push({
          inlineData: {
            mimeType: mimeTypeMatch[1],
            data: parts[1]
          }
        });
      }
    }

    // 4. Call Gemini API endpoint
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{
        parts: contentsParts
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
    console.error("Video analysis failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}
