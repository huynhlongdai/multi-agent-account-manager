// Account Manager Cookie Exporter Popup Script

const SERVICES = [
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
  },
  {
    id: "claude",
    name: "Claude · Anthropic",
    patterns: ["claude.ai", "anthropic.com"],
    domains: ["claude.ai", "anthropic.com"]
  },
  {
    id: "chatgpt",
    name: "ChatGPT · OpenAI",
    patterns: ["chatgpt.com", "openai.com"],
    domains: ["chatgpt.com", "openai.com"]
  }
];

let currentCookies = [];
let detectedService = null;

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      showError("Cannot access current tab URL.");
      return;
    }

    const url = new URL(tab.url);
    const host = url.hostname.toLowerCase();

    document.getElementById("tab-url").textContent = url.hostname;

    // Detect matched service
    detectedService = SERVICES.find(s => s.patterns.some(p => host.includes(p)));

    let targetDomains = [];
    if (detectedService) {
      targetDomains = detectedService.domains;
      const badge = document.getElementById("service-badge");
      badge.textContent = detectedService.name;
      badge.classList.add("active-service");
    } else {
      // Fallback: use root domain and subdomains
      const parts = host.split(".");
      const rootDomain = parts.length > 2 ? parts.slice(-2).join(".") : host;
      targetDomains = [host, rootDomain];
      document.getElementById("service-badge").textContent = host;
    }

    // Render domain pills
    const domainsListEl = document.getElementById("domains-list");
    domainsListEl.innerHTML = targetDomains
      .map(d => `<span class="domain-pill">${escapeHtml(d)}</span>`)
      .join("");

    // Fetch cookies across all target domains
    currentCookies = await fetchCookiesForDomains(targetDomains);
    document.getElementById("cookie-count").textContent = currentCookies.length;

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

document.getElementById("copy-btn").addEventListener("click", async () => {
  if (currentCookies.length === 0) {
    showToast("No cookies to copy. Make sure you are logged in.", "error");
    return;
  }

  try {
    const jsonStr = JSON.stringify(currentCookies, null, 2);
    await navigator.clipboard.writeText(jsonStr);
    showToast(`✓ Copied ${currentCookies.length} cookies! Paste in Account Manager.`);
  } catch (err) {
    showError("Failed to copy to clipboard: " + err.message);
  }
});

document.getElementById("download-btn").addEventListener("click", () => {
  if (currentCookies.length === 0) {
    showToast("No cookies to export.", "error");
    return;
  }

  try {
    const jsonStr = JSON.stringify(currentCookies, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const serviceTag = detectedService ? detectedService.id : "cookies";
    a.href = url;
    a.download = `account-manager-${serviceTag}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("✓ Downloaded cookies JSON file!");
  } catch (err) {
    showError("Failed to download file: " + err.message);
  }
});

document.addEventListener("DOMContentLoaded", init);
