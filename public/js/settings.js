const displayNameInput = document.getElementById("display-name");
const profileEmojiInput = document.getElementById("profile-emoji");
const profileFileInput = document.getElementById("profile-file");
const profilePreview = document.getElementById("profile-avatar-preview");
const saveProfileBtn = document.getElementById("save-profile-btn");
const errorEl = document.getElementById("error");
const successEl = document.getElementById("success");
const passwordForm = document.getElementById("password-form");
const newPasswordInput = document.getElementById("new-password");
const usageDisplayEl = document.getElementById("usage-display");

let pendingAvatar = null;

function renderUsage(rateLimit) {
  if (!usageDisplayEl || !rateLimit) return;
  const { hourRemaining, perHour, dayRemaining, perDay } = rateLimit;
  usageDisplayEl.classList.remove("limited", "low");
  if (rateLimit.limited) {
    usageDisplayEl.textContent = "Limit reached — try again later.";
    usageDisplayEl.classList.add("limited");
    return;
  }
  usageDisplayEl.textContent = `${hourRemaining}/${perHour} messages left this hour · ${dayRemaining}/${perDay} today`;
  if (hourRemaining <= 3) usageDisplayEl.classList.add("low");
}

async function loadUsage() {
  if (!usageDisplayEl) return;
  try {
    const data = await getUsage();
    renderUsage(data.rateLimit);
  } catch {
    usageDisplayEl.textContent = "Could not load usage.";
  }
}

function showSuccess(message) {
  successEl.textContent = message;
  successEl.style.display = "block";
  setTimeout(() => {
    successEl.style.display = "none";
  }, 2500);
}

function renderProfilePreview(account) {
  const av = (account && account.avatar) || pendingAvatar || "🙂";
  profilePreview.innerHTML = "";
  if (av.startsWith("data:image/")) {
    const img = document.createElement("img");
    img.src = av;
    img.alt = "Profile picture";
    profilePreview.appendChild(img);
  } else {
    const span = document.createElement("span");
    span.className = "profile-emoji-preview";
    span.textContent = av;
    profilePreview.appendChild(span);
  }
}

async function loadSettings() {
  try {
    hideError(errorEl);
    const account = getStoredAccount();
    if (account) {
      displayNameInput.value = account.displayName || "";
      profileEmojiInput.value = account.avatar && !account.avatar.startsWith("data:") ? account.avatar : "";
      renderProfilePreview(account);
    }
  } catch (err) {
    showError(errorEl, err.message);
  }
}

profileEmojiInput.addEventListener("input", () => {
  pendingAvatar = profileEmojiInput.value.trim() || "🙂";
  renderProfilePreview(getStoredAccount());
});

profileFileInput.addEventListener("change", () => {
  const file = profileFileInput.files[0];
  if (!file) return;
  if (file.size > 256 * 1024) {
    showError(errorEl, "Image too large. Max 256 KB.");
    profileFileInput.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingAvatar = reader.result;
    renderProfilePreview(getStoredAccount());
  };
  reader.readAsDataURL(file);
});

saveProfileBtn.addEventListener("click", async () => {
  hideError(errorEl);
  const displayName = displayNameInput.value.trim();
  const emojiVal = profileEmojiInput.value.trim();
  let avatar = pendingAvatar;
  if (!avatar && emojiVal) avatar = emojiVal;

  try {
    const { account } = await updateProfile({ displayName, avatar });
    setSession(account);
    pendingAvatar = null;
    renderProfilePreview(account);
    if (typeof renderUserArea === "function") renderUserArea();
    showSuccess("Profile saved.");
  } catch (err) {
    showError(errorEl, err.message);
  }
});

passwordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError(errorEl);
  const pw = newPasswordInput.value;
  if (pw.length < 4) {
    showError(errorEl, "Password must be at least 4 characters.");
    return;
  }
  try {
    await updateProfile({ password: pw });
    newPasswordInput.value = "";
    showSuccess("Password changed.");
  } catch (err) {
    showError(errorEl, err.message);
  }
});

loadSettings();
loadUsage();
