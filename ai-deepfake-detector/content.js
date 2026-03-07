// Content script injected into Instagram pages to add analysis buttons

console.log("AI Deepfake Detector content script loaded.");

function init() {
  // Use a MutationObserver to detect new images loaded dynamically
  const observer = new MutationObserver(handleMutations);
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan
  scanImages();
}

function handleMutations(mutations) {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      scanImages();
    }
  }
}

function scanImages() {
  const images = document.querySelectorAll('img:not(.df-processed)');
  images.forEach(img => {
    // Mark as processed
    img.classList.add('df-processed');

    // Basic heuristic to skip tiny icons/images
    if (img.width > 200 && img.height > 200) {
      addOverlayButton(img);
    } else {
        // Instagram sometimes lazily loads images or uses srcset, 
        // we can hook on load if size isn't immediately known.
        img.addEventListener('load', () => {
             if (img.width > 200 && img.height > 200) {
                // Check again to avoid duplicate buttons if mutations trigger multiple times
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
  btn.innerText = 'Check AI Authenticity';
  btn.className = 'df-overlay-btn';
  
  // Basic styling for the button (rest in styles.css)
  btn.style.position = 'absolute';
  btn.style.top = '10px';
  btn.style.right = '10px';
  btn.style.zIndex = '9999';

  // Find a suitable container to position absolute against
  // Often on Instagram, images are wrapped in layout divs.
  // We'll wrap the image in a container if needed, or append to its relative parent.
  
  // A safer approach without breaking their layout is getting the bounding rect, 
  // but for a simple injected overlay, appending to a parent that spans the image works best.
  // Let's attach directly over the image using the document body or a wrapper.
  
  // For Instagram structural robustness, adding to parent is usually better if parent is relative.
  // We will force relative on parent.
  if (img.parentElement) {
      img.parentElement.style.position = 'relative';
      img.parentElement.appendChild(btn);
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    btn.innerText = 'Analyzing...';
    btn.disabled = true;

    // Send to background for analysis
    chrome.runtime.sendMessage({
      action: 'analyzeImage',
      imageUrl: img.src // Sometimes img.src is data URL or standard URL
    }, (response) => {
      btn.disabled = false;
      if (chrome.runtime.lastError) {
          console.error("Error communicating with background:", chrome.runtime.lastError);
          btn.innerText = 'Error';
          return;
      }
      
      if (response && response.success) {
        showResultsPopup(response, e.clientX, e.clientY);
        btn.innerText = response.isFake ? 'AI Generated⚠️' : 'Authentic✅';
        btn.style.backgroundColor = response.isFake ? '#ff4444' : '#44ff44';
      } else {
        btn.innerText = 'Analysis Failed';
      }
    });
  });
}

function showResultsPopup(results, x, y) {
    // Remove existing popup if any
    const existing = document.getElementById('df-results-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'df-results-popup';
    popup.className = 'df-popup';
    
    // Position near the click
    popup.style.position = 'fixed';
    popup.style.left = `${Math.min(x, window.innerWidth - 300)}px`;
    popup.style.top = `${y + 20}px`;
    popup.style.zIndex = '10000';
    popup.style.backgroundColor = 'white';
    popup.style.color = 'black';
    popup.style.padding = '15px';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    popup.style.width = '280px';
    popup.style.fontFamily = 'Arial, sans-serif';

    let html = `<h3>AI Authenticity Analysis</h3>`;
    html += `<p><strong>Score:</strong> ${(results.score * 100).toFixed(1)}% AI Generated</p>`;
    html += `<p><strong>Explanation:</strong> ${results.explanation}</p>`;
    
    if (results.sources && results.sources.length > 0) {
        html += `<p><strong>Links:</strong></p><ul>`;
        for (const source of results.sources) {
             html += `<li><a href="${source}" target="_blank">Source</a></li>`;
        }
        html += `</ul>`;
    }

    const closeBtn = document.createElement('button');
    closeBtn.innerText = 'Close';
    closeBtn.style.marginTop = '10px';
    closeBtn.addEventListener('click', () => popup.remove());

    popup.innerHTML = html;
    popup.appendChild(closeBtn);
    
    document.body.appendChild(popup);
}

// Start
init();
