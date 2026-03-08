let modeldropdown = document.getElementById("model");

modeldropdown.addEventListener("change", () => {
    let newmodel = modeldropdown.value;
    chrome.runtime.sendMessage({
        type: "UPDATE_SETTING",
        data: newmodel
    });
});


// This runs as soon as the popup opens
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['userSelection'], (result) => {
        if (result.userSelection) {
            // Set the dropdown to the last saved value
            dropdown.value = result.userSelection;
        }
    });
});
