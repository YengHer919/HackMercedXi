// Content script injected into social media pages to add analysis buttons

console.log("social-media-ai-detector content script loaded.");

function init() {
  // Use a MutationObserver to detect new images loaded dynamically
  const observer = new MutationObserver(handleMutations);
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan
  scanImages();
}

function handleMutations(mutations) {
  let hasImageMutations = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      hasImageMutations = true;
      break;
    }
  }
  if (hasImageMutations) {
    scanImages();
  }
}

function scanImages() {
  // Find images that haven't been processed yet
  const images = document.querySelectorAll('img:not(.df-processed)');
  images.forEach(img => {
    // Mark as processed immediately so we don't handle them multiple times
    img.classList.add('df-processed');

    // Social media images often load dynamically. We add a button if they're large enough.
    if (img.width > 200 && img.height > 200) {
      addOverlayButton(img);
    } else {
      // Sometimes size isn't immediately known. Hook on load.
      img.addEventListener('load', () => {
        if (img.width > 200 && img.height > 200) {
          if (!img.parentNode.querySelector('.df-overlay-btn')) {
            addOverlayButton(img);
          }
        }
      });
    }
  });
}

function addOverlayButton(img) {
  // Create button
  const btn = document.createElement('button');
  btn.innerHTML = `<span class="df-icon">🔍</span>`;
  btn.className = 'df-overlay-btn';

  // Social media images are often in dynamic containers. Appending to parent usually works best
  // if we force the parent to be relatively positioned.
  if (img.parentElement) {
    if (window.getComputedStyle(img.parentElement).position === 'static') {
      img.parentElement.style.position = 'relative';
    }
    img.parentElement.appendChild(btn);
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Hide previous popups
    const existing = document.getElementById('df-results-popup');
    if (existing) existing.remove();

    btn.innerHTML = `<span class="df-icon">⏳</span>`;
    btn.disabled = true;
    btn.classList.add('analyzing');

    // Send to background for analysis
    chrome.runtime.sendMessage({
      action: 'analyzeImage',
      imageUrl: img.src
    }, (response) => {
      btn.disabled = false;
      btn.classList.remove('analyzing');

      if (chrome.runtime.lastError) {
        console.error("Error communicating with background:", chrome.runtime.lastError);
        btn.innerHTML = `<span class="df-icon">❌</span>`;
        showResultsPopup({ success: false, error: "Extension error. Please refresh." }, e.clientX, e.clientY);
        return;
      }

      // Update button text and show result
      if (response && response.success) {
        showResultsPopup(response, e.clientX, e.clientY);
        btn.innerHTML = response.isFake ? '⚠️' : '✅';
        btn.style.backgroundColor = response.isFake ? 'rgba(255, 68, 68, 0.9)' : 'rgba(68, 255, 68, 0.9)';
      } else {
        btn.innerHTML = `<span class="df-icon">❌</span>`;
        showResultsPopup(response, e.clientX, e.clientY);
      }
    });
  });
}

function showResultsPopup(results, x, y) {
  const popup = document.createElement('div');
  popup.id = 'df-results-popup';
  popup.className = 'df-popup df-animate-in';

  // Position near the click
  popup.style.left = `${Math.min(x, window.innerWidth - 320)}px`;
  popup.style.top = `${y + 20}px`;

  let html = `<div class="df-popup-header">AI Content Analysis</div>`;
  html += `<div class="df-popup-body">`;

  if (results && results.success) {
    html += `<div class="df-score-container">`;
    html += `<span class="df-score-label">AI Probability:</span>`;
    html += `<span class="df-score-value ${(results.score > 0.5 ? 'df-high' : 'df-low')}">${(results.score * 100).toFixed(1)}%</span>`;
    html += `</div>`;
    html += `<p class="df-explanation">${results.explanation || "No details provided."}</p>`;
  } else {
    const errorMsg = results && results.error ? results.error : "Failed to analyze image.";
    html += `<div class="df-error-container">`;
    html += `<span class="df-error-icon">⚠️</span>`;
    html += `<p class="df-error-text">${errorMsg}</p>`;
    html += `</div>`;
  }
  html += `</div>`;

  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'Dismiss';
  closeBtn.className = 'df-close-btn';
  closeBtn.addEventListener('click', () => {
    popup.classList.add('df-animate-out');
    setTimeout(() => popup.remove(), 200);
  });

  popup.innerHTML = html;
  popup.appendChild(closeBtn);

  document.body.appendChild(popup);
}

// Start watching for images
init();
