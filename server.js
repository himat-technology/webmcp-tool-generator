const express = require('express');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Normalize URL string
function normalizeUrl(inputUrl) {
  let trimmed = (inputUrl || '').trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.href;
  } catch {
    return null;
  }
}

// Helper: Sanitize string into valid JS identifier in snake_case
function sanitizeToolName(name) {
  let clean = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!clean || !/^[a-z]/.test(clean)) {
    clean = 'tool_' + (clean || 'action');
  }
  return clean.slice(0, 40);
}

// Helper: Deduplicate tool names
function makeUniqueName(name, existingNames) {
  let base = sanitizeToolName(name);
  if (!existingNames.has(base)) {
    existingNames.add(base);
    return base;
  }
  let counter = 2;
  while (existingNames.has(`${base}_${counter}`)) {
    counter++;
  }
  const unique = `${base}_${counter}`;
  existingNames.add(unique);
  return unique;
}

// Helper: Determine safety category
function classifySafety(text, isGetMethod = false) {
  const lower = (text || '').toLowerCase();
  const dangerKeywords = ['delete', 'remove', 'destroy', 'cancel', 'pay', 'checkout', 'buy', 'purge', 'drop', 'erase'];
  const readKeywords = ['search', 'find', 'filter', 'view', 'show', 'explore', 'get', 'query', 'navigate', 'goto', 'inspect', 'details'];

  for (const kw of dangerKeywords) {
    if (lower.includes(kw)) return 'danger';
  }
  if (isGetMethod) return 'read';
  for (const kw of readKeywords) {
    if (lower.includes(kw)) return 'read';
  }
  return 'write';
}

// Helper: Generate execute function body for WebMCP registration
function generateExecuteCode(tool) {
  const { type, selector, actionUrl, properties, name } = tool;
  const paramNames = Object.keys(properties || {});
  const destructure = paramNames.length > 0 ? `{ ${paramNames.join(', ')} }` : 'input';

  if (type === 'navigation') {
    return `async () => {
    // Navigate to page
    window.location.href = ${JSON.stringify(actionUrl)};
    return { status: "navigating", url: ${JSON.stringify(actionUrl)} };
  }`;
  }

  if (type === 'button') {
    return `async () => {
    // Click target button element
    const btn = document.querySelector(${JSON.stringify(selector)});
    if (!btn) throw new Error("Button not found: " + ${JSON.stringify(selector)});
    btn.click();
    return { status: "clicked", selector: ${JSON.stringify(selector)} };
  }`;
  }

  if (type === 'search_input') {
    return `async (${destructure}) => {
    // Find search field and submit query
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error("Search input not found: " + ${JSON.stringify(selector)});
    input.value = query || "";
    if (input.form) {
      input.form.requestSubmit();
    } else {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
    return { status: "submitted", query: query || "" };
  }`;
  }

  if (type === 'select') {
    return `async (${destructure}) => {
    // Select option in dropdown
    const select = document.querySelector(${JSON.stringify(selector)});
    if (!select) throw new Error("Select dropdown not found: " + ${JSON.stringify(selector)});
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { status: "selected", value: value };
  }`;
  }

  // Default: Form submission
  const fillStatements = paramNames
    .map(p => `    if (form.elements[${JSON.stringify(p)}]) {\n      form.elements[${JSON.stringify(p)}].value = ${p} || "";\n    }`)
    .join('\n');

  const destructureForm = paramNames.length > 3
    ? `{\n    ${paramNames.join(',\n    ')}\n  }`
    : (paramNames.length > 0 ? `{ ${paramNames.join(', ')} }` : 'input');

  return `async (${destructureForm}) => {
    // Find and populate form
    const form = document.querySelector(${JSON.stringify(selector)}) || document.querySelector("form");
    if (!form) throw new Error("Form element not found");
${fillStatements}
    form.requestSubmit ? form.requestSubmit() : form.submit();
    return { status: "submitted", tool: ${JSON.stringify(name)} };
  }`;
}

