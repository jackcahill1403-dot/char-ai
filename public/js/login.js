const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const displayNameWrap = document.getElementById("display-name-wrap");
const submitBtn = document.getElementById("auth-submit");
const form = document.getElementById("auth-form");
const errorEl = document.getElementById("error");

let mode = "login";

function setMode(next) {
  mode = next;
  if (mode === "register") {
    tabLogin.classList.remove("active");
    tabRegister.classList.add("active");
    displayNameWrap.style.display = "";
    submitBtn.textContent = "Create account";
  } else {
    tabRegister.classList.remove("active");
    tabLogin.classList.add("active");
    displayNameWrap.style.display = "none";
    submitBtn.textContent = "Log in";
  }
  hideError(errorEl);
}

tabLogin.addEventListener("click", () => setMode("login"));
tabRegister.addEventListener("click", () => setMode("register"));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError(errorEl);
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const displayName = document.getElementById("display-name").value.trim();

  if (!username || !password) return;

  try {
    let account;
    if (mode === "register") {
      const res = await registerAccount({ userId: username, password, displayName });
      account = res.account;
    } else {
      const res = await loginAccount({ userId: username, password });
      account = res.account;
    }
    setSession(account);
    window.location.href = "/";
  } catch (err) {
    showError(errorEl, err.message);
  }
});
