function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function badgeForLlm(llm) {
  if (!llm) return "";
  const tags = [];
  if (llm.badge) tags.push(llm.badge);
  else {
    if (llm.cached) tags.push("cached");
    if (llm.free) tags.push("free");
    if (llm.pipeline || llm.devTeam) tags.push("dev-team");
    if (llm.provider) tags.push(llm.provider);
    if (llm.autoSavedAs) tags.push(`saved:${llm.autoSavedAs}`);
  }
  if (llm.error) tags.push("error");
  return tags
    .map((t) => `<span class="msg-badge">${escapeHtml(String(t))}</span>`)
    .join("");
}

function highlightCode(code, lang) {
  let html = escapeHtml(code);
  if (lang === "javascript" || lang === "js" || lang === "typescript" || lang === "ts") {
    html = html
      .replace(/\b(const|let|var|function|return|if|else|import|export|from|async|await|class)\b/g, '<span class="kw">$1</span>')
      .replace(/(&quot;|&#39;|`)(.*?)\1/g, '<span class="str">$1$2$1</span>');
  } else if (lang === "python" || lang === "py") {
    html = html
      .replace(/\b(def|return|if|else|elif|import|from|class|async|await|print)\b/g, '<span class="kw">$1</span>')
      .replace(/(&quot;|&#39;)(.*?)\1/g, '<span class="str">$1$2$1</span>');
  }
  return html;
}

function formatMarkdownInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s;
}

function formatMarkdownBlock(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let inList = false;

  for (const line of lines) {
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    const li = line.match(/^[-*]\s+(.+)/);

    if (h3) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h3 class="md-h3">${formatMarkdownInline(h3[1])}</h3>`);
    } else if (h2) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h2 class="md-h2">${formatMarkdownInline(h2[1])}</h2>`);
    } else if (h1) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h1 class="md-h1">${formatMarkdownInline(h1[1])}</h1>`);
    } else if (li) {
      if (!inList) {
        out.push('<ul class="md-list">');
        inList = true;
      }
      out.push(`<li>${formatMarkdownInline(li[1])}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (line.trim()) out.push(`<p>${formatMarkdownInline(line)}</p>`);
      else out.push("<br>");
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function formatMessageContent(text) {
  const src = String(text || "");
  const parts = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: src.slice(last, m.index) });
    }
    parts.push({ type: "code", lang: m[1] || "text", value: m[2].replace(/\n$/, "") });
    last = re.lastIndex;
  }
  if (last < src.length) parts.push({ type: "text", value: src.slice(last) });
  if (!parts.length) parts.push({ type: "text", value: src });

  return parts
    .map((p) => {
      if (p.type === "text") {
        return `<div class="msg-text md-body">${formatMarkdownBlock(p.value)}</div>`;
      }
      const id = `code-${Math.random().toString(36).slice(2, 9)}`;
      return `<div class="code-block-wrap"><div class="code-block-head"><span>${escapeHtml(p.lang || "code")}</span><button type="button" class="copy-code-btn" data-target="${id}">Copy</button></div><pre class="code-block"><code id="${id}" data-lang="${escapeHtml(p.lang)}">${highlightCode(p.value, p.lang)}</code></pre></div>`;
    })
    .join("");
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const old = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = old;
      }, 1200);
    }
  } catch {
    /* ignore */
  }
}

function bindCopyHandlers(root) {
  root.querySelectorAll(".copy-msg-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn.closest(".message")?.dataset?.raw || btn.dataset.text || "", btn));
  });
  root.querySelectorAll(".copy-code-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = document.getElementById(btn.dataset.target);
      copyText(el?.textContent || "", btn);
    });
  });
}
