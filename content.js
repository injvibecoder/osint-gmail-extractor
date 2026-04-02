/**
 * content.js — OSINT Gmail Extractor
 * ─────────────────────────────────────────────────────────────
 * Runs on https://duckduckgo.com/* only.
 * Scans visible SERP content (titles + snippets) for email addresses.
 * Uses MutationObserver to catch dynamically loaded results (infinite scroll).
 * NEVER fetches or visits any external URL.
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  // ── State ────────────────────────────────────────────────────
  let isRunning = false;
  let observer = null;
  let highlightEnabled = true;
  let allEmailsMode = false; // false = gmail only, true = all providers

  /**
   * Set of already-seen DOM nodes (WeakSet keeps memory clean).
   * Prevents re-scanning the same element twice.
   */
  const scannedNodes = new WeakSet();

  /**
   * Set of unique email addresses found so far.
   */
  const foundEmails = new Set();

  // ── Regex Patterns ───────────────────────────────────────────

  /** Gmail-only regex */
  const GMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@gmail\.com/gi;

  /** All email providers regex */
  const ALL_EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi;

  // ── DuckDuckGo result selectors (ordered by priority) ────────
  /**
   * DuckDuckGo uses data-testid="result" as the main container.
   * We also fall back to common class-based selectors in case DDG updates its markup.
   */
  const RESULT_SELECTORS = [
    '[data-testid="result"]',
    '[data-testid="result-title-a"]',
    '[data-testid="result-snippet"]',
    ".result__body",
    ".result__title",
    ".result__snippet",
    ".results--main article",
    "#links .result",
    ".web-result"
  ];

  // ── Core: Extract emails from a text string ──────────────────

  /**
   * Returns an array of unique email addresses found in the given text.
   * @param {string} text
   * @returns {string[]}
   */
  function extractEmailsFromText(text) {
    const pattern = allEmailsMode ? ALL_EMAIL_REGEX : GMAIL_REGEX;
    // Reset lastIndex since we reuse the regex object
    pattern.lastIndex = 0;
    const matches = text.match(pattern) || [];
    // Normalize to lowercase to deduplicate "Test@Gmail.com" vs "test@gmail.com"
    return [...new Set(matches.map((e) => e.toLowerCase()))];
  }

  // ── Core: Scan a single DOM node ────────────────────────────

  /**
   * Extracts emails from a DOM node's visible text content.
   * Skips nodes already scanned. Highlights new emails if enabled.
   * @param {Element} node
   */
  function scanNode(node) {
    if (!node || scannedNodes.has(node)) return;
    scannedNodes.add(node);

    const text = node.innerText || node.textContent || "";
    const emails = extractEmailsFromText(text);

    if (emails.length === 0) return;

    let newEmails = [];
    emails.forEach((email) => {
      if (!foundEmails.has(email)) {
        foundEmails.add(email);
        newEmails.push(email);
      }
    });

    if (newEmails.length > 0) {
      // Highlight in the DOM if enabled
      if (highlightEnabled) {
        highlightEmailsInNode(node, newEmails);
      }

      // Notify popup about the new emails
      chrome.runtime.sendMessage({
        type: "NEW_EMAILS",
        emails: newEmails,
        total: foundEmails.size,
      });
    }
  }

  // ── Core: Scan all current result containers ─────────────────

  /**
   * Queries all matching result containers on the current page and scans each.
   */
  function scanAllResults() {
    RESULT_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach(scanNode);
    });
  }

  // ── Highlight: Wrap matched emails in a <mark> span ──────────

  /**
   * Walks text nodes inside `rootNode` and wraps found email addresses
   * in a highlight span. Works on raw Text nodes to avoid breaking HTML structure.
   * @param {Element} rootNode
   * @param {string[]} emails - lowercase email list to highlight
   */
  function highlightEmailsInNode(rootNode, emails) {
    if (!rootNode || emails.length === 0) return;

    // Build a combined regex for this batch of new emails
    const escapedEmails = emails.map((e) =>
      e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const pattern = new RegExp(`(${escapedEmails.join("|")})`, "gi");

    /**
     * Recursively walk child nodes looking for Text nodes.
     * We collect them first to avoid mutating the tree while iterating.
     */
    const textNodes = [];
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Skip script/style/already-highlighted nodes
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
          return NodeFilter.FILTER_REJECT;
        if (parent.classList && parent.classList.contains("osint-highlight"))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      if (pattern.test(node.nodeValue)) {
        textNodes.push(node);
      }
    }

    textNodes.forEach((textNode) => {
      const parent = textNode.parentNode;
      if (!parent) return;
      const parts = textNode.nodeValue.split(pattern);
      if (parts.length <= 1) return;

      const fragment = document.createDocumentFragment();
      parts.forEach((part) => {
        if (part.match(pattern)) {
          const mark = document.createElement("mark");
          mark.className = "osint-highlight";
          mark.style.cssText = `
            background: rgba(0, 255, 136, 0.25);
            color: #00ff88;
            border-radius: 2px;
            padding: 0 2px;
            font-weight: bold;
            outline: 1px solid rgba(0, 255, 136, 0.5);
          `;
          mark.textContent = part;
          fragment.appendChild(mark);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });

      parent.replaceChild(fragment, textNode);
    });
  }

  // ── MutationObserver: Watch for new results ──────────────────

  /**
   * Starts watching the SERP container for newly injected result nodes.
   * DuckDuckGo appends new result batches when the user scrolls down.
   */
  function startObserver() {
    if (observer) return; // Already watching

    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          // Check if this added node is itself a result container
          const isResult = RESULT_SELECTORS.some(
            (sel) => node.matches && node.matches(sel)
          );
          if (isResult) {
            scanNode(node);
          } else {
            // Check if new children contain result containers
            RESULT_SELECTORS.forEach((sel) => {
              node.querySelectorAll && node.querySelectorAll(sel).forEach(scanNode);
            });
          }
        });
      });
    });

    // Watch the entire body — DDG may inject results anywhere inside #links or body
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Stops the MutationObserver.
   */
  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ── Message Handler: Listen to popup commands ────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {

      case "START": {
        isRunning = true;
        highlightEnabled = message.highlightEnabled ?? true;
        allEmailsMode = message.allEmailsMode ?? false;
        // Do an initial scan of already-visible results
        scanAllResults();
        // Then watch for new results
        startObserver();
        sendResponse({
          status: "started",
          emails: [...foundEmails],
          total: foundEmails.size,
        });
        break;
      }

      case "STOP": {
        isRunning = false;
        stopObserver();
        sendResponse({ status: "stopped" });
        break;
      }

      case "GET_EMAILS": {
        sendResponse({
          emails: [...foundEmails],
          total: foundEmails.size,
          isRunning,
        });
        break;
      }

      case "CLEAR": {
        foundEmails.clear();
        sendResponse({ status: "cleared" });
        break;
      }

      case "SET_OPTIONS": {
        highlightEnabled = message.highlightEnabled ?? highlightEnabled;
        allEmailsMode = message.allEmailsMode ?? allEmailsMode;
        sendResponse({ status: "options_updated" });
        break;
      }

      default:
        sendResponse({ status: "unknown_message" });
    }

    // Return true to allow async sendResponse
    return true;
  });

  // ── Auto-resume if extension was already running ─────────────
  // (e.g. user navigated to a new DDG page)
  chrome.storage.local.get("isRunning", (data) => {
    if (data.isRunning) {
      isRunning = true;
      scanAllResults();
      startObserver();
    }
  });
})();
