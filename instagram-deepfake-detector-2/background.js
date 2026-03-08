// Service worker for Instagram AI Deepfake Detector

// TODO: Replace this with your actual HuggingFace API token if needed
const HF_API_KEY = "nokey";

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeImage') {
    handleAnalyzeImage(request.imageUrl, sendResponse);
    return true; // Indicates we will respond asynchronously
  }
});

// Helper to fetch image and convert to blob
async function getImageBlobFromUrl(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return blob;
  } catch (err) {
    console.error("Failed to fetch image:", err);
    throw new Error("Could not fetch the image for analysis.");
  }
}

async function handleAnalyzeImage(imageUrl, sendResponse) {
  try {
    console.log("Attempting to analyze image URL:", imageUrl);

    const apiKey = HF_API_KEY;

    // Fetch image as blob
    const imageBlob = await getImageBlobFromUrl(imageUrl);

    // Call HuggingFace Inference API endpoint
    const endpoint = `https://router.huggingface.co/hf-inference/models/haywoodsloan/ai-image-detector-dev-deploy`;

    const headers = { "Content-Type": imageBlob.type };
    if (apiKey && apiKey !== "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") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const apiResponse = await fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: imageBlob
    });

    if (!apiResponse.ok) {
      const errData = await apiResponse.json().catch(() => ({}));
      // HF might return loading status (503) "Model is currently loading" which we should optionally handle, but standard error for now
      throw new Error(errData.error || `API Error: ${apiResponse.status}`);
    }

    const hfData = await apiResponse.json();

    // HF Image Classification returns an array: [{ "label": "fake", "score": 0.9 }, ...]
    let resultJson = hfData;
    if (Array.isArray(hfData) && Array.isArray(hfData[0])) {
      resultJson = hfData[0]; // Sometimes it's double wrapped depending on the endpoint
    }

    // Find the label most likely indicating fake/AI
    // The specific model haywoodsloan/ai-image-detector-dev-deploy likely has explicit labels
    const fakeResult = resultJson.find(r =>
      r.label.toLowerCase().includes('fake') ||
      r.label.toLowerCase().includes('ai') ||
      r.label.toLowerCase() === 'artificial'
    );

    let score = 0;
    let isFake = false;
    let explanation = "Prediction: ";

    if (fakeResult) {
      score = fakeResult.score;
      isFake = score > 0.5;
      explanation += `${Math.round(score * 100)}% likely AI/Fake (${fakeResult.label}).`;
    } else if (resultJson.length > 0) {
      const topResult = resultJson[0];
      score = topResult.score;
      isFake = topResult.label.toLowerCase().includes('fake') || topResult.label.toLowerCase().includes('ai');
      explanation += `Top label: ${topResult.label} (${Math.round(score * 100)}%).`;

      // If the top label is 'real' or similar, probability of being fake is 1 - score.
      if (topResult.label.toLowerCase().includes('real') || topResult.label.toLowerCase().includes('human') || topResult.label.toLowerCase().includes('authentic')) {
        score = 1 - score;
      }
    } else {
      explanation = "No predictions returned from the Hugging Face model.";
    }

    sendResponse({
      success: true,
      score: score,
      isFake: isFake || score > 0.5,
      explanation: explanation
    });

  } catch (error) {
    console.error("Analysis failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}
