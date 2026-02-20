function showToast(msg){
  const t = document.getElementById("toast");
  if(!t) return;
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>{ t.style.display="none"; }, 2200);
}

function copyEmail(){
  const email = "hello@visionforge.ai";
  navigator.clipboard.writeText(email)
    .then(()=>showToast("Copied: " + email))
    .catch(()=>showToast("Copy failed (browser blocked)."));
}

document.addEventListener("click", (e)=>{
  const a = e.target.closest('a[data-scroll="true"]');
  if(!a) return;
  const id = a.getAttribute("href");
  if(id && id.startsWith("#")){
    e.preventDefault();
    document.querySelector(id)?.scrollIntoView({behavior:"smooth"});
  }
});

// Contact form + small interactions

document.addEventListener("DOMContentLoaded", () => {
  // CONTACT FORM (fake submit for Project 1)
  const form = document.getElementById("contactForm");
  const status = document.getElementById("formStatus");
  const clearBtn = document.getElementById("clearBtn");

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      // simple validation
      const requiredIds = ["cName", "cEmail", "cSubject", "cMessage"];
      const missing = requiredIds.some((id) => !document.getElementById(id).value.trim());

      if (missing) {
        status.textContent = "Please fill out all fields.";
        status.style.color = "#ffb3b3";
        return;
      }

      status.textContent = "Message sent (demo). We’ll get back to you soon.";
      status.style.color = "#b7ffcf";
      form.reset();
    });

    clearBtn?.addEventListener("click", () => {
      form.reset();
      status.textContent = "";
    });
  }

  // COPY EMAIL BUTTON
  const copyBtn = document.getElementById("copyEmailBtn");
  const emailEl = document.getElementById("companyEmail");
  const toast = document.getElementById("miniToast");

  if (copyBtn && emailEl && toast) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(emailEl.textContent.trim());
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 1200);
      } catch (err) {
        // fallback
        alert("Copy failed. Email: " + emailEl.textContent.trim());
      }
    });
  }
});