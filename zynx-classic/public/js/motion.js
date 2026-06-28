document.documentElement.classList.add("page-open");
setTimeout(() => document.documentElement.classList.remove("page-open"), 480);

const SCROLL_REVEAL_SELECTOR =
  ".card, .message:not(.streaming), .plugin-card, .script-card, .agent-card, .model-option, .ui-theme-swatch, .model-graph-row";

let scrollObserver = null;
let lastScrollY = window.scrollY;
let scrollDirection = "down";

function motionReduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

window.addEventListener(
  "scroll",
  () => {
    const y = window.scrollY;
    if (y > lastScrollY + 2) scrollDirection = "down";
    else if (y < lastScrollY - 2) scrollDirection = "up";
    lastScrollY = y;
  },
  { passive: true }
);

function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.94 && rect.bottom > 8;
}

function revealEl(el, direction = scrollDirection) {
  el.classList.remove("from-below", "from-above");
  el.classList.add(direction === "up" ? "from-above" : "from-below");
  el.classList.add("scroll-visible");
}

function getScrollObserver() {
  if (scrollObserver) return scrollObserver;
  scrollObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        if (entry.isIntersecting) {
          if (!el.classList.contains("scroll-visible")) {
            revealEl(el, scrollDirection);
            scrollObserver.unobserve(el);
          }
        }
      }
    },
    {
      root: null,
      rootMargin: "0px 0px 6% 0px",
      threshold: 0.01,
    }
  );
  return scrollObserver;
}

function initScrollReveals(root = document) {
  if (motionReduced()) return;

  const observer = getScrollObserver();
  const items = root.querySelectorAll(SCROLL_REVEAL_SELECTOR);

  items.forEach((el, index) => {
    if (
      el.classList.contains("scroll-visible") ||
      el.classList.contains("scroll-reveal") ||
      el.classList.contains("message-enter")
    ) {
      return;
    }
    el.classList.add("scroll-reveal");
    el.style.transitionDelay = `${Math.min(index, 2) * 0.02}s`;

    if (isInViewport(el)) {
      requestAnimationFrame(() => revealEl(el, "down"));
    } else {
      observer.observe(el);
    }
  });
}

function smoothScrollEl(el, { top, instant = false } = {}) {
  if (!el) return;
  el.scrollTo({
    top: top ?? el.scrollHeight,
    behavior: instant || motionReduced() ? "auto" : "smooth",
  });
}

let streamScrollRaf = 0;
function scrollMessagesToBottom(instant = false) {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return;
  if (instant) {
    smoothScrollEl(messagesEl, { instant: true });
    return;
  }
  if (streamScrollRaf) cancelAnimationFrame(streamScrollRaf);
  streamScrollRaf = requestAnimationFrame(() => {
    streamScrollRaf = 0;
    smoothScrollEl(messagesEl);
  });
}

window.initScrollReveals = initScrollReveals;
window.smoothScrollEl = smoothScrollEl;
window.scrollMessagesToBottom = scrollMessagesToBottom;

document.addEventListener("DOMContentLoaded", () => initScrollReveals());