// Generate Javascript snippet for a single tool
function formatToolCode(tool) {
  const inputSchema = {
    type: 'object',
    properties: tool.properties || {},
    required: tool.required || []
  };

  const schemaString = JSON.stringify(inputSchema, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n');

  const executeCode = generateExecuteCode(tool);

  return `navigator.modelContext.registerTool({
  name: ${JSON.stringify(tool.name)},
  description: ${JSON.stringify(tool.description)},
  inputSchema: ${schemaString},
  execute: ${executeCode}
});`;
}

// Parse HTML and extract actionable tools
function extractToolsFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const tools = [];
  const existingNames = new Set();

  const pageTitle = $('title').first().text().trim() || $('h1').first().text().trim() || 'Website';
  let host = 'website';
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, '');
  } catch {}

  // 1. Detect Forms
  $('form').each((i, formElem) => {
    const $form = $(formElem);
    const formId = $form.attr('id') || '';
    const formName = $form.attr('name') || '';
    const formClass = $form.attr('class') || '';
    const method = ($form.attr('method') || 'GET').toUpperCase();
    const actionAttr = $form.attr('action') || '';
    let actionUrl = baseUrl;
    try {
      actionUrl = new URL(actionAttr, baseUrl).href;
    } catch {}

    const formText = ($form.find('button[type="submit"], input[type="submit"]').text() ||
      $form.find('button[type="submit"], input[type="submit"]').val() ||
      $form.attr('aria-label') ||
      formId ||
      formName ||
      'form').toLowerCase();

    const properties = {};
    const required = [];
    let isSearch = false;
    let isContact = false;
    let isNewsletter = false;
    let isLogin = false;

    // Detect inputs inside form
    $form.find('input, textarea, select').each((_, inputElem) => {
      const $input = $(inputElem);
      const type = ($input.attr('type') || inputElem.tagName.toLowerCase()).toLowerCase();
      if (['submit', 'button', 'image', 'reset', 'hidden'].includes(type)) return;

      const name = $input.attr('name') || $input.attr('id') || `param_${Object.keys(properties).length + 1}`;
      const safeParamName = sanitizeToolName(name);
      const placeholder = $input.attr('placeholder') || '';
      const labelText = $(`label[for="${$input.attr('id')}"]`).text().trim() || '';
      const ariaLabel = $input.attr('aria-label') || '';
      const isReq = $input.prop('required') || $input.attr('required') !== undefined;

      const desc = placeholder || labelText || ariaLabel || `Input for ${safeParamName}`;

      let propType = 'string';
      if (type === 'number' || type === 'range') propType = 'number';
      if (type === 'checkbox') propType = 'boolean';

      properties[safeParamName] = {
        type: propType,
        description: desc.trim() || `Value for ${safeParamName}`
      };

      if (isReq) {
        required.push(safeParamName);
      }

      // Check heuristics
      const context = `${safeParamName} ${desc} ${type}`.toLowerCase();
      if (/search|query|\bq\b|keyword/.test(context)) isSearch = true;
      if (/message|comment|feedback|contact/.test(context)) isContact = true;
      if (/email|subscribe|newsletter/.test(context)) isNewsletter = true;
      if (/password|login|auth/.test(context)) isLogin = true;
    });

    // Derive semantic name & description
    let toolBaseName = 'submit_form';
    let toolDesc = `Submit form on ${host}`;

    if (isSearch || /search/.test(formText)) {
      toolBaseName = 'search';
      toolDesc = `Search ${host} for content or items`;
    } else if (isContact || /contact/.test(formText)) {
      toolBaseName = 'submit_contact';
      toolDesc = `Submit contact message on ${host}`;
    } else if (isNewsletter || /subscribe|newsletter/.test(formText)) {
      toolBaseName = 'subscribe_newsletter';
      toolDesc = `Subscribe to email updates on ${host}`;
    } else if (isLogin || /login|sign.?in/.test(formText)) {
      toolBaseName = 'login';
      toolDesc = `Sign in to account on ${host}`;
    } else if (formId || formName) {
      toolBaseName = `submit_${formId || formName}`;
      toolDesc = `Submit ${formId || formName} form on ${host}`;
    } else {
      toolBaseName = `submit_form_${i + 1}`;
    }

    const safety = classifySafety(`${toolBaseName} ${toolDesc} ${formText}`, method === 'GET');
    const selector = formId ? `form#${formId}` : (formName ? `form[name="${formName}"]` : `form:nth-of-type(${i + 1})`);
    const finalName = makeUniqueName(toolBaseName, existingNames);

    tools.push({
      id: `tool-${tools.length + 1}`,
      name: finalName,
      description: toolDesc,
      type: 'form',
      safety,
      method,
      selector,
      actionUrl,
      properties,
      required,
      inputSchema: {
        type: 'object',
        properties,
        required
      }
    });
  });

  // 2. Standalone Search Inputs (outside forms)
  $('input[type="search"], input[name="q"], input[name*="search"], input[id*="search"], input[placeholder*="search" i]').each((i, inputElem) => {
    const $input = $(inputElem);
    // Skip if already inside a processed form
    if ($input.closest('form').length > 0) return;

    const inputId = $input.attr('id') || '';
    const inputName = $input.attr('name') || '';
    const selector = inputId ? `input#${inputId}` : (inputName ? `input[name="${inputName}"]` : 'input[type="search"]');

    const finalName = makeUniqueName('search', existingNames);
    tools.push({
      id: `tool-${tools.length + 1}`,
      name: finalName,
      description: `Search query on ${host}`,
      type: 'search_input',
      safety: 'read',
      selector,
      actionUrl: baseUrl,
      properties: {
        query: {
          type: 'string',
          description: $input.attr('placeholder') || 'Search query string'
        }
      },
      required: ['query'],
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: $input.attr('placeholder') || 'Search query string' }
        },
        required: ['query']
      }
    });
  });

  // 3. Select Dropdowns (outside forms or prominent filters)
  $('select').each((i, selectElem) => {
    const $select = $(selectElem);
    if ($select.closest('form').length > 0) return; // handled by form

    const selectId = $select.attr('id') || '';
    const selectName = $select.attr('name') || '';
    const labelText = $(`label[for="${selectId}"]`).text().trim() || $select.attr('aria-label') || selectId || selectName || 'filter';

    const options = [];
    $select.find('option').each((_, opt) => {
      const val = $(opt).attr('value') || $(opt).text().trim();
      if (val && !options.includes(val) && options.length < 8) options.push(val);
    });

    const selector = selectId ? `select#${selectId}` : (selectName ? `select[name="${selectName}"]` : `select:nth-of-type(${i + 1})`);
    const toolBase = `select_${sanitizeToolName(labelText)}`;
    const finalName = makeUniqueName(toolBase, existingNames);

    const prop = {
      type: 'string',
      description: `Selected option for ${labelText}`
    };
    if (options.length > 0) {
      prop.enum = options;
    }

    tools.push({
      id: `tool-${tools.length + 1}`,
      name: finalName,
      description: `Choose option from ${labelText} dropdown`,
      type: 'select',
      safety: 'read',
      selector,
      actionUrl: baseUrl,
      properties: { value: prop },
      required: ['value'],
      inputSchema: {
        type: 'object',
        properties: { value: prop },
        required: ['value']
      }
    });
  });

  // 4. Action Buttons (standalone buttons with clear labels)
  $('button, input[type="button"], a[role="button"]').each((i, btnElem) => {
    const $btn = $(btnElem);
    if ($btn.closest('form').length > 0 && ($btn.attr('type') === 'submit' || !$btn.attr('type'))) {
      return; // Handled by form submission
    }

    const text = ($btn.text() || $btn.val() || $btn.attr('aria-label') || '').trim();
    if (!text || text.length < 2 || text.length > 35) return;
    if (/^(menu|toggle|next|prev|<|>|\+|x|close)$/i.test(text)) return;

    const btnId = $btn.attr('id') || '';
    const selector = btnId ? `#${btnId}` : `button:contains("${text.slice(0, 15)}")`;

    const toolBaseName = `click_${sanitizeToolName(text)}`;
    const finalName = makeUniqueName(toolBaseName, existingNames);
    const safety = classifySafety(text);

    tools.push({
      id: `tool-${tools.length + 1}`,
      name: finalName,
      description: `Trigger "${text}" button action on ${host}`,
      type: 'button',
      safety,
      selector,
      actionUrl: baseUrl,
      properties: {},
      required: [],
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    });
  });

  // 5. Prominent Navigation Links (e.g., from <nav> or <header>)
  $('nav a, header a, a[href^="/"], a[href^="http"]').each((i, linkElem) => {
    if (tools.filter(t => t.type === 'navigation').length >= 8) return; // Limit to 8 top navigation links

    const $link = $(linkElem);
    const text = $link.text().trim();
    const href = $link.attr('href');

    if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (!text || text.length < 2 || text.length > 30) return;
    if (/^(home|logo|back|top|skip|privacy|terms|copyright)$/i.test(text)) return;

    let targetUrl = '';
    try {
      targetUrl = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    // Skip external domains unless relevant
    try {
      const targetHost = new URL(targetUrl).hostname;
      if (targetHost !== new URL(baseUrl).hostname && !targetUrl.includes(host)) return;
    } catch {}

    const toolBaseName = `navigate_to_${sanitizeToolName(text)}`;
    // Avoid duplicate navigation
    if (existingNames.has(toolBaseName)) return;

    const finalName = makeUniqueName(toolBaseName, existingNames);
    tools.push({
      id: `tool-${tools.length + 1}`,
      name: finalName,
      description: `Navigate to ${text} page (${targetUrl})`,
      type: 'navigation',
      safety: 'read',
      selector: `a[href="${href}"]`,
      actionUrl: targetUrl,
      properties: {},
      required: [],
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    });
  });

  // Attach JavaScript snippet to each tool
  tools.forEach(tool => {
    tool.javascript = formatToolCode(tool);
  });

  return {
    title: pageTitle,
    url: baseUrl,
    host,
    totalCount: tools.length,
    tools
  };
}

