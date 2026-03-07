document.addEventListener('DOMContentLoaded', () => {
    const captureBtn = document.getElementById('capture-btn');
    const loadingDiv = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');
    
    // UI Elements for results
    const scoreCircle = document.getElementById('score-circle');
    const scoreText = document.getElementById('score-text');
    const resultTitle = document.getElementById('result-title');
    const resultBadge = document.getElementById('result-badge');
    const explanationText = document.getElementById('explanation-text');
    
    captureBtn.addEventListener('click', async () => {
        // Hide button, show loading
        captureBtn.parentElement.classList.add('hidden');
        loadingDiv.classList.remove('hidden');
        resultsDiv.classList.add('hidden');

        try {
            // Send message to background script to capture and analyze
            chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success) {
                    showError(chrome.runtime.lastError?.message || response?.error || "Failed to capture");
                    return;
                }

                // Now we have the screenshot dataUrl, send to analysis
                // In a real app we would send this dataUrl to the Reality Defender API.
                // We're simulating this via the background script.
                chrome.runtime.sendMessage({
                    action: 'analyzeImage',
                    imageUrl: response.dataUrl
                }, (analysisResponse) => {
                    loadingDiv.classList.add('hidden');
                    
                    if (chrome.runtime.lastError || !analysisResponse || !analysisResponse.success) {
                        showError("Analysis failed.");
                        return;
                    }

                    showResults(analysisResponse);
                });
            });
        } catch (e) {
            showError("An unexpected error occurred.");
        }
    });

    function showError(msg) {
        loadingDiv.classList.add('hidden');
        captureBtn.parentElement.classList.remove('hidden');
        alert("Error: " + msg);
    }

    function showResults(data) {
        resultsDiv.classList.remove('hidden');
        
        const scorePercentage = Math.round(data.score * 100);
        scoreText.textContent = `${scorePercentage}%`;
        
        // Update circular chart dasharray
        scoreCircle.setAttribute('stroke-dasharray', `${scorePercentage}, 100`);

        // Update styling based on danger/success
        if (data.isFake) {
            scoreCircle.classList.add('danger');
            scoreCircle.classList.remove('success');
            resultBadge.textContent = 'AI Generation Detected';
            resultBadge.className = 'badge danger';
            resultTitle.textContent = 'High Probability';
        } else {
            scoreCircle.classList.add('success');
            scoreCircle.classList.remove('danger');
            resultBadge.textContent = 'Likely Authentic';
            resultBadge.className = 'badge success';
            resultTitle.textContent = 'Low Probability';
        }

        // Set explanation
        explanationText.textContent = data.explanation;
    }
});

// Toggle settings panel
document.getElementById('settings-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('settings-panel').classList.toggle('hidden');
});

// Load saved keys into inputs
chrome.storage.local.get(['geminiApiKey', 'rdApiKey'], (result) => {
    if (result.geminiApiKey) document.getElementById('geminiKeyInput').value = result.geminiApiKey;
    if (result.rdApiKey) document.getElementById('rdKeyInput').value = result.rdApiKey;
});

// Save keys
document.getElementById('saveKeys').addEventListener('click', () => {
    const geminiApiKey = document.getElementById('geminiKeyInput').value.trim();
    const rdApiKey = document.getElementById('rdKeyInput').value.trim();
    chrome.storage.local.set({ geminiApiKey, rdApiKey }, () => {
        const status = document.getElementById('save-status');
        status.textContent = '✓ Keys saved';
        setTimeout(() => status.textContent = '', 2500);
    });
});