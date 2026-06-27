"""char.ai — Streamlit client.

A Python alternative UI for char.ai. Talks to the running Node backend
(start `node server.js` first) and lets you browse characters and roleplay
with multi-session support, pfps, and the live message-limit indicator.

This injects custom CSS so the look matches the web UI as closely as
Streamlit allows — same Fraunces / Newsreader / JetBrains Mono fonts,
cream + sepia palette, marquee hero, cast cards, screenplay chat bubbles.

Run:
    pip install -r requirements.txt
    streamlit run streamlit_app.py
"""

from __future__ import annotations

import os
import re
import uuid
from typing import Any

import requests
import streamlit as st

DEFAULT_API = os.environ.get("CHARAI_API", "http://localhost:3847")
USER_FILE = ".charai_user.txt"


# --- helpers ---------------------------------------------------------------

def get_user_id() -> str:
    if "user_id" in st.session_state:
        return st.session_state.user_id
    uid = None
    if os.path.exists(USER_FILE):
        with open(USER_FILE, "r", encoding="utf-8") as fh:
            uid = fh.read().strip()
    if not uid:
        uid = f"user-{uuid.uuid4().hex[:8]}"
    st.session_state.user_id = uid
    return uid


def set_user_id(value: str) -> None:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", value.strip())[:40]
    if cleaned:
        st.session_state.user_id = cleaned
        with open(USER_FILE, "w", encoding="utf-8") as fh:
            fh.write(cleaned)


def api_get(base: str, path: str) -> dict[str, Any]:
    r = requests.get(f"{base}{path}", headers={"X-User-Id": get_user_id()}, timeout=20)
    r.raise_for_status()
    return r.json()


