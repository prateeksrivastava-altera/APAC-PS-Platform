(function () {
  "use strict";

  const authBox = document.getElementById("authBox");
  const authBtn = document.getElementById("authBtn");
  const REDIRECT_GUARD_KEY = "apac_hub_sso_redirect_started_at";
  const logoutUrl =
    "/.auth/logout?post_logout_redirect_uri=" + encodeURIComponent(window.location.pathname);
  const HUB_AUTH_STORAGE_KEY = "apac_hub_auth_user";

  function currentPath() {
    return window.location.pathname + window.location.search;
  }

  function loginUrl() {
    return (
      "/.auth/login/aad?post_login_redirect_uri=" +
      encodeURIComponent(currentPath())
    );
  }

  function isLocalDevelopmentHost() {
    return (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    );
  }

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

  function humanizeIdentityName(value) {
    const email = String(value || "").trim().toLowerCase();
    const localPart = email.includes("@") ? email.split("@")[0] : email;
    return localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ")
      .trim();
  }

  function closeMenu() {
    const menu = authBox.querySelector(".authMenu");
    if (menu) {
      menu.remove();
    }
    authBtn.setAttribute("aria-expanded", "false");
  }

  function renderLoggedOut() {
    if (!authBox || !authBtn) {
      return;
    }
    closeMenu();
    authBtn.className = "authPill authPill--loggedOut";
    clearNode(authBtn);
    authBtn.appendChild(createAvatar("A"));
    authBtn.appendChild(createName("Sign in"));
    authBtn.onclick = function () {
      window.location.href = loginUrl();
    };
  }

  function renderLoggedIn(user) {
    if (!authBox || !authBtn) {
      return;
    }
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

  function extractEasyAuthUser(payload) {
    const principal = Array.isArray(payload) ? payload[0]?.clientPrincipal : payload?.clientPrincipal;
    if (!principal?.userId) {
      return null;
    }

    const claims = Array.isArray(principal.claims) ? principal.claims : [];
    const displayName =
      claims.find(function (claim) { return claim?.typ === "name"; })?.val ||
      humanizeIdentityName(principal.userDetails) ||
      "Authenticated User";

    return {
      userId: principal.userId,
      name: displayName,
      email: principal.userDetails || "",
      roles: Array.isArray(principal.userRoles) ? principal.userRoles : []
    };
  }

  function clearRedirectGuard() {
    try {
      window.sessionStorage.removeItem(REDIRECT_GUARD_KEY);
    } catch (_error) {
      // Ignore storage issues.
    }
  }

  function hasPendingRedirectGuard() {
    try {
      return window.sessionStorage.getItem(REDIRECT_GUARD_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function markRedirectStarted() {
    try {
      window.sessionStorage.setItem(REDIRECT_GUARD_KEY, "1");
    } catch (_error) {
      // Ignore storage issues.
    }
  }

  async function loadAuthState() {
    try {
      const easyAuthResponse = await fetch("/.auth/me", {
        cache: "no-store",
        credentials: "include"
      });

      if (easyAuthResponse.ok) {
        const easyAuthPayload = await easyAuthResponse.json();
        const easyAuthUser = extractEasyAuthUser(easyAuthPayload);
        if (easyAuthUser) {
          clearRedirectGuard();
          renderLoggedIn(easyAuthUser);
          return {
            authenticated: true,
            user: easyAuthUser
          };
        }
      }
    } catch {
      // Fall through to server-side auth detection.
    }

    try {
      const response = await fetch("/api/me", {
        cache: "no-store",
        credentials: "include"
      });
      const payload = await response.json();

      if (payload?.authenticated && payload?.user) {
        clearRedirectGuard();
        renderLoggedIn(payload.user);
        return payload;
      }
    } catch {
      // Fall through to logged-out state.
    }

    try {
      const stored = JSON.parse(window.sessionStorage.getItem(HUB_AUTH_STORAGE_KEY) || "null");
      if (stored?.email || stored?.name) {
        renderLoggedIn(stored);
        return {
          authenticated: true,
          user: stored
        };
      }
    } catch {
      // Ignore storage issues and fall through.
    }

    renderLoggedOut();
    return {
      authenticated: false,
      user: null
    };
  }

  async function requireAuthOrRedirect() {
    const state = await loadAuthState();
    const authenticated = Boolean(state?.authenticated && state?.user);

    if (!authenticated && !isLocalDevelopmentHost() && !hasPendingRedirectGuard()) {
      markRedirectStarted();
      window.location.replace(loginUrl());
      return null;
    }

    return state;
  }

  window.authBootstrap = {
    loadAuthState,
    requireAuthOrRedirect,
    login: function () {
      clearRedirectGuard();
      window.location.href = loginUrl();
    },
    logout: function () {
      clearRedirectGuard();
      window.location.href = logoutUrl;
    }
  };

  if (authBox && authBtn) {
    loadAuthState();
  }
})();
