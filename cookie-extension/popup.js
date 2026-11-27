// Account Manager Direct Sync Popup Script

const SERVICES = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    patterns: ["chatgpt.com", "chat.openai.com", "openai.com"],
    domains: ["chatgpt.com", "openai.com"]
  },
  {
    id: "claude",
    name: "Claude",
    patterns: ["claude.ai", "anthropic.com"],
    domains: ["claude.ai", "anthropic.com"]
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    patterns: ["deepseek.com", "chat.deepseek.com"],
    domains: ["deepseek.com", "chat.deepseek.com"]
  },
  {
    id: "muse",
    name: "Muse · Meta",
    patterns: ["muse.ai", "meta.com", "accountscenter.meta.com"],
    domains: ["muse.ai", "meta.com", "accountscenter.meta.com", "facebook.com", "instagram.com"]
  },
  {
    id: "hark",
    name: "Hark",
    patterns: ["hark.com", "app.hark.com"],
    domains: ["hark.com", "app.hark.com"]
  }
];

let currentCookies = [];
let detectedService = null;
let appPort = 28888;
let isAppOnline = false;

async function checkAppConnection() {
  const connBox = document.getElementById("app-conn-box");
  const connText = document.getElementById("conn-text");
  const syncBtn = document.getElementById("direct-sync-btn");

  const ports = [28888, 28889];
  for (const port of ports) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        appPort = port;
        isAppOnline = true;
        connBox.className = "conn-box online";
        connText.textContent = `🟢 Connected to Desktop App (v${data.version || "0.2.1"})`;
        syncBtn.disabled = false;
        return;
      }
    } catch (_) {}
  }

  isAppOnline = false;
  connBox.className = "conn-box offline";
  connText.textContent = "⚪ Desktop App Offline (Open app to 1-Click Sync)";
  syncBtn.disabled = true;
}

function extractEmailFromCookies(cookies) {
  // 1. ChatGPT NextAuth JWT token
  const nextAuth = cookies.find(c => c.name.includes("session-token"));
  if (nextAuth && nextAuth.value) {
    try {
      const parts = nextAuth.value.split(".");
      if (parts.length >= 2) {
        const payloadStr = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(payloadStr);
        if (payload?.user?.email) return payload.user.email;
        if (payload?.email) return payload.email;
        if (payload?.user?.name) return payload.user.name;
      }
    } catch (_) {}
  }

  // 2. Claude email/user detection
  const claudeEmail = cookies.find(c => c.name.toLowerCase().includes("email") || c.name === "user_email");
  if (claudeEmail && claudeEmail.value && claudeEmail.value.includes("@")) {
    return decodeURIComponent(claudeEmail.value);
  }

  // 3. Generic email search in cookies
  for (const c of cookies) {
    try {
      const val = decodeURIComponent(c.value);
      if (val.includes("@") && /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/.test(val.trim())) {
        return val.trim();
      }
    } catch (_) {}
  }

  return "";
}

async function init() {
  try {
    checkAppConnection();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      showError("Cannot access current tab URL.");
      return;
    }

    const url = new URL(tab.url);
    const host = url.hostname.toLowerCase();

    // Detect matched service
    detectedService = SERVICES.find(s => s.patterns.some(p => host.includes(p)));

    let targetDomains = [];
    const badge = document.getElementById("service-badge");
    if (detectedService) {
      targetDomains = detectedService.domains;
      badge.textContent = detectedService.name;
      badge.classList.add("active-service");
    } else {
      const parts = host.split(".");
      const rootDomain = parts.length > 2 ? parts.slice(-2).join(".") : host;
      targetDomains = [host, rootDomain];
      badge.textContent = host;
      detectedService = { id: "generic", name: host, domains: targetDomains };
    }

    // Render domain pills
    const domainsListEl = document.getElementById("domains-list");
    domainsListEl.innerHTML = targetDomains
      .map(d => `<span class="domain-pill">${escapeHtml(d)}</span>`)
      .join("");

    // Fetch cookies
    currentCookies = await fetchCookiesForDomains(targetDomains);
    document.getElementById("cookie-count").textContent = currentCookies.length;

    // Detect Email / Account Alias
    const detectedEmail = extractEmailFromCookies(currentCookies);
    const aliasInput = document.getElementById("account-alias");
    if (detectedEmail) {
      aliasInput.value = detectedEmail;
    } else if (tab.title && !tab.title.includes("http")) {
      const cleanTitle = tab.title.split(/[-|–—]/)[0].trim();
      aliasInput.value = cleanTitle || "Active Account";
    } else {
      aliasInput.value = "Active Account";
    }

    if (currentCookies.length === 0) {
      showToast("No active login cookies found. Please make sure you are logged in.", "error");
    }
  } catch (err) {
    showError("Failed to initialize: " + err.message);
  }
}

async function fetchCookiesForDomains(domains) {
  const seen = new Set();
  const result = [];

  for (const domain of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      for (const c of cookies) {
        const key = `${c.name}|${c.domain}|${c.path}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: formatSameSite(c.sameSite),
            expirationDate: c.expirationDate || undefined
          });
        }
      }
    } catch (err) {
      console.warn("Failed getting cookies for domain:", domain, err);
    }
  }

  return result;
}

function formatSameSite(sameSite) {
  if (sameSite === "no_restriction") return "None";
  if (sameSite === "lax") return "Lax";
  if (sameSite === "strict") return "Strict";
  return undefined;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function showToast(msg, type = "success") {
  const toast = document.getElementById("status-toast");
  toast.textContent = msg;
  toast.hidden = false;
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}

function showError(msg) {
  showToast(msg, "error");
}

// 1-Click Direct Sync Handler
document.getElementById("direct-sync-btn").addEventListener("click", async () => {
  if (currentCookies.length === 0) {
    showToast("No cookies to sync. Make sure you are logged in.", "error");
    return;
  }

  const syncBtn = document.getElementById("direct-sync-btn");
  const btnText = document.getElementById("sync-btn-text");
  const aliasVal = document.getElementById("account-alias").value.trim() || "Active Account";
  const providerId = detectedService?.id || "chatgpt";

  try {
    syncBtn.disabled = true;
    btnText.textContent = "Syncing...";

    const res = await fetch(`http://127.0.0.1:${appPort}/api/sync-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        provider: providerId,
        alias: aliasVal,
        cookies: currentCookies
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      btnText.textContent = "✓ Synced to App!";
      showToast(`🎉 ${data.action === "updated" ? "Updated" : "Added"} "${data.alias || aliasVal}" in Account Manager!`);
      setTimeout(() => {
        btnText.textContent = "1-Click Sync to App";
        syncBtn.disabled = false;
      }, 3000);
    } else {
      throw new Error(data.error || "Failed to sync with Desktop App");
    }
  } catch (err) {
    btnText.textContent = "1-Click Sync to App";
    syncBtn.disabled = false;
    showToast(`Sync error: ${err.message}`, "error");
  }
});

// Fallback Copy to Clipboard
document.getElementById("copy-btn").addEventListener("click", async () => {
  if (currentCookies.length === 0) {
    showToast("No cookies to copy. Make sure you are logged in.", "error");
    return;
  }

  try {
    const jsonStr = JSON.stringify(currentCookies, null, 2);
    await navigator.clipboard.writeText(jsonStr);
    showToast(`✓ Copied ${currentCookies.length} cookies to clipboard!`);
  } catch (err) {
    showError("Clipboard copy failed: " + err.message);
  }
});

document.addEventListener("DOMContentLoaded", init);
