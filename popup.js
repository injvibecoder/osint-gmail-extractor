/**
 * popup.js — OSINT Gmail Extractor
 * ─────────────────────────────────────────────────────────────
 * Handles the popup UI:
 *  - Start / Stop extraction
 *  - Live updating email list
 *  - Copy All / Download TXT / Download JSON
 *  - Session timer
 *  - Options (highlight toggle, all-providers toggle)
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  // ── DOM refs ──────────────────────────────────────────────
  const btnStart        = document.getElementById("btnStart");
  const btnStop         = document.getElementById("btnStop");
  const btnClear        = document.getElementById("btnClear");
  const btnDedup        = document.getElementById("btnDedup");
  const btnCopyAll      = document.getElementById("btnCopyAll");
  const btnDownloadTXT  = document.getElementById("btnDownloadTXT");
  const btnDownloadJSON = document.getElementById("btnDownloadJSON");
  const emailList       = document.getElementById("emailList");
  const emptyState      = document.getElementById("emptyState");
  const counterValue    = document.getElementById("counterValue");
  const statusBadge     = document.getElementById("statusBadge");
  const sessionTime     = document.getElementById("sessionTime");
  const warningBar      = document.getElementById("warningBar");
  const toggleHighlight = document.getElementById("toggleHighlight");
  const toggleAllEmails = document.getElementById("toggleAllEmails");
  const toast           = document.getElementById("toast");

  // ── State ─────────────────────────────────────────────────
  /**
   * emailSet  — the single source of truth; a Set guarantees uniqueness.
   * emails    — ordered array derived from emailSet (insertion order).
   * Using both gives us O(1) duplicate checks AND a stable display order.
   */
  let emailSet = new Set();  // fast O(1) dedup
  let emails   = [];         // ordered list for display/export
  let isRunning = false;
  let sessionStart = null;   // Date when extraction started
  let timerInterval = null;

  // ── Helpers ───────────────────────────────────────────────

  /**
   * Shows a temporary toast message.
   * @param {string} msg
   */
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  }

  /**
   * Updates the counter display with a brief animation.
   * @param {number} count
   */
  function updateCounter(count) {
    counterValue.textContent = count;
    counterValue.classList.add("new");
    setTimeout(() => counterValue.classList.remove("new"), 400);
  }

  /**
   * Formats seconds as MM:SS.
   * @param {number} totalSeconds
   * @returns {string}
   */
  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  /**
   * Starts the session timer display.
   */
  function startTimer() {
    sessionStart = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      sessionTime.textContent = formatTime(elapsed);
    }, 1000);
  }

  /**
   * Stops the session timer.
   */
  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  /**
   * Updates the status badge appearance and text.
   * @param {'idle'|'running'|'stopped'} state
   */
  function setStatus(state) {
    statusBadge.className = `status-badge ${state}`;
    statusBadge.textContent = {
      idle:    "Idle",
      running: "● Running",
      stopped: "Stopped",
    }[state] || "Idle";
  }

  // ── Email list rendering ───────────────────────────────────

  /**
   * Creates and inserts a new email list item at the top of the list.
   * @param {string} email
   */
  function addEmailToList(email) {
    // Hide empty state
    if (emptyState && emptyState.parentElement) {
      emptyState.parentElement.remove();
    }

    const li = document.createElement("li");
    li.className = "email-item";
    li.dataset.email = email;

    const dot  = document.createElement("div");
    dot.className = "email-dot";

    const text = document.createElement("span");
    text.className = "email-text";
    text.textContent = email;

    const copyBtn = document.createElement("button");
    copyBtn.className = "email-copy-btn";
    copyBtn.textContent = "copy";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(email).then(() => {
        copyBtn.textContent = "✓";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "copy";
          copyBtn.classList.remove("copied");
        }, 1500);
      });
    });

    li.appendChild(dot);
    li.appendChild(text);
    li.appendChild(copyBtn);

    // Prepend so newest email appears at the top
    emailList.insertBefore(li, emailList.firstChild);
  }

  /**
   * Rebuilds the email list from scratch (used after clear or on load).
   * Always re-syncs emailSet from the emails array to keep them in lockstep.
   */
  function rebuildList() {
    // Re-sync Set from array (handles load-from-content-script case)
    emailSet = new Set(emails.map(e => e.toLowerCase().trim()));
    emails   = [...emailSet]; // re-derive ordered deduped array

    emailList.innerHTML = "";

    if (emails.length === 0) {
      const li = document.createElement("li");
      li.className = "email-item";
      li.style.display = "block";
      li.style.padding = "0";
      li.innerHTML = `
        <div class="empty-state" id="emptyState">
          <div class="empty-icon">📭</div>
          <div class="empty-text">
            No emails found yet.<br/>
            Start extracting on a DuckDuckGo<br/>search results page.
          </div>
        </div>`;
      emailList.appendChild(li);
      return;
    }

    // Add all emails (newest first)
    [...emails].reverse().forEach(addEmailToList);
    counterValue.textContent = emails.length;
  }

  // ── Tab helpers ───────────────────────────────────────────

  /**
   * Returns the current active tab.
   * @returns {Promise<chrome.tabs.Tab>}
   */
  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]);
      });
    });
  }

  /**
   * Returns true if the tab URL is a DuckDuckGo page.
   * @param {string} url
   * @returns {boolean}
   */
  function isDuckDuckGo(url) {
    return url && url.startsWith("https://duckduckgo.com/");
  }

  /**
   * Sends a message to the content script in the given tab.
   * @param {number} tabId
   * @param {object} message
   * @returns {Promise<any>}
   */
  function sendToContent(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          // Content script may not be injected yet — inject it
          chrome.scripting.executeScript(
            { target: { tabId }, files: ["content.js"] },
            () => {
              // Retry once after injection
              chrome.tabs.sendMessage(tabId, message, (r) => resolve(r));
            }
          );
        } else {
          resolve(response);
        }
      });
    });
  }

  // ── Initialise popup ──────────────────────────────────────

  async function init() {
    const tab = await getActiveTab();

    if (!isDuckDuckGo(tab.url)) {
      warningBar.style.display = "block";
      btnStart.disabled = true;
      btnStop.disabled = true;
      return;
    }

    // Fetch current state from content script
    const response = await sendToContent(tab.id, { type: "GET_EMAILS" });

    if (response) {
      emails = response.emails || [];
      isRunning = response.isRunning || false;
      rebuildList();

      if (isRunning) {
        setStatus("running");
        btnStart.disabled = true;
        btnStop.disabled = false;
        startTimer();
      } else {
        setStatus(emails.length > 0 ? "stopped" : "idle");
      }
    }
  }

  // ── Button: Start ──────────────────────────────────────────

  btnStart.addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (!isDuckDuckGo(tab.url)) {
      showToast("⚠ Navigate to DuckDuckGo first!");
      return;
    }

    const response = await sendToContent(tab.id, {
      type: "START",
      highlightEnabled: toggleHighlight.checked,
      allEmailsMode: toggleAllEmails.checked,
    });

    if (response) {
      isRunning = true;
      emails = response.emails || [];
      rebuildList();
      setStatus("running");
      btnStart.disabled = true;
      btnStop.disabled = false;
      startTimer();
      chrome.storage.local.set({ isRunning: true });
      showToast("▶ Extraction started");
    }
  });

  // ── Button: Stop ───────────────────────────────────────────

  btnStop.addEventListener("click", async () => {
    const tab = await getActiveTab();
    await sendToContent(tab.id, { type: "STOP" });

    isRunning = false;
    setStatus(emails.length > 0 ? "stopped" : "idle");
    btnStart.disabled = false;
    btnStop.disabled = true;
    stopTimer();
    chrome.storage.local.set({ isRunning: false });
    showToast("■ Extraction stopped");
  });

  // ── Button: Remove Duplicates ─────────────────────────────

  /**
   * Deduplicates the email list in real-time.
   * Normalises every address to lowercase, collapses duplicates,
   * rebuilds the visible list, and shows a toast with the removed count.
   */
  btnDedup.addEventListener("click", () => {
    if (emails.length === 0) { showToast("No emails to deduplicate"); return; }

    const before = emails.length;

    // Normalise → deduplicate via Set → back to array
    const deduped = [...new Set(emails.map(e => e.toLowerCase().trim()))];
    const removed = before - deduped.length;

    // Update shared state
    emails   = deduped;
    emailSet = new Set(deduped);

    // Rebuild the visible list
    rebuildList();
    updateCounter(emails.length);

    // Flash the button and show result
    btnDedup.classList.remove("flash");
    void btnDedup.offsetWidth; // force reflow to restart animation
    btnDedup.classList.add("flash");

    if (removed > 0) {
      showToast(`✓ Removed ${removed} duplicate${removed > 1 ? "s" : ""}`);
    } else {
      showToast("✓ No duplicates found");
    }
  });

  // ── Button: Clear ──────────────────────────────────────────

  btnClear.addEventListener("click", async () => {
    if (emails.length === 0) return;

    const tab = await getActiveTab();
    if (isDuckDuckGo(tab.url)) {
      await sendToContent(tab.id, { type: "CLEAR" });
    }

    emails   = [];
    emailSet = new Set();
    rebuildList();
    counterValue.textContent = "0";
    sessionTime.textContent = "00:00";
    stopTimer();
    if (isRunning) startTimer(); // Reset session clock if still running
    showToast("✕ Cleared");
  });

  // ── Toggle options ─────────────────────────────────────────

  async function sendOptions() {
    const tab = await getActiveTab();
    if (isDuckDuckGo(tab.url)) {
      await sendToContent(tab.id, {
        type: "SET_OPTIONS",
        highlightEnabled: toggleHighlight.checked,
        allEmailsMode: toggleAllEmails.checked,
      });
    }
  }
  toggleHighlight.addEventListener("change", sendOptions);
  toggleAllEmails.addEventListener("change", sendOptions);

  // ── Button: Copy All ───────────────────────────────────────

  btnCopyAll.addEventListener("click", () => {
    if (emails.length === 0) { showToast("Nothing to copy"); return; }
    navigator.clipboard.writeText(emails.join("\n")).then(() => {
      showToast(`✓ Copied ${emails.length} email(s)`);
    });
  });

  // ── Button: Download TXT ───────────────────────────────────

  btnDownloadTXT.addEventListener("click", () => {
    if (emails.length === 0) { showToast("Nothing to download"); return; }
    const content = emails.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const filename = `osint_emails_${timestamp()}.txt`;
    chrome.downloads.download({ url, filename, saveAs: false });
    showToast(`↓ Downloading ${filename}`);
  });

  // ── Button: Download JSON ──────────────────────────────────

  btnDownloadJSON.addEventListener("click", () => {
    if (emails.length === 0) { showToast("Nothing to download"); return; }
    const data = {
      source:    "DuckDuckGo SERP",
      extracted: new Date().toISOString(),
      count:     emails.length,
      emails:    emails,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const filename = `osint_emails_${timestamp()}.json`;
    chrome.downloads.download({ url, filename, saveAs: false });
    showToast(`↓ Downloading ${filename}`);
  });

  /**
   * Returns a filesystem-safe timestamp string.
   * @returns {string}
   */
  function timestamp() {
    return new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
  }

  // ── Runtime message listener (from content.js) ─────────────

  /**
   * Content script sends NEW_EMAILS messages when new addresses are found.
   */
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "NEW_EMAILS" && Array.isArray(message.emails)) {
      message.emails.forEach((email) => {
        const normalized = email.toLowerCase().trim();
        if (!emailSet.has(normalized)) {       // O(1) Set-based dedup
          emailSet.add(normalized);
          emails.push(normalized);
          addEmailToList(normalized);
        }
        // duplicate → silently dropped
      });
      updateCounter(emails.length);
    }
  });

  // ── Boot ───────────────────────────────────────────────────
  init();
})();
