document.documentElement.classList.add("page-open");
setTimeout(() => document.documentElement.classList.remove("page-open"), 700);

const SCROLL_REVEAL_SELECTOR =
  ".card, .plugin-card, .script-card, .agent-card, .model-option, .ui-theme-swatch, .model-graph-row, .conversation-item";

const MESSAGE_SELECTOR = ".message:not(.streaming)";

function scrollRevealSelector(root = document) {
  const inMessagesPane =
    root?.id === "messages" || Boolean(root?.closest?.("#messages"));
  if (inMessagesPane) return MESSAGE_SELECTOR;
  if (document.body.classList.contains("chat-layout") && root === document) {
    return SCROLL_REVEAL_SELECTOR;
  }
  return `${SCROLL_REVEAL_SELECTOR}, ${MESSAGE_SELECTOR}`;
}

/** @type {Map<Element|null, IntersectionObserver>} */
const scrollObservers = new Map();
let lastScrollY = window.scrollY;
let scrollDirection = "down";

function motionReduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

window.motionReduced = motionReduced;

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

function isInViewport(el, scrollRoot) {
  if (scrollRoot) {
    const rootRect = scrollRoot.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return rect.top < rootRect.bottom && rect.bottom > rootRect.top;
  }
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.94 && rect.bottom > 8;
}

function revealEl(el, direction = scrollDirection) {
  el.classList.remove("from-below", "from-above");
  el.classList.add(direction === "up" ? "from-above" : "from-below");
  el.classList.add("scroll-visible");
}

function getScrollObserver(scrollRoot = null) {
  if (scrollObservers.has(scrollRoot)) return scrollObservers.get(scrollRoot);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        if (entry.isIntersecting && !el.classList.contains("scroll-visible")) {
          revealEl(el, scrollDirection);
          observer.unobserve(el);
        }
      }
    },
    {
      root: scrollRoot,
      rootMargin: scrollRoot ? "0px 0px 12% 0px" : "0px 0px 6% 0px",
      threshold: 0.01,
    }
  );

  scrollObservers.set(scrollRoot, observer);
  return observer;
}

function initScrollReveals(root = document) {
  if (motionReduced()) return;

  const scrollRoot = root?.id === "messages" ? root : null;
  const observer = getScrollObserver(scrollRoot);
  const items = root.querySelectorAll(scrollRevealSelector(root));

  items.forEach((el, index) => {
    if (
      el.classList.contains("scroll-visible") ||
      el.classList.contains("scroll-reveal") ||
      el.classList.contains("message-enter") ||
      el.classList.contains("conv-enter")
    ) {
      return;
    }
    el.classList.add("scroll-reveal");
    el.style.transitionDelay = `${Math.min(index, 6) * 0.03}s`;

    if (isInViewport(el, scrollRoot)) {
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
