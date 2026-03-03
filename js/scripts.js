/* =========================
   VisionForge AI - scripts.js
   Shared JS across all pages
========================= */

/* ---------- Toast ---------- */
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;

  t.textContent = msg;
  t.style.display = "block";

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 2200);
}

/* Expose toast to React page and other pages */
window.vfToast = showToast;

/* ---------- Copy Email ---------- */
function copyEmail() {
  const email = "hello@visionforge.ai";

  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    // Fallback: try prompt if clipboard blocked
    try {
      window.prompt("Copy this email:", email);
      showToast("Clipboard blocked — use the prompt to copy.");
    } catch {
      showToast("Copy failed.");
    }
    return;
  }

  navigator.clipboard
    .writeText(email)
    .then(() => showToast("Copied: " + email))
    .catch(() => showToast("Copy failed (browser blocked)."));
}

window.copyEmail = copyEmail;

/* ---------- Smooth scroll for internal anchors ---------- */
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[data-scroll="true"]');
  if (!a) return;

  const href = a.getAttribute("href");
  if (!href || !href.startsWith("#")) return;

  const target = document.querySelector(href);
  if (!target) return;

  e.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- Contact form interaction (Project 1 JS #2) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  const status = document.getElementById("formStatus");
  const clearBtn = document.getElementById("clearBtn");

  // Only run this logic on contact.html (when form exists)
  if (!form) return;

  function setStatus(message, type) {
    if (!status) return;
    status.textContent = message;

    // simple color feedback
    if (type === "error") {
      status.style.color = "#ffb3b3";
    } else if (type === "success") {
      status.style.color = "#b7ffcf";
    } else {
      status.style.color = "rgba(255,255,255,0.7)";
    }
  }

  function getValue(id) {
    const el = document.getElementById(id);
    return (el?.value || "").trim();
  }

  function isValidEmail(email) {
    // simple validation (good enough for project demo)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = getValue("cName");
    const email = getValue("cEmail");
    const subject = getValue("cSubject");
    const message = getValue("cMessage");

    if (!name || !email || !subject || !message) {
      setStatus("Please fill out all fields.", "error");
      showToast("Missing fields — please complete the form.");
      return;
    }

    if (!isValidEmail(email)) {
      setStatus("Please enter a valid email address.", "error");
      showToast("Invalid email address.");
      return;
    }

    setStatus("Message sent (demo). We’ll get back to you soon.", "success");
    showToast("Message sent (demo).");

    form.reset();
  });

  clearBtn?.addEventListener("click", () => {
    form.reset();
    setStatus("", "neutral");
    showToast("Cleared.");
  });
});