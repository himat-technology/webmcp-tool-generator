// ==========================================================================
// WebMCP Tool Generator - Frontend Client Logic (Himat Technology)
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlForm = document.getElementById('url-form');
  const urlInput = document.getElementById('url-input');
  const generateBtn = document.getElementById('generate-btn');
  const btnText = generateBtn.querySelector('.btn-text');
  const btnSpinner = generateBtn.querySelector('.btn-spinner');

  const alertBox = document.getElementById('alert-box');
  const alertTitle = document.getElementById('alert-title');
  const alertMessage = document.getElementById('alert-message');
  const alertClose = document.getElementById('alert-close');

  const loadingState = document.getElementById('loading-state');
  const loadingTitle = document.getElementById('loading-title');
  const loadingDesc = document.getElementById('loading-desc');
  const resultsSection = document.getElementById('results-section');

  const resultPageTitle = document.getElementById('result-page-title');
  const resultPageUrl = document.getElementById('result-page-url');
  const countTotal = document.getElementById('count-total');
  const countRead = document.getElementById('count-read');
  const countWrite = document.getElementById('count-write');
  const countDanger = document.getElementById('count-danger');
  const tabCountTools = document.getElementById('tab-count-tools');

  const toolsList = document.getElementById('tools-list');
  const fullCodeContent = document.getElementById('full-code-content');
  const fullJsonContent = document.getElementById('full-json-content');

  const safetyFilter = document.getElementById('safety-filter');
  const filterGroup = document.getElementById('filter-group');
  const copyActiveBtn = document.getElementById('copy-active-btn');
  const copyBtnText = document.getElementById('copy-btn-text');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');

  // Tab elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = {
    cards: document.getElementById('view-cards'),
    code: document.getElementById('view-code'),
    json: document.getElementById('view-json')
  };

  // State
  let currentData = null;
  let activeTab = 'cards';
  let loadingProgressTimer = null;

  // Initialize UI in clean initial state
  hideAlert();
  setLoading(false);
  resultsSection.hidden = true;

  // --------------------------------------------------------------------------
  // Preset Chips
  // --------------------------------------------------------------------------
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const url = chip.getAttribute('data-url');
      if (url) {
        urlInput.value = url;
        if (typeof urlForm.requestSubmit === 'function') {
          urlForm.requestSubmit();
        } else {
          urlForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Form Submission
  // --------------------------------------------------------------------------
  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawUrl = urlInput.value.trim();

    if (!rawUrl) {
      showAlert('Input Required', 'Please enter a valid website URL to analyze.');
      urlInput.focus();
      return;
    }

    hideAlert();
    setLoading(true, `Analyzing ${rawUrl}...`, 'Connecting to server and requesting webpage...');

    // Progress status updates for long fetches
    let step = 0;
    const progressSteps = [
      { delay: 2000, title: 'Downloading HTML...', desc: 'Fetching page source and following redirects...' },
      { delay: 5000, title: 'Parsing DOM Elements...', desc: 'Inspecting forms, buttons, inputs, links, and dropdowns...' },
      { delay: 9000, title: 'Generating WebMCP Tools...', desc: 'Synthesizing browser actions and typing input schemas...' }
    ];

    clearInterval(loadingProgressTimer);
    loadingProgressTimer = setInterval(() => {
      step++;
      if (step <= progressSteps.length) {
        const p = progressSteps[step - 1];
        if (loadingTitle) loadingTitle.textContent = p.title;
        if (loadingDesc) loadingDesc.textContent = p.desc;
      }
    }, 2500);

    // Timeout controller (25 seconds)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 25000);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl }),
        signal: abortController.signal
      });

      clearTimeout(timeoutId);
      clearInterval(loadingProgressTimer);

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText})`);
      }

      if (!res.ok) {
        throw new Error(data.error || `Server responded with status ${res.status}`);
      }

      currentData = data;
      renderResults(data);
    } catch (err) {
      clearTimeout(timeoutId);
      clearInterval(loadingProgressTimer);

      if (err.name === 'AbortError') {
        showAlert('Request Timed Out', 'The website took more than 25 seconds to respond. The destination server may be slow or blocking automated requests.');
      } else {
        showAlert('Analysis Failed', err.message || 'Could not inspect the provided URL.');
      }
      resultsSection.hidden = true;
    } finally {
      setLoading(false);
    }
  });

  // --------------------------------------------------------------------------
  // Render Results
  // --------------------------------------------------------------------------
  function renderResults(data) {
    if (!data.tools || data.tools.length === 0) {
      showAlert('No Actionable Elements Found', data.message || 'No interactive forms, buttons, dropdowns, or navigation links were detected on this page.');
      resultsSection.hidden = true;
      return;
    }

    resultPageTitle.textContent = data.title || data.host;
    resultPageUrl.textContent = data.url;
    resultPageUrl.href = data.url;

    // Metrics counts
    const total = data.tools.length;
    const reads = data.tools.filter(t => t.safety === 'read').length;
    const writes = data.tools.filter(t => t.safety === 'write').length;
    const dangers = data.tools.filter(t => t.safety === 'danger').length;

    countTotal.textContent = total;
    countRead.textContent = reads;
    countWrite.textContent = writes;
    countDanger.textContent = dangers;
    tabCountTools.textContent = total;

    // Reset safety filter to all
    safetyFilter.value = 'all';

    // Render cards
    renderCards(data.tools);

    // Render full JS
    fullCodeContent.textContent = data.fullJavascript || '// No JavaScript generated';

    // Render JSON
    fullJsonContent.textContent = JSON.stringify(data.jsonOutput || {}, null, 2);

    resultsSection.hidden = false;
    switchTab('cards');

    // Smooth scroll to results
    setTimeout(() => {
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  // --------------------------------------------------------------------------
  // Render Tool Cards
  // --------------------------------------------------------------------------
  function renderCards(tools) {
    toolsList.innerHTML = '';

    if (!tools || tools.length === 0) {
      toolsList.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: var(--text-dim); background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          🔍 No tools match the selected filter.
        </div>
      `;
      return;
    }

    tools.forEach(tool => {
      const card = document.createElement('div');
      card.className = 'tool-card';
      card.dataset.safety = tool.safety;
      card.dataset.id = tool.id;

      // Parameters HTML
      const props = tool.inputSchema?.properties || tool.properties || {};
      const propKeys = Object.keys(props);
      const reqList = tool.inputSchema?.required || tool.required || [];

      let paramsHtml = '';
      if (propKeys.length === 0) {
        paramsHtml = '<div class="no-params-text">No parameters required.</div>';
      } else {
        const rows = propKeys.map(key => {
          const prop = props[key] || {};
          const isReq = reqList.includes(key);
          const reqBadge = isReq 
            ? '<span class="param-req">required</span>' 
            : '<span class="param-opt">optional</span>';
          return `
            <tr>
              <td class="param-name">${escapeHtml(key)}</td>
              <td class="param-type">${escapeHtml(prop.type || 'string')}</td>
              <td>${reqBadge}</td>
              <td style="color: var(--text-muted);">${escapeHtml(prop.description || '')}</td>
            </tr>
          `;
        }).join('');

        paramsHtml = `
          <table class="params-table">
            <thead>
              <tr>
                <th>Param</th>
                <th>Type</th>
                <th>Req</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `;
      }

      card.innerHTML = `
        <div class="tool-card-header">
          <div class="tool-title-group">
            <span class="tool-name">${escapeHtml(tool.name)}</span>
            <span class="badge badge-${escapeHtml(tool.safety)}">${escapeHtml(tool.safety)}</span>
            <span class="badge badge-type">${escapeHtml(tool.type)}</span>
          </div>
          <button type="button" class="copy-single-btn" data-tool-id="${escapeHtml(tool.id)}">
            <span>📋</span> Copy Code
          </button>
        </div>

        <p class="tool-description">${escapeHtml(tool.description)}</p>

        <div class="tool-params-section">
          <div class="tool-params-header">Input Schema Parameters (${propKeys.length})</div>
          ${paramsHtml}
        </div>

        <div class="tool-code-preview">
          <div class="tool-code-header">
            <span>WebMCP Browser Definition</span>
          </div>
          <pre class="code-block"><code>${escapeHtml(tool.javascript)}</code></pre>
        </div>
      `;

      toolsList.appendChild(card);
    });

    // Attach copy listeners for individual tool cards
    toolsList.querySelectorAll('.copy-single-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const toolId = btn.getAttribute('data-tool-id');
        const tool = currentData?.tools?.find(t => t.id === toolId);
        if (tool && tool.javascript) {
          copyToClipboard(tool.javascript, `Copied ${tool.name} tool definition!`);
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // Safety Filter
  // --------------------------------------------------------------------------
  safetyFilter.addEventListener('change', () => {
    if (!currentData || !currentData.tools) return;
    const filter = safetyFilter.value;
    const filtered = filter === 'all' 
      ? currentData.tools 
      : currentData.tools.filter(t => t.safety === filter);
    renderCards(filtered);
  });

  // --------------------------------------------------------------------------
  // Tab Switching
  // --------------------------------------------------------------------------
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  function switchTab(tab) {
    activeTab = tab;
    tabButtons.forEach(b => {
      const isSelected = b.getAttribute('data-tab') === tab;
      b.classList.toggle('active', isSelected);
      b.setAttribute('aria-selected', isSelected);
    });

    Object.keys(tabPanels).forEach(key => {
      if (key === tab) {
        tabPanels[key].hidden = false;
        tabPanels[key].classList.add('active');
      } else {
        tabPanels[key].hidden = true;
        tabPanels[key].classList.remove('active');
      }
    });

    // Update global copy button text & filter visibility
    if (tab === 'cards') {
      filterGroup.style.display = 'flex';
      copyBtnText.textContent = 'Copy All JS';
    } else if (tab === 'code') {
      filterGroup.style.display = 'none';
      copyBtnText.textContent = 'Copy JavaScript';
    } else if (tab === 'json') {
      filterGroup.style.display = 'none';
      copyBtnText.textContent = 'Copy JSON';
    }
  }

  // --------------------------------------------------------------------------
  // Global Copy Actions
  // --------------------------------------------------------------------------
  copyActiveBtn.addEventListener('click', () => {
    if (!currentData) return;
    if (activeTab === 'json') {
      copyToClipboard(JSON.stringify(currentData.jsonOutput, null, 2), 'JSON Schema copied to clipboard!');
    } else {
      copyToClipboard(currentData.fullJavascript, 'WebMCP JavaScript copied to clipboard!');
    }
  });

  // Code panel copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-copy-target');
      const targetElem = document.getElementById(targetId);
      if (targetElem) {
        copyToClipboard(targetElem.textContent, 'Copied to clipboard!');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  function setLoading(isLoading, title, desc) {
    generateBtn.disabled = isLoading;
    btnSpinner.hidden = !isLoading;
    btnText.textContent = isLoading ? 'Analyzing...' : 'Generate Tools';
    loadingState.hidden = !isLoading;

    if (isLoading) {
      if (title && loadingTitle) loadingTitle.textContent = title;
      if (desc && loadingDesc) loadingDesc.textContent = desc;
      resultsSection.hidden = true;
    }
  }

  function showAlert(title, message) {
    alertTitle.textContent = title || 'Notice';
    alertMessage.textContent = message || '';
    alertBox.hidden = false;
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    alertBox.hidden = true;
    alertTitle.textContent = '';
    alertMessage.textContent = '';
  }

  alertClose.addEventListener('click', hideAlert);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let toastTimeout;
  function copyToClipboard(text, message = 'Copied to clipboard!') {
    if (!text) return;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(message))
        .catch(() => fallbackCopy(text, message));
    } else {
      fallbackCopy(text, message);
    }
  }

  function fallbackCopy(text, message) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(message);
    } catch (err) {
      showAlert('Copy Failed', 'Unable to copy text automatically. Please select and copy manually.');
    }
    textArea.remove();
  }

  function showToast(msg) {
    clearTimeout(toastTimeout);
    toastMsg.textContent = msg;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }
});
