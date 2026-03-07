document.addEventListener('DOMContentLoaded', () => {
  const geminiInput = document.getElementById('gemini-key');
  const saveBtn = document.getElementById('save-btn');
  const statusDiv = document.getElementById('save-status');

  // Load existing key
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      geminiInput.value = result.geminiApiKey;
    }
  });

  // Save new key
  saveBtn.addEventListener('click', () => {
    const key = geminiInput.value.trim();
    if (key) {
      chrome.storage.local.set({ geminiApiKey: key }, () => {
        statusDiv.textContent = 'Settings saved successfully!';
        statusDiv.classList.add('show');
        setTimeout(() => {
          statusDiv.classList.remove('show');
        }, 2000);
      });
    } else {
      // Allow clearing the key as well
      chrome.storage.local.remove(['geminiApiKey'], () => {
        statusDiv.textContent = 'Key cleared!';
        statusDiv.classList.add('show');
        setTimeout(() => {
          statusDiv.classList.remove('show');
        }, 2000);
      });
    }
  });
});
