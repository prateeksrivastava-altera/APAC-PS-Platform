(function () {
  "use strict";

  const authBox = document.getElementById("authBox");
  const authBtn = document.getElementById("authBtn");
  if (!authBox || !authBtn) {
    return;
  }

  const loginUrl =
    "/.auth/login/aad?post_login_redirect_uri=" +
    encodeURIComponent(window.location.pathname + window.location.search);
  const logoutUrl =
    "/.auth/logout?post_logout_redirect_uri=" + encodeURIComponent(window.location.pathname);

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function createAvatar(text) {
    const avatar = document.createElement("span");
    avatar.className = "authAvatar";
    avatar.textContent = String(text || "A").slice(0, 1).toUpperCase();
    return avatar;
  }

  function createName(text) {
    const name = document.createElement("span");
    name.className = "authName";
    name.textContent = text;
    return name;
  }

  function closeMenu() {
    const menu = authBox.querySelector(".authMenu");
    if (menu) {
      menu.remove();
    }
    authBtn.setAttribute("aria-expanded", "false");
  }

  function renderLoggedOut() {
    closeMenu();
    authBtn.className = "authPill authPill--loggedOut";
    clearNode(authBtn);
    authBtn.appendChild(createAvatar("A"));
    authBtn.appendChild(createName("Sign in for testing"));
    authBtn.onclick = function () {
      window.location.href = loginUrl;
    };
  }

  function renderLoggedIn(user) {
    closeMenu();
    authBtn.className = "authPill";
    clearNode(authBtn);
    authBtn.appendChild(createAvatar(user.name || user.email || "U"));
    authBtn.appendChild(createName(user.name || user.email || "Authenticated User"));
    authBtn.onclick = function () {
      if (authBox.querySelector(".authMenu")) {
        closeMenu();
        return;
      }

      const menu = document.createElement("div");
      menu.className = "authMenu";

      const email = document.createElement("div");
      email.className = "authMenuEmail";
      email.textContent = user.email || "Signed in";

      const signOut = document.createElement("button");
      signOut.type = "button";
      signOut.className = "authMenuAction";
      signOut.textContent = "Sign out";
      signOut.onclick = function () {
        window.location.href = logoutUrl;
      };

      menu.appendChild(email);
      menu.appendChild(signOut);
      authBox.appendChild(menu);
      authBtn.setAttribute("aria-expanded", "true");

      window.setTimeout(function () {
        function handleOutsideClick(event) {
          if (!authBox.contains(event.target)) {
            document.removeEventListener("click", handleOutsideClick, true);
            closeMenu();
          }
        }
        document.addEventListener("click", handleOutsideClick, true);
      }, 0);
    };
  }

  async function loadAuthState() {
    try {
      const response = await fetch("/api/me", {
        cache: "no-store",
        credentials: "include"
      });
      const payload = await response.json();

      if (payload?.authenticated && payload?.user) {
        renderLoggedIn(payload.user);
        return payload;
      }
    } catch {
      // Fall through to logged-out state.
    }

    renderLoggedOut();
    return {
      authenticated: false,
      user: null
    };
  }

  window.authBootstrap = {
    loadAuthState,
    login: function () {
      window.location.href = loginUrl;
    },
    logout: function () {
      window.location.href = logoutUrl;
    }
  };

  loadAuthState();
})();
