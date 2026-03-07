// Content script injected into social media pages to add analysis buttons

console.log("social-media-ai-detector content script loaded.");

function init() {
  // Use a MutationObserver to detect new images/videos loaded dynamically
  const observer = new MutationObserver(handleMutations);
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan
  scanMedia();
}

function handleMutations(mutations) {
  let hasMediaMutations = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      hasMediaMutations = true;
      break;
    }
  }
  if (hasMediaMutations) {
    scanMedia();
  }
}

function scanMedia() {
  // Find media that haven't been processed yet
  const mediaElements = document.querySelectorAll('img:not(.df-processed), video:not(.df-processed)');
  mediaElements.forEach(media => {
    // Mark as processed immediately so we don't handle them multiple times
    media.classList.add('df-processed');

    // Instagram media often load dynamically. We add a button if they're large enough.
    if (media.tagName === 'IMG') {
      if (media.width > 200 && media.height > 200) {
        addOverlayButton(media);
      } else {
        // Sometimes size isn't immediately known. Hook on load.
        media.addEventListener('load', () => {
          if (media.width > 200 && media.height > 200) {
            if (!media.parentNode.querySelector('.df-overlay-btn')) {
              addOverlayButton(media);
            }
          }
        });
      }
    } else if (media.tagName === 'VIDEO') {
      // If metadata already loaded, readyState >= 1
      if (media.readyState >= 1) {
        addOverlayButton(media);
      } else {
        media.addEventListener('loadedmetadata', () => {
          if (!document.querySelector(`.df-overlay-btn[data-for="${media.src}"]`)) {
            addOverlayButton(media);
          }
        });
      }
    }
  });
}

function captureVideoFrames(video, count = 3, intervalMs = 300) {
  return new Promise((resolve) => {
    const frames = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Scale down down large videos to avoid huge payload
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;

    let captures = 0;

    const captureFrame = () => {
      if (captures >= count) {
        resolve(frames);
        return;
      }

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.8));
      } catch (e) {
        console.error("Frame capture error:", e);
      }

      captures++;
      setTimeout(captureFrame, intervalMs);
    };

    captureFrame();
  });
}

function addOverlayButton(media) {
  // Create button
  const btn = document.createElement('button');
  btn.innerHTML = `<span class="df-icon">🔍</span>`;
  btn.className = 'df-overlay-btn';

  // Instagram images/videos are often in dynamic containers. Appending to parent usually works best
  // if we force the parent to be relatively positioned.
  let container = media.parentElement;

  if (media.tagName === 'VIDEO') {
    // Use fixed positioning relative to the viewport instead of fighting Instagram's stacking contexts
    btn.style.position = 'fixed';

    // Clear left positioning so it doesn't conflict with CSS 'right' and stretch the button
    btn.style.left = 'auto';

    const updateBtnPosition = () => {
      const rect = media.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        btn.style.display = 'none'; // Hide if video is not visible
        return;
      }
      btn.style.display = 'flex';
      btn.style.top = `${rect.top + 12}px`;
      // Position it 12px from the right edge of the video
      btn.style.right = `${window.innerWidth - rect.right + 12}px`;
    };

    updateBtnPosition();

    // Reposition on scroll/resize
    window.addEventListener('scroll', updateBtnPosition, { passive: true });
    window.addEventListener('resize', updateBtnPosition, { passive: true });

    document.body.appendChild(btn);
  } else {
    // For images, append to the relative container
    if (container) {
      if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }
      // Ensure the container doesn't hide our overflow
      container.style.overflow = 'visible';
      container.appendChild(btn);
    }
  }

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Hide previous popups
    const existing = document.getElementById('df-results-popup');
    if (existing) existing.remove();

    btn.innerHTML = `<span class="df-icon">⏳</span>`;
    btn.disabled = true;
    btn.classList.add('analyzing');

    // Send to background for analysis
    let payload;
    let endpointAction;

    if (media.tagName === 'VIDEO') {
      const frames = await captureVideoFrames(media, 3, 300);
      endpointAction = 'analyzeVideoFrames';
      payload = { frames: frames };
      if (frames.length === 0) {
        showResultsPopup({ success: false, error: "Failed to capture video frames." }, e.clientX, e.clientY);
        btn.disabled = false;
        btn.classList.remove('analyzing');
        return;
      }
    } else {
      endpointAction = 'analyzeImage';
      payload = { imageUrl: media.src };
    }

    try {
      chrome.runtime.sendMessage({
        action: endpointAction,
        ...payload
      }, (response) => {
        btn.disabled = false;
        btn.classList.remove('analyzing');

        if (chrome.runtime.lastError) {
          console.error("Error communicating with background:", chrome.runtime.lastError);
          btn.innerHTML = `<span class="df-icon">❌</span>`;
          showResultsPopup({ success: false, error: "Extension error. Please refresh the page and try again." }, e.clientX, e.clientY);
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
    } catch (err) {
      console.error("Message send error (likely extension context invalidated):", err);
      btn.disabled = false;
      btn.classList.remove('analyzing');
      btn.innerHTML = `<span class="df-icon">❌</span>`;
      showResultsPopup({ success: false, error: "Extension was updated. Please refresh the page." }, e.clientX, e.clientY);
    }
  }, { capture: true });
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
