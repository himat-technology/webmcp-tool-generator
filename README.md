<div align="center">

# 🌐 WebMCP Tool Generator

<p align="center">
  <strong>Automatically convert any website into standard browser WebMCP tool definitions for AI agents.</strong>
</p>

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-himat.tech-6366F1?style=for-the-badge&logo=rocket)](https://himat.tech/free-tools/webmcp-tool-generator)
[![Official Website](https://img.shields.io/badge/🌐_Website-himat.co.in-0EA5E9?style=for-the-badge)](https://himat.co.in)
[![License: MIT](https://img.shields.io/badge/License-MIT-10B981?style=for-the-badge)](LICENSE)

<br/>

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Himat_Technologies-0A66C2?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/himat-technologies-14b1051b4)
[![Instagram](https://img.shields.io/badge/Instagram-@himat__technologies-E4405F?style=flat-square&logo=instagram)](https://www.instagram.com/himat_technologies?stkn=djdmcGxweWtwYWI0)
[![Facebook](https://img.shields.io/badge/Facebook-Himat_Technologies-1877F2?style=flat-square&logo=facebook)](https://www.facebook.com/people/Himat-technologies/61593829197445/)
[![Email](https://img.shields.io/badge/Email-info@himat.co.in-EA4335?style=flat-square&logo=gmail)](mailto:info@himat.co.in)
[![Phone](https://img.shields.io/badge/Call-+91_94452_34023-25D366?style=flat-square&logo=whatsapp)](tel:+919445234023)

<br/>

</div>

---

### 🚀 Live Interactive Demo
Try the hosted version instantly without installation:  
👉 **[https://himat.tech/free-tools/webmcp-tool-generator](https://himat.tech/free-tools/webmcp-tool-generator)**

---

## 💡 What This Project Does

> **Takes a website URL, detects basic website actions, and generates WebMCP-compatible tool definitions that can be used by AI agents.**

AI agents operating in modern browser environments need structured, typed function definitions to interact with real websites. This application:
1. **Inspects any webpage URL** (or built-in offline test demos).
2. **Detects interactive DOM elements** (forms, search inputs, buttons, dropdowns, and navigation links).
3. **Categorizes action safety** automatically (`read`, `write`, `danger`).
4. **Generates browser WebMCP code** compatible with `navigator.modelContext.registerTool({ ... })`.
5. **Provides JSON Schema exports** and one-click copy buttons for immediate integration.

---

## ✨ Features

- ⚡ **Zero API Keys or LLM Dependencies**: Runs purely on deterministic heuristic parsing—instant and completely free.
- 🔍 **Comprehensive Element Detection**:
  - **Forms**: Search bars, contact forms, newsletter signup boxes, and authentication forms.
  - **Inputs**: Standalone search inputs, filter boxes, text fields.
  - **Dropdowns (`<select>`)**: Enum options extraction and selection schemas.
  - **Action Buttons**: Standalone interactive buttons mapped to click actions.
  - **Navigation Links**: Key navigation destinations from headers and navigation menus.
- 🛡️ **Three-Tier Safety Classification**:
  - <span style="color:#38bdf8">**`read`**</span>: GET queries, search actions, navigation links, filters.
  - <span style="color:#fbbf24">**`write`**</span>: Form submissions, data updates, and inputs.
  - <span style="color:#f87171">**`danger`**</span>: Deletions, cart clears, checkouts, and payment actions.
- 📋 **WebMCP Browser API Compliant**: Outputs code ready to be registered directly with the browser's agent context.
- 🎨 **Vibrant, Modern Developer UI**: Dark theme with glowing gradients, metrics badges, real-time safety filters, and toast notifications.
- 📦 **Built-in Local Test Demos**: Quickly test with `demo:store` and `demo:contact` without external internet dependencies.

---

## 🛠️ Requirements

- [Node.js](https://nodejs.org/) v18.0.0 or higher
- [npm](https://www.npmjs.com/) v9.0.0 or higher

---

## 📥 Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/himat-technology/webmcp-tool-generator.git
cd webmcp-tool-generator
npm install
```

---

## 🚀 How to Run Locally

Start the local server:

```bash
npm start
```

For development mode with automatic reload on changes:

```bash
npm run dev
```

Open your browser at:
```
http://localhost:3000
```

---

## 📖 Example Usage

1. Open `http://localhost:3000` (or try the [Live Demo](https://himat.tech/free-tools/webmcp-tool-generator)).
2. Enter any URL (e.g. `https://example.com`, `https://en.wikipedia.org`, or click **🛒 Demo Store**).
3. Click **Generate Tools**.
4. Review the generated tool cards, safety badges, parameters, and executable code snippets.
5. Copy the generated WebMCP JavaScript or JSON schema with a single click!

### 💻 Sample Generated WebMCP Tool

```javascript
navigator.modelContext.registerTool({
  name: "search",
  description: "Search website for content or items",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query string"
      }
    },
    required: ["query"]
  },
  execute: async ({ query }) => {
    const input = document.querySelector("input#search-input") || document.querySelector("input[name='q']");
    if (!input) throw new Error("Search input not found");
    input.value = query || "";
    if (input.form) {
      input.form.requestSubmit();
    } else {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { status: "submitted", query: query || "" };
  }
});
```

### 📄 Sample JSON Schema Output

```json
{
  "name": "search",
  "description": "Search website for content or items",
  "safety": "read",
  "type": "form",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query string"
      }
    },
    "required": ["query"]
  }
}
```

---

## 🛡️ Safety Classification Reference

| Level | Badge Color | Category Examples |
| :--- | :--- | :--- |
| **`read`** | 🔵 Cyan | GET queries, search forms, page navigation, filter selectors |
| **`write`** | 🟡 Amber | Contact forms, newsletter subscriptions, data entry forms, action buttons |
| **`danger`** | 🔴 Crimson | Checkout buttons, payment flows, delete/remove buttons, account cancellation |

---

## 📁 Project Structure

```
webmcp-tool-generator/
├── public/
│   ├── index.html       # Modern, colorful developer interface
│   ├── style.css        # Responsive dark UI with glowing accents & gradients
│   └── script.js        # Dynamic card rendering, filtering, and copy logic
├── server.js            # Express backend & Cheerio HTML parser
├── package.json         # Dependencies and scripts
├── README.md            # Documentation, live demo, and contact info
└── .gitignore           # Git ignore configuration
```

---

## ⚠️ Limitations

- **Pure Client-Rendered SPAs**: Pages rendered entirely on client-side JS without Server-Side Rendering (SSR) may have minimal static HTML.
- **Bot Protection & Captchas**: Cloudflare or aggressive anti-bot protections may block automated server fetches.
- **Protected Pages**: Pages behind authentication walls require authorization credentials.

---

## 🏢 About Himat Technology

Developed by **[Himat Technology](https://himat.co.in)** — building intelligent developer tools and digital solutions.

| Channel | Link / Details |
| :--- | :--- |
| 🌐 **Official Website** | [himat.co.in](https://himat.co.in) |
| 🚀 **Free Tools & Demo** | [himat.tech/free-tools/webmcp-tool-generator](https://himat.tech/free-tools/webmcp-tool-generator) |
| ✉️ **Email Support** | [info@himat.co.in](mailto:info@himat.co.in) |
| 📞 **Phone / WhatsApp** | [+91 94452 34023](tel:+919445234023) |
| 💼 **LinkedIn** | [linkedin.com/in/himat-technologies-14b1051b4](https://www.linkedin.com/in/himat-technologies-14b1051b4) |
| 📸 **Instagram** | [@himat_technologies](https://www.instagram.com/himat_technologies?stkn=djdmcGxweWtwYWI0) |
| 👥 **Facebook** | [facebook.com/people/Himat-technologies](https://www.facebook.com/people/Himat-technologies/61593829197445/) |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
