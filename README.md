# 🔍 OSINT Gmail Extractor

> A Chrome Extension (Manifest V3) that silently harvests Gmail addresses — and optionally all email addresses — from DuckDuckGo search result pages in real time, without ever visiting an external website.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [File Structure](#file-structure)
- [Installation](#installation)
- [How to Use](#how-to-use)
- [OSINT Dorks & Testing](#osint-dorks--testing)
- [Options & Toggles](#options--toggles)
- [Export Options](#export-options)
- [How It Works (Technical)](#how-it-works-technical)
- [Permissions Explained](#permissions-explained)
- [Privacy & Ethics](#privacy--ethics)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Changelog](#changelog)

---

## Overview

**OSINT Gmail Extractor** is a lightweight Chrome extension built for open-source intelligence (OSINT) researchers. It scans the visible text of DuckDuckGo search result pages — titles and snippets — and extracts email addresses using a real-time regex scanner backed by a `MutationObserver`.

### Key principle

> **It never visits any link. It never fetches any external URL. It only reads text already rendered on the DuckDuckGo results page.**

This makes it safe, fast, and impossible to trigger rate limits or leave traces on target websites.

---

## Features

| Feature | Detail |
|---|---|
| ✅ Real-time extraction | Emails appear in the popup as they are found |
| ✅ Infinite scroll support | `MutationObserver` catches every new batch of results as you scroll |
| ✅ Gmail-only mode | Default regex targets `@gmail.com` addresses only |
| ✅ All-providers mode | Toggle to catch any `user@domain.tld` address |
| ✅ Duplicate removal | Three-layer dedup: `Set` in content script, `Set` in popup, manual `⊘ Dedup` button |
| ✅ Email highlighting | Wraps found emails in a green `<mark>` directly in the SERP |
| ✅ Copy individual email | One-click copy button on each list item |
| ✅ Copy All | Copies the full deduplicated list to clipboard |
| ✅ Download TXT | Saves emails as a plain `.txt` file (one per line) |
| ✅ Download JSON | Saves emails as structured `.json` with metadata |
| ✅ Session timer | Tracks how long extraction has been running |
| ✅ No external libraries | Zero dependencies — pure vanilla JS |
| ✅ Manifest V3 | Compliant with Chrome's current extension platform |

---

## File Structure

```
osint-gmail-extractor/
│
├── manifest.json       # Extension configuration (MV3)
├── content.js          # Injected into DuckDuckGo — does the scanning
├── popup.html          # Extension popup UI (hacker terminal aesthetic)
├── popup.js            # Popup logic — controls, list, export, dedup
└── icons/
    ├── icon16.png      # Toolbar icon (16×16)
    ├── icon48.png      # Extensions page icon (48×48)
    └── icon128.png     # Chrome Web Store icon (128×128)
```

### Role of each file

**`manifest.json`** declares the extension's permissions, which pages it runs on, and which files are the popup and content script.

**`content.js`** is injected silently into every `duckduckgo.com` tab. It does the actual work: querying DOM nodes, running the regex, deduplicating with a `Set`, highlighting matches in the page, and watching for new results via `MutationObserver`. It communicates back to the popup via `chrome.runtime.sendMessage`.

**`popup.html`** is the UI that appears when you click the extension icon. It contains all the buttons, the live email list, toggles, and export controls.

**`popup.js`** drives the popup. It sends commands (`START`, `STOP`, `CLEAR`, `GET_EMAILS`) to `content.js`, receives `NEW_EMAILS` messages back, maintains its own `Set`-backed deduplicated list, and handles all export logic.

---

## Installation

### Step 1 — Download

Download the ZIP file and unzip it or just clone the repo. You should have a folder called `osint-gmail-extractor/` containing all the files above.

### Step 2 — Open Chrome Extensions

Open Google Chrome and navigate to:

```
chrome://extensions/
```

### Step 3 — Enable Developer Mode

In the top-right corner of the Extensions page, flip the **Developer mode** toggle **ON**.

### Step 4 — Load the extension

Click **"Load unpacked"** (top-left). In the file picker, select the `osint-gmail-extractor/` folder (not the ZIP — the folder itself).

### Step 5 — Confirm

The extension card **"OSINT Gmail Extractor"** should appear. The 🔍 icon will appear in your Chrome toolbar. If it's hidden, click the puzzle piece icon → pin OSINT Gmail Extractor.

> **No restart required.** The extension is live immediately.

---

## How to Use

### Basic workflow

1. **Go to DuckDuckGo** — `https://duckduckgo.com`
2. **Run a search** using an email-targeting dork (see below)
3. **Click the 🔍 extension icon** to open the popup
4. **Click `▶ Start Extracting`**
5. **Scroll down** the search results page — new results load automatically and are scanned instantly
6. Watch emails appear in the live list in real time
7. When done, click **`■ Stop`**
8. Export your results with **Copy All**, **↓ TXT**, or **↓ JSON**

### The popup at a glance

```
┌─────────────────────────────────────────┐
│ 🔍 OSINT Extractor          ● Running   │  ← Status badge
│    Gmail Hunter · DuckDuckGo SERP       │
├─────────────────────────────────────────┤
│  Emails Found        Session            │
│     42               03:17              │  ← Live counter + timer
├─────────────────────────────────────────┤
│  [ ▶ Start Extracting ]  [ ■ Stop ]     │  ← Controls
├─────────────────────────────────────────┤
│  [●] Highlight emails  [○] All providers│  ← Toggles
├─────────────────────────────────────────┤
│  ⚡ Live Results      [⊘ Dedup] [✕ Clear]│
│  ● someone@gmail.com            [copy]  │
│  ● another@gmail.com            [copy]  │
│  ● hello@gmail.com              [copy]  │
│  ...                                    │
├─────────────────────────────────────────┤
│  [⎘ Copy All]  [↓ TXT]  [↓ JSON]       │  ← Export bar
└─────────────────────────────────────────┘
```

---

## OSINT Dorks & Testing

Use these search queries on DuckDuckGo to find pages where people have posted their email addresses in titles or snippets:

### Gmail-specific dorks

```
"@gmail.com" "contact me"
"@gmail.com" "email me"
"@gmail.com" "reach me at"
"@gmail.com" resume
"@gmail.com" portfolio
"@gmail.com" "get in touch"
"@gmail.com" filetype:pdf
gmail.com inurl:contact
"@gmail.com" site:reddit.com
"@gmail.com" "my email is"
```

### Profession-targeted dorks

```
"@gmail.com" developer freelance
"@gmail.com" photographer portfolio
"@gmail.com" "open to work"
"@gmail.com" consultant services
```

### How to test immediately

1. Search: `"@gmail.com" "contact me"` on DuckDuckGo
2. Open the popup → Start Extracting
3. Scroll to the bottom of the results
4. You should see addresses populate in the list within seconds

> **Tip:** The more results DuckDuckGo loads (via scrolling), the more addresses you collect — without any extra clicks.

---

## Options & Toggles

### Highlight emails (default: ON)

When enabled, every email address found in the DuckDuckGo results page is wrapped in a green `<mark>` tag directly in the DOM. This makes it visually obvious which snippets contained email addresses without needing to look at the popup.

Implemented using a `TreeWalker` that safely operates on raw `Text` nodes — it never breaks the page's HTML structure.

### All providers (default: OFF)

By default the extension only captures `@gmail.com` addresses using this regex:

```
[a-zA-Z0-9._%+\-]+@gmail\.com
```

Enabling **All providers** switches to a broader regex that matches any email address:

```
[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}
```

This will also capture `@yahoo.com`, `@hotmail.com`, `@protonmail.com`, company domains, and so on. Expect a higher volume of results (and more noise).

### ⊘ Dedup button

Clicking this button immediately removes any duplicate addresses from the visible list, rebuilds the display, and shows a toast notification reporting how many were removed (e.g. `✓ Removed 5 duplicates`). If the list is already clean it shows `✓ No duplicates found`.

Deduplication also happens automatically and continuously — the `⊘ Dedup` button is for manually cleaning up edge cases.

---

## Export Options

### ⎘ Copy All

Copies all found email addresses to your clipboard as a newline-separated list, ready to paste into a spreadsheet, text editor, or database.

```
someone@gmail.com
another@gmail.com
hello@gmail.com
```

### ↓ TXT

Downloads a `.txt` file with one email per line. The filename includes a timestamp:

```
osint_emails_2025-06-15_14-32-07.txt
```

### ↓ JSON

Downloads a structured `.json` file with metadata:

```json
{
  "source": "DuckDuckGo SERP",
  "extracted": "2025-06-15T14:32:07.000Z",
  "count": 42,
  "emails": [
    "someone@gmail.com",
    "another@gmail.com",
    "hello@gmail.com"
  ]
}
```

This format is useful for importing into OSINT frameworks, databases, or feeding into further automation.

---

## How It Works (Technical)

### Content script injection

`content.js` is declared in `manifest.json` as a content script matching `https://duckduckgo.com/*`. Chrome injects it automatically at `document_idle` — after the initial DOM is ready.

### DOM targeting

DuckDuckGo search results use `data-testid="result"` as the primary container attribute. The extension queries a list of 9 selectors in priority order to stay resilient across DDG markup changes:

```javascript
const RESULT_SELECTORS = [
  '[data-testid="result"]',
  '[data-testid="result-title-a"]',
  '[data-testid="result-snippet"]',
  '.result__body',
  '.result__title',
  '.result__snippet',
  '.results--main article',
  '#links .result',
  '.web-result'
];
```

### Regex engine

Two patterns are available:

```javascript
// Gmail only (default)
const GMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@gmail\.com/gi;

// All providers
const ALL_EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi;
```

Both are case-insensitive (`i` flag). Matches are normalized to lowercase before storage.

### Three-layer deduplication

```
Layer 1 — content.js:
  foundEmails (Set)  →  never sends the same email twice

Layer 2 — popup.js listener:
  emailSet (Set)     →  drops any duplicate that arrives from content script

Layer 3 — ⊘ Dedup button:
  new Set(emails)    →  manual cleanup on demand, rebuilds the visible list
```

### MutationObserver (infinite scroll)

```javascript
observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      // Check if node is a result or contains results
      // Scan any new result containers found
    });
  });
});

observer.observe(document.body, { childList: true, subtree: true });
```

DuckDuckGo appends new result batches to `document.body` as the user scrolls. The observer fires for every DOM insertion, checks whether the new nodes contain result containers, and scans only the new ones — previously scanned nodes are tracked in a `WeakSet` to prevent re-processing.

### Node caching with WeakSet

```javascript
const scannedNodes = new WeakSet();

function scanNode(node) {
  if (scannedNodes.has(node)) return; // already processed — skip
  scannedNodes.add(node);
  // ... extract emails
}
```

`WeakSet` is used (not `Set`) because it holds weak references — nodes that are removed from the DOM will be garbage-collected automatically, preventing memory leaks during long sessions.

### Message passing

```
popup.js  →  chrome.tabs.sendMessage()  →  content.js
             { type: "START" / "STOP" / "GET_EMAILS" / "CLEAR" }

content.js →  chrome.runtime.sendMessage()  →  popup.js
              { type: "NEW_EMAILS", emails: [...], total: N }
```

---

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the URL of the current tab to verify it's DuckDuckGo |
| `scripting` | Inject `content.js` into the tab if it wasn't auto-injected |
| `downloads` | Save TXT and JSON export files to the user's Downloads folder |
| `storage` | Remember whether extraction was running if the popup closes and reopens |
| `host_permissions: duckduckgo.com/*` | Allow the content script to run on DuckDuckGo pages |

The extension requests **no** access to browsing history, cookies, identity, clipboard (beyond what the user explicitly triggers), or any other sensitive API.

---

## Privacy & Ethics

- **No data leaves your machine.** The extension makes zero network requests. Everything happens locally in your browser.
- **No external websites are visited.** The extension reads only what DuckDuckGo has already rendered on screen.
- **No analytics or telemetry.** There is no tracking code of any kind.
- **Intended for lawful OSINT research only.** Email addresses collected from public search results may still be subject to data protection regulations (GDPR, CAN-SPAM, etc.) in your jurisdiction. Always ensure your use case complies with applicable laws and platform terms of service.
- **Respect people's privacy.** Just because an email is publicly indexed does not mean it is appropriate to use it for unsolicited contact.

---

## Troubleshooting

### "No emails found" even after scrolling

- Make sure you are on `https://duckduckgo.com/` and not a different search engine.
- Try a dork that more explicitly exposes email addresses (e.g. `"@gmail.com" "contact"`).
- Click `■ Stop` then `▶ Start Extracting` again to re-trigger the initial scan.
- DuckDuckGo may have updated its markup — check the browser console on a results page for any extension errors and report them.

### The popup says "Navigate to DuckDuckGo first"

The extension only works on `https://duckduckgo.com/*`. Open a DuckDuckGo search results page first, then click the extension icon.

### Emails appear in the SERP but not in the popup

- Make sure you clicked `▶ Start Extracting` — the extension does not run passively.
- Close and reopen the popup — it re-syncs with the content script on open.
- Check `chrome://extensions/` → OSINT Gmail Extractor → Errors for any permission issues.

### Download buttons do nothing

Make sure the `downloads` permission is granted. Go to `chrome://extensions/` → OSINT Gmail Extractor → Details → ensure no permissions have been manually revoked.

### Extension stops working after a Chrome update

Reload the extension: go to `chrome://extensions/` → OSINT Gmail Extractor → click the reload icon (↺).

---

## Limitations

- **Only reads rendered text.** If an email address is inside an image, behind JavaScript that hasn't executed, or in a collapsed element, it won't be found.
- **DuckDuckGo markup changes.** If DDG updates its HTML structure, selector targeting may need updating. The extension includes 9 fallback selectors to reduce this risk.
- **No pagination bypass.** The extension scans what is visible. DuckDuckGo's infinite scroll must be triggered manually by scrolling.
- **Gmail snippet truncation.** DuckDuckGo sometimes truncates result snippets mid-address (e.g. `user@gmai...`). These will not match the regex.
- **No background scanning.** The extension only runs while the popup is open and `Start Extracting` has been clicked. It does not run silently in the background between sessions.

---

## Changelog

### v1.0.0
- Initial release
- Gmail-only regex extraction from DuckDuckGo SERP titles and snippets
- MutationObserver for infinite scroll support
- Email highlighting in the SERP via TreeWalker
- All-providers toggle
- Copy All, Download TXT, Download JSON export
- Session timer
- Three-layer deduplication: content script `Set`, popup `Set`, manual `⊘ Dedup` button
- Manifest V3 compliant
- Zero external dependencies

---

*Built for OSINT researchers. Use responsibly.*