// Built-in Demo Test Pages (Allows local testing without external internet dependency)
app.get('/demo/store', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head><title>Demo Store - Gadgets & Tech</title></head>
    <body>
      <header>
        <h1>Demo Store</h1>
        <nav>
          <a href="/demo/store/products">All Products</a>
          <a href="/demo/store/deals">Hot Deals</a>
          <a href="/demo/store/about">About Us</a>
          <a href="/demo/store/contact">Customer Support</a>
        </nav>
      </header>
      <main>
        <section>
          <h2>Search Products</h2>
          <form id="search-form" action="/demo/store/search" method="GET">
            <input type="search" name="q" placeholder="Search gadgets, accessories..." required />
            <select name="category" id="category-filter">
              <option value="all">All Categories</option>
              <option value="phones">Phones</option>
              <option value="laptops">Laptops</option>
              <option value="audio">Audio</option>
            </select>
            <button type="submit">Search Now</button>
          </form>
        </section>

        <section>
          <h2>Newsletter Signup</h2>
          <form id="newsletter-form" action="/demo/store/newsletter" method="POST">
            <input type="email" name="email" placeholder="Your email address" required />
            <button type="submit">Subscribe</button>
          </form>
        </section>

        <section>
          <h2>Quick Actions</h2>
          <button id="add-to-cart-btn">Add to Cart</button>
          <button id="checkout-btn">Proceed to Checkout</button>
          <button id="clear-cart-btn">Delete Cart</button>
        </section>
      </main>
    </body>
    </html>
  `);
});

app.get('/demo/contact', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head><title>Contact Us - Support Center</title></head>
    <body>
      <h1>Contact Support</h1>
      <form id="contact-form" action="/api/contact" method="POST">
        <label for="name">Full Name</label>
        <input type="text" id="name" name="name" placeholder="John Doe" required />
        <label for="email">Email</label>
        <input type="email" id="email" name="email" placeholder="john@example.com" required />
        <label for="topic">Inquiry Topic</label>
        <select id="topic" name="topic">
          <option value="sales">Sales</option>
          <option value="support">Technical Support</option>
          <option value="billing">Billing</option>
        </select>
        <label for="message">Your Message</label>
        <textarea id="message" name="message" placeholder="How can we help you?" required></textarea>
        <button type="submit">Send Message</button>
      </form>
    </body>
    </html>
  `);
});

