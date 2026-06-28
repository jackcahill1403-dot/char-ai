(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Cursor spotlight
  const spotlight = document.createElement("div");
  spotlight.className = "cursor-spotlight";
  document.body.prepend(spotlight);

  document.addEventListener("mousemove", (e) => {
    document.documentElement.style.setProperty("--cursor-x", `${e.clientX}px`);
    document.documentElement.style.setProperty("--cursor-y", `${e.clientY}px`);
  }, { passive: true });

  // Button ripple
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest("button:not(.copy-code-btn):not(.copy-msg-btn):not(.feedback-btn)");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "btn-ripple";
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `width:${size}px;padding-bottom:${size}px;top:${e.clientY - rect.top}px;left:${e.clientX - rect.left}px;transform:translate(-50%,-50%) scale(0);`;
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
})();
