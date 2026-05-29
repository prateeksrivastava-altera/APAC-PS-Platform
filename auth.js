async function requireAuthOrRedirect() {
  try {
    const res = await fetch("/.auth/me", {
      cache: "no-store",
      credentials: "include"
    });

    const me = await res.json();
    const cp = me?.clientPrincipal;

    if (!cp || !cp.userId) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/.auth/login/aad?post_login_redirect_uri=${returnTo}`;
      return false;
    }

    return true;
  } catch {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/.auth/login/aad?post_login_redirect_uri=${returnTo}`;
    return false;
  }
}

(function () {
  const authBox = document.getElementById("authBox");
  const btn = document.getElementById("authBtn");
  if (!authBox || !btn) return;

  const loginUrl =
    "/.auth/login/aad?post_login_redirect_uri=" +
    encodeURIComponent(window.location.pathname + window.location.search);

  const logoutUrl =
    "/.auth/logout?post_logout_redirect_uri=" + encodeURIComponent("/");

  const myAccountUrl = "https://myaccount.microsoft.com/";
  const myHistoryUrl = "/history.html";
  const allHistoryUrl = "/history.html?scope=all";

  function toTitle(s) {
    const t = String(s || "").trim();
    if (!t) return "";
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  function displayNameFrom(nameClaim, email) {
    const n = String(nameClaim || "").trim();
    if (n) return n;

    const upn = String(email || "").trim();
    if (!upn.includes("@")) return "User";

    const left = upn.split("@")[0];
    const parts = left.split(/[._-]+/).filter(Boolean);
    if (!parts.length) return "User";

    const first = toTitle(parts[0]);
    const last = parts.length >= 2 ? toTitle(parts[1]) : "";
    return last ? `${first} ${last}` : first;
  }

  function clearElement(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function closeMenu() {
    const m = authBox.querySelector(".authMenu");
    if (m) m.remove();
    btn.setAttribute("aria-expanded", "false");
  }

  function createAvatar() {
    const img = document.createElement("img");
    img.className = "authAvatar";
    img.src = "/user.png";
    img.alt = "";
    return img;
  }

  function createNameSpan(text) {
    const span = document.createElement("span");
    span.className = "authName";
    span.textContent = String(text || "");
    return span;
  }

  function createMenuButton(id, text, onClick) {
    const b = document.createElement("button");
    b.className = "authMenuAction";
    b.type = "button";
    b.id = id;
    b.textContent = text;
    b.onclick = onClick;
    return b;
  }

  function extractRoles(client) {
    const roles = new Set([...(client?.userRoles || [])]);
    for (const claim of client?.claims || []) {
      if (
        claim?.typ === "roles" ||
        claim?.typ === "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
      ) {
        const value = String(claim?.val || "").trim();
        if (value) roles.add(value);
      }
    }
    return roles;
  }

  function applyRoleVisibility(roles) {
    const isPortalAdmin = roles?.has("ioc_admin");
    const adminOnlyHrefs = new Set([
      "import.html",
      "/import.html",
      "trace.html",
      "/trace.html",
      "filehash.html",
      "/filehash.html"
    ]);

    document.querySelectorAll("a[href]").forEach((link) => {
      if (adminOnlyHrefs.has(link.getAttribute("href"))) {
        link.style.display = isPortalAdmin ? "" : "none";
      }
    });

    document.querySelectorAll("[data-admin-only='true']").forEach((node) => {
      node.style.display = isPortalAdmin ? "" : "none";
    });
  }

  function openMenu(email, roles) {
    closeMenu();

    const menu = document.createElement("div");
    menu.className = "authMenu";

    const row = document.createElement("div");
    row.className = "authMenuRow";

    const sub = document.createElement("div");
    sub.className = "authMenuSub";
    sub.textContent = String(email || "");

    row.appendChild(sub);

    const divider = document.createElement("div");
    divider.className = "authMenuDivider";

    const spacer = document.createElement("div");
    spacer.style.height = "10px";

    const myAccountBtn = createMenuButton(
      "authMyAccountBtn",
      "My Account",
      () => window.open(myAccountUrl, "_blank", "noopener,noreferrer")
    );

    const myHistoryBtn = createMenuButton(
      "authMyHistoryBtn",
      "My Search History",
      () => { window.location.href = myHistoryUrl; }
    );

    const allHistoryBtn = createMenuButton(
      "authAllHistoryBtn",
      "All History",
      () => { window.location.href = allHistoryUrl; }
    );

    const signOutBtn = createMenuButton(
      "authSignOutBtn",
      "Sign out",
      () => { window.location.href = logoutUrl; }
    );

    menu.appendChild(row);
    menu.appendChild(divider);
    menu.appendChild(myAccountBtn);
    menu.appendChild(spacer.cloneNode());
    menu.appendChild(myHistoryBtn);
    if (roles?.has("ioc_admin")) {
      menu.appendChild(spacer.cloneNode());
      menu.appendChild(allHistoryBtn);
    }
    menu.appendChild(spacer);
    menu.appendChild(signOutBtn);

    authBox.appendChild(menu);
    btn.setAttribute("aria-expanded", "true");

    setTimeout(() => {
      const onDocClick = (e) => {
        if (!authBox.contains(e.target)) {
          document.removeEventListener("click", onDocClick, true);
          closeMenu();
        }
      };
      document.addEventListener("click", onDocClick, true);
    }, 0);
  }

  function setLoggedOut() {
    closeMenu();
    btn.className = "authPill authPill--loggedOut";
    clearElement(btn);
    btn.appendChild(createAvatar());
    btn.appendChild(createNameSpan("Sign in"));
    btn.onclick = () => { window.location.href = loginUrl; };
  }

  function setLoggedIn(displayName, email, roles) {
    closeMenu();
    btn.className = "authPill";
    clearElement(btn);
    btn.appendChild(createAvatar());
    btn.appendChild(createNameSpan(displayName));
    btn.onclick = () => openMenu(email, roles);
  }

  async function warmUmbrellaCacheOnce() {
    const warmKey = "umbrella_cache_warm_attempted";
    try {
      if (sessionStorage.getItem(warmKey) === "1") return;
      sessionStorage.setItem(warmKey, "1");

      await fetch("/api/proxy/warmUmbrella", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{}"
      });
    } catch {
      // Fire-and-forget warm path; a later health check or search can still refresh it.
    }
  }

  (async function initAuth() {
    try {
      if (!(await requireAuthOrRedirect())) return;

      const res = await fetch("/.auth/me", {
        cache: "no-store",
        credentials: "include"
      });

      if (!res.ok) {
        setLoggedOut();
        return;
      }

      const data = await res.json();
      const client = data?.clientPrincipal;

      if (!client || !client.userId) {
        setLoggedOut();
        return;
      }

      const email = client.userDetails || "";
      const nameClaim =
        client.claims?.find((c) => c.typ === "name")?.val || "";
      const roles = extractRoles(client);

      const displayName = displayNameFrom(nameClaim, email);
      setLoggedIn(displayName, email, roles);
      applyRoleVisibility(roles);
      warmUmbrellaCacheOnce();

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeMenu();
      });
    } catch {
      setLoggedOut();
    }
  })();
})();
