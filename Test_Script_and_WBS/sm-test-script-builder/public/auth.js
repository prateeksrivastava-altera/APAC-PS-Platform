// ============================================================
// MSAL.js 2.x Authentication Wrapper
// ============================================================
// Handles Azure AD SSO via MSAL.js redirect flow.
// Exported interface: { init, login, logout, getToken, getUser, isAuthenticated }

window.auth = (() => {
  let cachedUser = null;
  let devMode = false;
  let msalInstance = null;
  let activeAccount = null;
  let _clientId = "";

  /**
   * Initialize authentication.
   * Fetches /auth-config, sets up MSAL if configured, handles redirect callback.
   * Returns the active user object if authenticated, or null if not.
   */
  async function init() {
    // Relative path — works both standalone (/auth-config) and when the
    // APAC shell embeds this app under /apps/test-script/auth-config.
    const configRes = await fetch("auth-config");
    const authConfig = await configRes.json();

    if (!authConfig.clientId || !authConfig.tenantId) {
      // Dev mode — Azure AD not configured. When running behind the APAC shell,
      // /auth-config returns the upstream user via devUser. Treat that as an
      // implicit sign-in (no separate login page needed).
      devMode = true;
      const devUser = authConfig.devUser || { name: "Developer", username: "dev@local" };

      // If we were handed a real user from the shell, mark the session signed-in.
      if (devUser.name && devUser.name !== "Developer") {
        sessionStorage.setItem("dev_authenticated", "true");
      }

      if (sessionStorage.getItem("dev_authenticated") === "true") {
        cachedUser = devUser;
        return cachedUser;
      }
      return null;
    }

    devMode = false;
    _clientId = authConfig.clientId;

    const msalConfig = {
      auth: {
        clientId: authConfig.clientId,
        authority: `https://login.microsoftonline.com/${authConfig.tenantId}`,
        redirectUri: window.location.origin + "/index.html",
      },
      cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
      },
    };

    msalInstance = new msal.PublicClientApplication(msalConfig);

    // Handle redirect callback (post-login return)
    try {
      const response = await msalInstance.handleRedirectPromise();
      if (response && response.account) {
        activeAccount = response.account;
        cachedUser = _userFromAccount(activeAccount);
        return cachedUser;
      }
    } catch (err) {
      console.error("MSAL handleRedirectPromise error:", err);
    }

    // Check for existing session
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      activeAccount = accounts[0];
      msalInstance.setActiveAccount(activeAccount);
      cachedUser = _userFromAccount(activeAccount);
      return cachedUser;
    }

    return null;
  }

  /**
   * Map an MSAL account object to our user shape.
   */
  function _userFromAccount(account) {
    return {
      name: account.name || account.username || "User",
      username: account.username || "",
    };
  }

  /**
   * Trigger Azure AD login via redirect.
   */
  function login() {
    if (devMode) {
      sessionStorage.setItem("dev_authenticated", "true");
      window.location.replace("index.html");
      return;
    }

    msalInstance.loginRedirect({
      // Custom Azure AD scope granting access to this backend API (api://<clientId>/access_as_user)
      scopes: [`api://${_clientId}/access_as_user`],
    });
  }

  /**
   * Sign out and redirect to login page.
   */
  function logout() {
    sessionStorage.removeItem("dev_authenticated");
    cachedUser = null;
    activeAccount = null;

    if (devMode) {
      window.location.replace("login.html");
      return;
    }

    msalInstance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin + "/login.html",
    });
  }

  /**
   * Acquire an access token silently, falling back to redirect on failure.
   * Returns null in dev mode.
   */
  async function getToken() {
    if (devMode || !msalInstance || !activeAccount) return null;

    const request = {
      // Custom Azure AD scope granting access to this backend API (api://<clientId>/access_as_user)
      scopes: [`api://${_clientId}/access_as_user`],
      account: activeAccount,
    };

    try {
      const response = await msalInstance.acquireTokenSilent(request);
      return response.accessToken;
    } catch (err) {
      console.warn("Silent token acquisition failed, redirecting:", err);
      msalInstance.acquireTokenRedirect(request);
      return null;
    }
  }

  /**
   * Get cached user info.
   */
  function getUser() {
    return cachedUser;
  }

  /**
   * Check if user is authenticated.
   */
  function isAuthenticated() {
    return cachedUser !== null;
  }

  return { init, login, logout, getToken, getUser, isAuthenticated };
})();
