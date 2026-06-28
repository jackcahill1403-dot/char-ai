async function fetchUrlText(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Atlas-Bot/1.0)",
        Accept: "text/html,text/plain,*/*",
      },
    });
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const ct = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (!ct.includes("text/html")) return raw.slice(0, 14000);

  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 14000);
}

module.exports = { fetchUrlText };