def api_post(base: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    r = requests.post(
        f"{base}{path}",
        headers={"X-User-Id": get_user_id(), "Content-Type": "application/json"},
        json=body or {},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def api_delete(base: str, path: str) -> dict[str, Any]:
    r = requests.delete(f"{base}{path}", headers={"X-User-Id": get_user_id()}, timeout=20)
    r.raise_for_status()
    return r.json()


def _esc(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def avatar_html(base: str, c: dict[str, Any], size: int = 80) -> str:
    """Character avatar as <img> (pfp) with emoji fallback on error."""
    img = c.get("image")
    fallback = c.get("avatar") or "🧑"
    name = _esc(c.get("name") or "")
    if img:
        url = f"{base}{img}" if img.startswith("/") else img
        return (
            f'<img src="{_esc(url)}" alt="{name}" class="cast-avatar-img" '
            f'style="width:{size}px;height:{size}px;" '
            f'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-flex\'"/>'
            f'<span class="cast-avatar-emoji" style="display:none;width:{size}px;height:{size}px;'
            f'font-size:{size // 2}px;">{fallback}</span>'
        )
    return f'<span class="cast-avatar-emoji" style="width:{size}px;height:{size}px;font-size:{size // 2}px;">{fallback}</span>'


def format_content(text: str) -> str:
    """Convert *action* asterisks to <em> tags for italic indented actions."""
    escaped = _esc(text)
    return re.sub(r"\*([^*]+)\*", r'<em>\1</em>', escaped)


# --- theme / CSS injection -------------------------------------------------

THEME_CSS = """
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=JetBrains+Mono:wght@400;500&display=swap");

:root {
  --ink: #2e1f12;
  --ink-soft: #3d2a18;
  --ink-line: #5a4028;
  --parchment: #eae3d2;
  --parchment-soft: #f4efe1;
  --paper: #f7f2e6;
  --amber: #d4a24c;
  --amber-deep: #b8862f;
  --slate: #5c6b7a;
  --slate-soft: #8b9aa8;
  --crimson: #b42318;
  --border: rgba(46, 31, 18, 0.14);
}

/* Hide Streamlit chrome + unused default sidebar */
#MainMenu, header[data-testid="stHeader"], .stDeployButton, footer,
.stApp > header, .stToolbar, [data-testid="stToolbar"],
section[data-testid="stSidebar"] {
  display: none !important;
}
.stApp, .stChatMessage, .main .block-container {
  background: var(--parchment) !important;
}
.stApp, .stApp p, .stApp span, .stApp li, .stApp div {
  font-family: "Newsreader", Georgia, serif !important;
  color: var(--ink) !important;
}

/* Typography */
h1, h2, h3, .marquee-title, .scene-title, .cast-name {
  font-family: "Fraunces", "Times New Roman", serif !important;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink) !important;
}
.marquee-label, .scene-label, .usage-mono, .stMetric label, .stMetric div[data-testid="stMetricValue"] {
  font-family: "JetBrains Mono", ui-monospace, monospace !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.stMetric label {
  font-size: 0.65rem !important;
  color: var(--slate) !important;
}

/* Marquee hero */
.marquee-hero {
  border-top: 2px dashed var(--amber);
  border-bottom: 2px dashed var(--amber);
  padding: 1.5rem 0;
  margin: 0 0 2rem;
  text-align: center;
}
.marquee-label {
  font-size: 0.7rem;
  color: var(--amber-deep);
  margin: 0 0 0.5rem;
}
.marquee-title {
  font-size: 2.2rem;
  font-style: italic;
  margin: 0 0 0.5rem;
  line-height: 1.1;
}
.marquee-meta {
  font-family: "Newsreader", serif;
  font-size: 0.95rem;
  color: var(--slate);
  margin: 0;
}

/* Cast cards */
.cast-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}
.cast-card {
  background: var(--parchment-soft);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1rem;
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  transition: border-color 0.15s;
}
.cast-card:hover { border-color: var(--amber); }
.cast-avatar-img, .cast-avatar-emoji {
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--border);
}
.cast-avatar-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--parchment);
}
.cast-name {
  font-size: 1.05rem;
  margin: 0 0 0.2rem;
}
.cast-tagline {
  font-size: 0.85rem;
  font-style: italic;
  color: var(--slate) !important;
  margin: 0 0 0.4rem;
}
.cast-tags {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.cast-tag {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.6rem;
  letter-spacing: 0.06em;
  text-transform: lowercase;
  color: var(--slate) !important;
  padding: 0.1rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 2px;
}

/* Scene header (character chat) */
.scene-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0 1.25rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}
.scene-avatar-img, .scene-avatar-emoji {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--border);
}
.scene-avatar-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  background: var(--parchment-soft);
}
.scene-label {
  font-size: 0.65rem;
  color: var(--amber-deep) !important;
  margin: 0 0 0.2rem;
}
.scene-title {
  font-size: 1.8rem;
  font-style: italic;
  margin: 0 0 0.3rem;
}
.scene-scenario {
  font-size: 0.9rem;
  color: var(--slate) !important;
  margin: 0;
}

/* Chat bubbles — screenplay feel */
.stChatMessage {
  background: var(--parchment-soft) !important;
  border: 1px solid var(--border) !important;
  border-radius: 2px !important;
  padding: 1rem 1.25rem !important;
  margin-bottom: 0.75rem !important;
}
/* Hide the default Streamlit chat avatar (renders broken "smart_toy" text
   because the Material Icons font doesn't load). We show the role label as
   centered text above each message instead. Streamlit's emotion CSS fights
   display:none, so we hammer it with multiple hiding properties. */
.stChatMessage [data-testid="stChatMessageAvatarAssistant"],
.stChatMessage [data-testid="stChatMessageAvatarUser"],
.stChatMessage [data-testid="stChatMessageAvatar"],
.stChatMessage [data-testid="stIconMaterial"],
.stChatMessage .stChatMessageAvatarAssistant,
.stChatMessage .stChatMessageAvatarUser,
[data-testid="stChatMessageAvatarAssistant"],
[data-testid="stChatMessageAvatarUser"] {
  display: none !important;
  visibility: hidden !important;
  width: 0 !important;
  height: 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 0 !important;
  max-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  position: absolute !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
.stChatMessage [data-testid="stChatMessageContent"] {
  width: 100% !important;
  padding: 0 !important;
}
.stChatMessage p { margin: 0 0 0.4rem; }
.stChatMessage em {
  display: block;
  font-style: italic;
  color: var(--slate) !important;
  margin: 0.5rem 0;
  padding-left: 1.25rem;
  border-left: 2px solid var(--border);
  font-size: 0.95rem;
}

/* Usage indicator */
.usage-mono {
  font-size: 0.65rem;
  color: var(--slate) !important;
  text-align: right;
  margin: 0.5rem 0;
}
.usage-mono.limited { color: var(--crimson) !important; font-weight: 600; }

/* Footer */
.site-footer {
  margin-top: 2rem;
  padding: 0.5rem 0;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.6rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--slate) !important;
  text-align: center;
  opacity: 0.7;
}

/* Sidebar */
section[data-testid="stSidebar"] {
  background: var(--parchment-soft) !important;
  border-right: 1px solid var(--border);
}
section[data-testid="stSidebar"] .stMarkdown h1,
section[data-testid="stSidebar"] .stMarkdown h2,
section[data-testid="stSidebar"] .stMarkdown h3 {
  font-family: "JetBrains Mono", monospace !important;
  font-size: 0.7rem !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--amber-deep) !important;
}

/* Cast card visual (inside bordered container) — avatar + tagline + tags */
.cast-card-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.cast-card-visual .cast-avatar-img,
.cast-card-visual .cast-avatar-emoji {
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid var(--border);
}
.cast-card-visual .cast-avatar-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--parchment-soft);
}
.cast-card-visual .cast-tagline {
  font-style: italic;
  color: var(--slate) !important;
  font-size: 0.85rem;
  margin: 0;
  line-height: 1.3;
}
.cast-card-visual .cast-tags {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  justify-content: center;
}

/* Bordered containers (cast cards) — Streamlit wraps a bordered st.container
   in a stLayoutWrapper, with the bordered stVerticalBlock as its direct child. */
[data-testid="stLayoutWrapper"] > [data-testid="stVerticalBlock"] {
  background-color: #f4efe1 !important;
  border: 1px solid #5a4028 !important;
  border-radius: 4px !important;
  padding: 1rem !important;
  box-shadow: none !important;
  transition: border-color 0.15s;
}
[data-testid="stLayoutWrapper"] > [data-testid="stVerticalBlock"]:hover {
  border-color: #d4a24c !important;
}

/* Chat drawer sidebar */
.drawer-label {
  font-family: "JetBrains Mono", monospace !important;
  font-size: 0.7rem !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--amber-deep) !important;
  margin: 0 0 0.75rem;
}
/* Session buttons inside the drawer — smaller, left-aligned */
[data-testid="stLayoutWrapper"] .stButton > button,
[data-testid="stLayoutWrapper"] .stButton > button p,
[data-testid="stLayoutWrapper"] .stButton > button span,
[data-testid="stLayoutWrapper"] .stButton > button div {
  font-family: "Newsreader", Georgia, serif !important;
  font-size: 0.85rem !important;
  font-weight: 400;
  text-align: left !important;
  padding: 0.35rem 0.5rem !important;
  white-space: normal !important;
  line-height: 1.3 !important;
}
[data-testid="stLayoutWrapper"] .stButton > button:hover,
[data-testid="stLayoutWrapper"] .stButton > button:hover p,
[data-testid="stLayoutWrapper"] .stButton > button:hover span,
[data-testid="stLayoutWrapper"] .stButton > button:hover div {
  color: var(--amber-deep) !important;
  background: var(--paper) !important;
  text-decoration: none;
}

/* Toolbar toggle button (☰ Chats / ✕ Close) */
[data-testid="column"]:last-child .stButton > button {
  font-family: "JetBrains Mono", monospace !important;
  font-size: 0.75rem !important;
  text-align: center !important;
  letter-spacing: 0.04em;
}

.cast-card-avatar {
  display: flex;
  justify-content: center;
  margin-bottom: 0.5rem;
}
.cast-card-avatar .cast-avatar-img,
.cast-card-avatar .cast-avatar-emoji {
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid var(--border);
}
.cast-card-avatar .cast-avatar-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--parchment);
}

/* Buttons — clean text-style, no boxed chrome, full width, multi-line label */
.stButton > button,
.stButton > button p,
.stButton > button span,
.stButton > button div {
  background: transparent !important;
  color: var(--ink) !important;
  border: none !important;
  border-radius: 0 !important;
  font-family: "Fraunces", "Times New Roman", serif !important;
  font-size: 1rem !important;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  text-align: center;
  padding: 0.3rem 0.25rem !important;
  outline: none !important;
  box-shadow: none !important;
  width: 100%;
  white-space: pre-line !important;
  line-height: 1.35 !important;
}
.stButton > button:hover,
.stButton > button:hover p,
.stButton > button:hover span,
.stButton > button:hover div {
  color: var(--amber-deep) !important;
  background: transparent !important;
}

/* Chat input — including the pinned bottom wrapper that defaults to dark */
[data-testid="stChatInput"], [data-testid="stChatInput"] > div,
.stChatInputContainer, [data-testid="stBottom"], [data-testid="stBottom"] > div,
[data-testid="stChatInputSubmitButton"] button {
  background: var(--parchment-soft) !important;
  color: var(--ink) !important;
  border-color: var(--border) !important;
}
[data-testid="stChatInput"] textarea {
  background: var(--paper) !important;
  color: var(--ink) !important;
  border: 1px solid var(--border) !important;
  border-radius: 2px !important;
  font-family: "Newsreader", serif !important;
}
[data-testid="stChatInputSubmitButton"] button,
[data-testid="stChatInputSubmitButton"] button p,
[data-testid="stChatInputSubmitButton"] button span {
  background: var(--parchment-soft) !important;
  color: var(--ink) !important;
  border: 1px solid var(--ink) !important;
}

/* Kill any other dark surfaces Streamlit defaults to */
pre, code, .stCodeBlock, .stCodeBlock pre, .stCodeBlock code,
[data-testid="stCodeBlock"], [data-testid="stCodeBlock"] pre,
.stDataFrame, .stTable, .stAlert, [data-testid="stAlert"] {
  background: var(--parchment-soft) !important;
  color: var(--ink) !important;
  border: 1px solid var(--border) !important;
}
.stCodeBlock code, pre code { color: var(--ink) !important; }

/* Any leftover empty containers at the bottom of the page */
.stApp > div:last-child, .main > div:last-child,
.stApp > footer, .stApp > div > div:last-child {
  background: transparent !important;
  border: none !important;
}

/* Spinner / loading state that can flash dark */
.stSpinner, [data-testid="stSpinner"] {
  background: transparent !important;
  color: var(--amber-deep) !important;
}
"""


def inject_theme() -> None:
    st.markdown(f"<style>{THEME_CSS}</style>", unsafe_allow_html=True)


# --- session state init ----------------------------------------------------

def init_state() -> None:
    if "current_character" not in st.session_state:
        st.session_state.current_character = None
    if "sessions" not in st.session_state:
        st.session_state.sessions = []
    if "current_session" not in st.session_state:
        st.session_state.current_session = None
    if "chat_drawer_open" not in st.session_state:
        st.session_state.chat_drawer_open = False
    if "api_base" not in st.session_state:
        st.session_state.api_base = DEFAULT_API


def get_base() -> str:
    return st.session_state.get("api_base", DEFAULT_API)


def render_chat_drawer(base: str, cid: str, sessions: list[dict[str, Any]]) -> None:
    """Collapsible sidebar: session list, + New, delete."""
    st.markdown('<p class="drawer-label">Chats</p>', unsafe_allow_html=True)

    for s in sessions:
        sid = s.get("id", "")
        title = s.get("title", "New chat")
        count = s.get("messageCount", 0)
        is_active = (
            st.session_state.current_session
            and st.session_state.current_session.get("id") == sid
        )
        label = f"● {title} ({count})" if is_active else f"{title} ({count})"
        if st.button(label, key=f"sess-{sid}", use_container_width=True):
            st.session_state.current_session = s
            st.rerun()

    st.markdown("---")
    if st.button("+ New chat", key="sess-new", use_container_width=True):
        try:
            res = api_post(base, f"/api/characters/{cid}/sessions")
            st.session_state.sessions.insert(0, res.get("session", {}))
            st.session_state.current_session = st.session_state.sessions[0]
            st.rerun()
        except Exception as exc:
            st.error(f"Could not create chat: {exc}")

    if st.session_state.current_session and st.button(
        "Delete chat", key="sess-del", use_container_width=True
    ):
        try:
            del_id = st.session_state.current_session.get("id")
            api_delete(base, f"/api/characters/{cid}/sessions/{del_id}")
            st.session_state.sessions = [
                s for s in st.session_state.sessions if s.get("id") != del_id
            ]
            st.session_state.current_session = (
                st.session_state.sessions[0] if st.session_state.sessions else None
            )
            st.rerun()
        except Exception as exc:
            st.error(f"Could not delete: {exc}")


def render_chat_messages(base: str, cid: str, name: str, messages: list[dict[str, Any]], sid: str) -> None:
    """Message list and chat input."""
    for msg in messages:
        role = "user" if msg.get("role") == "user" else "assistant"
        with st.chat_message(role):
            label = "You" if role == "user" else name
            st.markdown(
                f'<p class="scene-label" style="text-align:center;margin-bottom:0.5rem;">{_esc(label)}</p>',
                unsafe_allow_html=True,
            )
            st.markdown(
                f'<div class="dialogue">{format_content(msg.get("content", ""))}</div>',
                unsafe_allow_html=True,
            )

    if user_input := st.chat_input(f"Say something to {name}…"):
        try:
            with st.spinner("Thinking in character…"):
                res = api_post(
                    base, f"/api/characters/{cid}/sessions/{sid}/chat", {"content": user_input}
                )
            new_session = res.get("session", {})
            new_msg = res.get("message", {})
            st.session_state.current_session = {
                **st.session_state.current_session,
                "messageCount": len(new_session.get("messages", [])),
                "title": new_session.get("title", st.session_state.current_session.get("title")),
                "updatedAt": new_session.get("updatedAt"),
            }
            st.session_state.sessions = [
                s if s.get("id") != sid else st.session_state.current_session
                for s in st.session_state.sessions
            ]
            with st.chat_message("assistant"):
                st.markdown(
                    f'<p class="scene-label" style="text-align:center;margin-bottom:0.5rem;">{_esc(name)}</p>',
                    unsafe_allow_html=True,
                )
                st.markdown(
                    f'<div class="dialogue">{format_content(new_msg.get("content", ""))}</div>',
                    unsafe_allow_html=True,
                )
            provider = res.get("llm", {}).get("provider", "")
            if provider == "fallback":
                st.caption("(served by fallback provider — Gemini was rate-limited)")
            if not res.get("llm", {}).get("used"):
                st.caption(f"(LLM unavailable: {res.get('llm', {}).get('reason')})")
        except requests.HTTPError as exc:
            try:
                detail = exc.response.json().get("error", str(exc))
            except Exception:
                detail = str(exc)
            st.error(detail)
        except Exception as exc:
            st.error(f"Send failed: {exc}")


def view_settings() -> None:
    st.markdown(
        '<h2 style="font-family:Fraunces,serif;font-style:italic;margin-top:0;">Settings</h2>',
        unsafe_allow_html=True,
    )
    base = st.text_input("Backend URL", value=get_base(), key="settings_base")
    uid = st.text_input("User ID", value=get_user_id(), key="settings_uid")
    if st.button("Save", key="settings_save"):
        st.session_state.api_base = base.strip() or DEFAULT_API
        set_user_id(uid)
        st.success("Saved.")
        st.rerun()

    st.markdown("---")
    try:
        status = api_get(get_base(), "/api/llm-status")
        primary = status.get("primary", {})
        fallback = status.get("fallback", {})
        st.markdown("### LLM")
        st.metric("Primary (Gemini)", "✅" if primary.get("configured") else "❌")
        st.caption(f"model: `{primary.get('model', '?')}`")
        st.metric("Fallback", "✅" if fallback.get("configured") else "❌")
        st.caption(f"model: `{fallback.get('model', '?')}`")
    except Exception:
        st.warning("Backend not reachable.")

    st.markdown("---")
    try:
        usage = api_get(get_base(), "/api/usage").get("rateLimit", {})
        st.markdown("### Message limit")
        st.metric("Left this hour", f"{usage.get('hourRemaining', 0)}/{usage.get('perHour', 0)}")
        st.metric("Left today", f"{usage.get('dayRemaining', 0)}/{usage.get('perDay', 0)}")
    except Exception:
        pass

    st.markdown("---")
    st.caption("DM yofirsmik on Discord for any issues")


# --- views -----------------------------------------------------------------

def marquee_hero() -> None:
    st.markdown(
        '<div class="marquee-hero">'
        '<p class="marquee-label">Now playing</p>'
        '<h1 class="marquee-title">Pick a character.<br/>Start the scene.</h1>'
        '<p class="marquee-meta">Real people, game casts, anime legends — or make your own.</p>'
        '</div>',
        unsafe_allow_html=True,
    )


def view_characters(base: str) -> None:
    marquee_hero()

    try:
        data = api_get(base, "/api/characters")
    except Exception as exc:
        st.error(f"Could not load characters: {exc}")
        return

    chars = data.get("characters", [])
    if not chars:
        st.write("No characters yet.")
        return

    # Bordered cast cards: avatar as markdown, then a single full-width button
    # whose label holds name + tagline + tags. Clicking anywhere on that
    # button (most of the card) opens the chat.
    cols = st.columns(min(len(chars), 4))
    for i, c in enumerate(chars):
        cid = c.get("id", "")
        name = c.get("name", "")
        tagline = c.get("tagline", "")
        tags_list = c.get("tags") or []
        tags_str = " · ".join(tags_list)
        label = f"{name}\n{tagline}\n{tags_str}".strip()
        with cols[i % len(cols)]:
            with st.container(border=True):
                st.markdown(
                    f'<div class="cast-card-avatar">{avatar_html(base, c, size=80)}</div>',
                    unsafe_allow_html=True,
                )
                if st.button(label, key=f"open-{cid}", use_container_width=True):
                    st.session_state.current_character = c
                    st.session_state.sessions = []
                    st.session_state.current_session = None
                    st.rerun()


def view_character_chat(base: str) -> None:
    c = st.session_state.current_character
    if not c:
        st.info("Pick a character from the Characters tab.")
        return

    cid = c.get("id")
    name = c.get("name", "them")

    # Scene header
    st.markdown(
        f'<div class="scene-header">'
        f'{avatar_html(base, c, size=64)}'
        f'<div>'
        f'<p class="scene-label">Now playing</p>'
        f'<h2 class="scene-title">{_esc(name)}</h2>'
        f'<p class="scene-scenario">{_esc(c.get("scenario", ""))}</p>'
        f'</div></div>',
        unsafe_allow_html=True,
    )

    # Toolbar: back + chats drawer toggle
    bar_back, bar_toggle = st.columns([3, 1])
    with bar_back:
        if st.button("← Back to characters"):
            st.session_state.current_character = None
            st.session_state.sessions = []
            st.session_state.current_session = None
            st.session_state.chat_drawer_open = False
            st.rerun()
    with bar_toggle:
        drawer_label = "✕ Close" if st.session_state.chat_drawer_open else "☰ Chats"
        if st.button(drawer_label, key="toggle-chat-drawer"):
            st.session_state.chat_drawer_open = not st.session_state.chat_drawer_open
            st.rerun()

    # Load sessions
    if not st.session_state.sessions:
        try:
            loaded = api_get(base, f"/api/characters/{cid}")
            st.session_state.sessions = loaded.get("sessions", [])
        except Exception as exc:
            st.error(f"Could not load character: {exc}")
            return

    sessions = st.session_state.sessions

    if not sessions:
        try:
            res = api_post(base, f"/api/characters/{cid}/sessions")
            st.session_state.sessions = [res.get("session", {})]
            st.session_state.current_session = st.session_state.sessions[0]
            st.rerun()
            return
        except Exception as exc:
            st.error(f"Could not start a chat: {exc}")
            return

    if not st.session_state.current_session:
        st.session_state.current_session = sessions[0]

    if not st.session_state.current_session:
        st.info("No chats yet. Open the Chats panel and tap + New chat.")
        if st.session_state.chat_drawer_open:
            with st.container(border=True):
                render_chat_drawer(base, cid, sessions)
        return

    # Load messages
    sid = st.session_state.current_session.get("id")
    try:
        full = api_get(base, f"/api/characters/{cid}/sessions/{sid}")
        session = full.get("session", {})
        messages = session.get("messages", [])
    except Exception as exc:
        st.error(f"Could not load chat: {exc}")
        return

    # Drawer sidebar (open/close) + main chat area
    if st.session_state.chat_drawer_open:
        drawer_col, main_col = st.columns([1, 2.2], gap="small")
        with drawer_col:
            with st.container(border=True):
                render_chat_drawer(base, cid, sessions)
        with main_col:
            render_chat_messages(base, cid, name, messages, sid)
    else:
        render_chat_messages(base, cid, name, messages, sid)


def view_create_character(base: str) -> None:
    st.markdown('<h2 style="font-family:Fraunces,serif;font-style:italic;">Create a character</h2>', unsafe_allow_html=True)
    with st.form("char_form"):
        name = st.text_input("Name", max_chars=60)
        avatar = st.text_input("Avatar emoji (fallback if no picture)", value="🧑", max_chars=8)
        image_url = st.text_input("Profile picture URL (optional — e.g. /img/characters/foo.jpg)", max_chars=300)
        tagline = st.text_input("Tagline", max_chars=120)
        description = st.text_area("Description / persona", height=120, max_chars=2000)
        scenario = st.text_area("Scenario (opening scene)", height=60, max_chars=1000)
        greeting = st.text_area("Greeting (their first message)", height=80, max_chars=1000)
        tags_raw = st.text_input("Tags (comma-separated)", max_chars=120)
        submitted = st.form_submit_button("Save")
        if submitted:
            if len(name) < 2:
                st.error("Name must be at least 2 characters.")
            else:
                payload = {
                    "name": name,
                    "avatar": avatar or "🧑",
                    "tagline": tagline,
                    "description": description,
                    "scenario": scenario,
                    "greeting": greeting,
                    "tags": [t.strip() for t in tags_raw.split(",") if t.strip()],
                }
                if image_url.strip():
                    payload["image"] = image_url.strip()
                try:
                    api_post(base, "/api/characters", payload)
                    st.success(f"Created {name}.")
                except Exception as exc:
                    st.error(f"Save failed: {exc}")


# --- main ------------------------------------------------------------------

def main() -> None:
    st.set_page_config(page_title="char.ai", page_icon="🎭", layout="centered")
    inject_theme()

    init_state()
    base = get_base()

    tab_chars, tab_create, tab_settings = st.tabs(["Characters", "Create", "Settings"])

    with tab_chars:
        if st.session_state.current_character:
            view_character_chat(base)
        else:
            view_characters(base)

    with tab_create:
        view_create_character(base)

    with tab_settings:
        view_settings()


if __name__ == "__main__":
    main()