// API: Generate Tools endpoint
app.post('/api/generate', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({
      error: 'Please enter a valid website URL.'
    });
  }

  // Handle local demo aliases
  let targetUrl = url.trim();
  if (targetUrl === 'demo:store' || targetUrl === '/demo/store') {
    targetUrl = `http://localhost:${PORT}/demo/store`;
  } else if (targetUrl === 'demo:contact' || targetUrl === '/demo/contact') {
    targetUrl = `http://localhost:${PORT}/demo/contact`;
  } else {
    targetUrl = normalizeUrl(targetUrl);
  }

  if (!targetUrl) {
    return res.status(400).json({
      error: 'Invalid URL format. Please provide a full URL like https://example.com'
    });
  }

  try {
    const fetchOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    };

    const response = await fetch(targetUrl, fetchOptions);

    if (!response.ok) {
      if (response.status === 403) {
        return res.status(403).json({
          error: 'Could not access website (403 Forbidden). The destination site is protected by Cloudflare or anti-bot verification and blocked direct server requests.'
        });
      }
      return res.status(response.status >= 500 ? 502 : 400).json({
        error: `Could not access website (${response.status} ${response.statusText}). Check if the site is reachable.`
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return res.status(400).json({
        error: `URL did not return HTML content (Received: ${contentType || 'unknown'}). Please specify an HTML webpage.`
      });
    }

    const html = await response.text();
    if (!html || !html.trim()) {
      return res.status(400).json({
        error: 'The website returned an empty response.'
      });
    }

    const analysis = extractToolsFromHtml(html, targetUrl);

    if (analysis.tools.length === 0) {
      return res.status(200).json({
        title: analysis.title,
        url: targetUrl,
        host: analysis.host,
        totalCount: 0,
        tools: [],
        message: 'No actionable elements (forms, buttons, links, search inputs) were detected on this page.'
      });
    }

    // Combined JS string
    const fullJavascript = analysis.tools.map(t => t.javascript).join('\n\n');

    // JSON export schema
    const jsonOutput = {
      generator: 'WebMCP Tool Generator',
      version: '1.0.0',
      sourceUrl: targetUrl,
      pageTitle: analysis.title,
      generatedAt: new Date().toISOString(),
      tools: analysis.tools.map(t => ({
        name: t.name,
        description: t.description,
        safety: t.safety,
        type: t.type,
        inputSchema: t.inputSchema
      }))
    };

    return res.json({
      success: true,
      title: analysis.title,
      url: targetUrl,
      host: analysis.host,
      totalCount: analysis.tools.length,
      tools: analysis.tools,
      fullJavascript,
      jsonOutput
    });

  } catch (err) {
    if (err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
      return res.status(504).json({
        error: 'Connection timed out while fetching the website. The server took too long to respond.'
      });
    }
    if (err.code === 'ENOTFOUND') {
      return res.status(400).json({
        error: 'Website domain could not be resolved. Please check the spelling of the URL.'
      });
    }
    if (err.code === 'ECONNREFUSED') {
      return res.status(502).json({
        error: 'Connection refused by destination server.'
      });
    }

    return res.status(500).json({
      error: `Failed to analyze website: ${err.message || 'Unknown network error'}`
    });
  }
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`WebMCP Tool Generator is running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use by another process.`);
    console.error(`💡 Tip: Close the process on port ${PORT} or specify a different port:`);
    console.error(`   $env:PORT=3001; npm run dev   (PowerShell)`);
    console.error(`   PORT=3001 npm run dev         (Bash / macOS)\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

