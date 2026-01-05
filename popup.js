document.getElementById('copy-btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) return;

  try {
    // Inject content script to scrape the page
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    if (results && results[0] && results[0].result) {
      const markdown = results[0].result;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(markdown);
      
      // Show tooltip
      const btn = document.getElementById('copy-btn');
      btn.classList.add('show-tooltip');
      
      // Hide tooltip when mouse leaves
      btn.addEventListener('mouseleave', () => {
        setTimeout(() => {
          btn.classList.remove('show-tooltip');
        }, 300);
      }, { once: true });
    }
  } catch (err) {
    console.error('Failed to copy markdown:', err);
    // Optional: Update UI to show error
  }
});
