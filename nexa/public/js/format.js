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
      .replace(/\b(const|let|var|function|return|if|else|import|export|from|async|await|class|typeof|instanceof|new|delete|void|throw|try|catch|finally|for|while|do|switch|case|break|continue|default|this|super|extends|static|get|set|yield|of|in)\b/g, '<span class="kw">$1</span>')
      .replace(/(&quot;|&#39;|`)(.*?)\1/g, '<span class="str">$1$2$1</span>')
      .replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>');
  } else if (lang === "python" || lang === "py") {
    html = html
      .replace(/\b(def|return|if|else|elif|import|from|class|async|await|print|with|as|pass|raise|lambda|global|nonlocal|not|and|or|is|in|None|True|False|for|while|try|except|finally|yield|del)\b/g, '<span class="kw">$1</span>')
      .replace(/(&quot;|&#39;)(.*?)\1/g, '<span class="str">$1$2$1</span>')
      .replace(/(#[^\n]*)/g, '<span class="cmt">$1</span>');
  } else if (lang === "sql" || lang === "SQL") {
    html = html
      .replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP BY|ORDER BY|HAVING|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|ADD|COLUMN|PRIMARY KEY|FOREIGN KEY|REFERENCES|NOT NULL|UNIQUE|DEFAULT|AS|AND|OR|NOT|IN|IS|NULL|LIKE|BETWEEN|LIMIT|OFFSET|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END)\b/gi, '<span class="kw">$1</span>')
      .replace(/(&quot;|&#39;)(.*?)\1/g, '<span class="str">$1$2$1</span>')
      .replace(/(--[^\n]*)/g, '<span class="cmt">$1</span>');
  } else if (lang === "go" || lang === "golang") {
    html = html
      .replace(/\b(func|return|if|else|import|package|var|const|type|struct|interface|map|chan|go|defer|select|case|break|continue|default|for|range|switch|make|new|nil|true|false|error)\b/g, '<span class="kw">$1</span>')
      .replace(/(&quot;|&#39;|`)(.*?)\1/g, '<span class="str">$1$2$1</span>')
      .replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>');
  } else if (lang === "rust" || lang === "rs") {
    html = html
      .replace(/\b(fn|let|mut|const|return|if|else|use|mod|pub|struct|enum|impl|trait|for|while|loop|match|break|continue|Some|None|Ok|Err|true|false|self|Self|super|crate|async|await|move|ref|type|where)\b/g, '<span class="kw">$1</span>')
      .replace(/(&quot;|&#39;)(.*?)\1/g, '<span class="str">$1$2$1</span>')
      .replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>');
  } else if (lang === "bash" || lang === "sh" || lang === "shell" || lang === "zsh") {
    html = html
      .replace(/\b(if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|return|export|local|echo|cd|ls|mkdir|rm|cp|mv|chmod|grep|sed|awk|cat|source)\b/g, '<span class="kw">$1</span>')
      .replace(/(&quot;|&#39;)(.*?)\1/g, '<span class="str">$1$2$1</span>')
      .replace(/(#[^\n]*)/g, '<span class="cmt">$1</span>');
  } else if (lang === "json") {
    html = html
      .replace(/(&quot;[^&]*&quot;)\s*:/g, '<span class="str">$1</span>:')
      .replace(/:\s*(&quot;[^&]*&quot;)/g, ': <span class="str">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="kw">$1</span>');
  } else if (lang === "css" || lang === "scss") {
    html = html
      .replace(/([a-z-]+)\s*:/g, '<span class="kw">$1</span>:')
      .replace(/(&quot;|&#39;)(.*?)\1/g, '<span class="str">$1$2$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="cmt">$1</span>');
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

function renderTable(tableLines) {
  const rows = tableLines.filter((l) => !l.match(/^\s*\|?[-:| ]+\|?\s*$/));
  const cells = (row) =>
    row
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  if (!rows.length) return "";
  const [head, ...body] = rows;
  const ths = cells(head).map((c) => `<th>${formatMarkdownInline(c)}</th>`).join("");
  const trs = body
    .map((r) => `<tr>${cells(r).map((c) => `<td>${formatMarkdownInline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function formatMarkdownBlock(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;
  let tableLines = null;

  function flushList() {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  }
  function flushTable() {
    if (tableLines) { out.push(renderTable(tableLines)); tableLines = null; }
  }

  for (const line of lines) {
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    const li = line.match(/^[-*]\s+(.+)/);
    const oli = line.match(/^\d+\.\s+(.+)/);
    const isTableRow = line.match(/^\s*\|/);

    if (isTableRow) {
      flushList();
      if (!tableLines) tableLines = [];
      tableLines.push(line);
      continue;
    } else {
      flushTable();
    }

    if (h3) {
      flushList();
      out.push(`<h3 class="md-h3">${formatMarkdownInline(h3[1])}</h3>`);
    } else if (h2) {
      flushList();
      out.push(`<h2 class="md-h2">${formatMarkdownInline(h2[1])}</h2>`);
    } else if (h1) {
      flushList();
      out.push(`<h1 class="md-h1">${formatMarkdownInline(h1[1])}</h1>`);
    } else if (li) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push('<ul class="md-list">'); inUl = true; }
      out.push(`<li>${formatMarkdownInline(li[1])}</li>`);
    } else if (oli) {
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (!inOl) { out.push('<ol class="md-list md-ol">'); inOl = true; }
      out.push(`<li>${formatMarkdownInline(oli[1])}</li>`);
    } else {
      flushList();
      if (line.trim()) out.push(`<p>${formatMarkdownInline(line)}</p>`);
      else out.push("<br>");
    }
  }
  flushList();
  flushTable();
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
