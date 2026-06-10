(function () {
  "use strict";

  const authBox = document.getElementById("authBox");
  const authBtn = document.getElementById("authBtn");

  function currentPath() {
    return window.location.pathname + window.location.search;
  }

  function loginUrl() {
    return "/.auth/login/aad?post_login_redirect_uri=" + encodeURIComponent(currentPath());
  }

  function logoutUrl() {
    return "/.auth/logout?post_logout_redirect_uri=" + encodeURIComponent("/");
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Request failed");
    }

    return response.json();
  }

  async function loadAuthState() {
    try {
      const easyAuthState = await fetch("/.auth/me", {
        cache: "no-store",
        credentials: "include",
      });

      if (easyAuthState.ok) {
        const data = await easyAuthState.json();
        const client = data?.clientPrincipal;
        return {
          authenticated: Boolean(client?.userId),
          user: client
            ? {
                userId: client.userId,
                userDetails: client.userDetails || "",
                displayName:
                  client.claims?.find((claim) => claim.typ === "name")?.val ||
                  client.userDetails ||
                  "Authenticated User",
                userRoles: client.userRoles || [],
              }
            : null,
          mode: "azure-easy-auth",
        };
      }
    } catch {
      // Fall through to server-side local/development auth detection.
    }

    return fetchJson("/api/me");
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function closeMenu() {
    const menu = authBox.querySelector(".authMenu");
    if (menu) {
      menu.remove();
    }
    authBtn.setAttribute("aria-expanded", "false");
  }

  function setButton(label, mode) {
    clearNode(authBtn);

    const avatar = document.createElement("span");
    avatar.className = "authAvatar";
    avatar.textContent = label.slice(0, 1).toUpperCase();

    const name = document.createElement("span");
    name.className = "authName";
    name.textContent = label;

    authBtn.className = mode === "out" ? "authPill authPill--loggedOut" : "authPill";
    authBtn.appendChild(avatar);
    authBtn.appendChild(name);
  }

  function redirectToLogin() {
    window.location.href = loginUrl();
  }

  function openMenu(user) {
    closeMenu();

    const menu = document.createElement("div");
    menu.className = "authMenu";

    const email = document.createElement("div");
    email.className = "authMenuEmail";
    email.textContent = user.userDetails || "";

    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "authMenuAction";
    signOut.textContent = "Sign out";
    signOut.onclick = function () {
      window.location.href = logoutUrl();
    };

    menu.appendChild(email);
    menu.appendChild(signOut);
    authBox.appendChild(menu);
    authBtn.setAttribute("aria-expanded", "true");

    setTimeout(function () {
      function onDocClick(event) {
        if (!authBox.contains(event.target)) {
          document.removeEventListener("click", onDocClick, true);
          closeMenu();
        }
      }

      document.addEventListener("click", onDocClick, true);
    }, 0);
  }

  async function requireAuthOrRedirect() {
    const state = await loadAuthState();
    const user = state?.user || null;
    const authenticated = Boolean(state?.authenticated || user?.userId);

    if (!authenticated) {
      setButton("Sign in", "out");
      authBtn.onclick = redirectToLogin;
      return null;
    }

    const displayName = user.displayName || user.userDetails || "Authenticated User";
    setButton(displayName, "in");
    authBtn.onclick = function () {
      openMenu(user);
    };

    return state;
  }

  window.authBootstrap = {
    loadAuthState,
    requireAuthOrRedirect,
    redirectToLogin,
  };
})();
