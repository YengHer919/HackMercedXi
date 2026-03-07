document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const saveStatus = document.getElementById('saveStatus');

  // Load existing key on open
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });

  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    
    saveBtn.disabled = true;
    saveBtn.innerText = 'Saving...';

    chrome.storage.local.set({ geminiApiKey: key }, () => {
      saveBtn.disabled = false;
      saveBtn.innerText = 'Save & Activate';
      
      saveStatus.classList.add('show');
      setTimeout(() => {
        saveStatus.classList.remove('show');
      }, 3000);
    });
  });
});
