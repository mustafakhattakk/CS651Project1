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
        if (status) {
          status.textContent = "Please fill out all fields.";
          status.style.color = "#ffb3b3";
        }
        return;
      }

      if (status) {
        status.textContent = "Message sent (demo). We’ll get back to you soon.";
        status.style.color = "#b7ffcf";
      }
      form.reset();
    });

    clearBtn?.addEventListener("click", () => {
      form.reset();
      if (status) status.textContent = "";
    });
  }
});