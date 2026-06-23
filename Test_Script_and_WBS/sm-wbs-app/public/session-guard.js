// session-guard.js — re-authenticate when the APAC shell session expires.
//
// This app runs inside the shell's reverse proxy. When the shell's ~1 h Azure
// session lapses, proxied requests come back 401. Reloading the page turns the
// request into a top-level navigation, which the shell answers by bouncing the
// user through silent re-authentication and straight back here.
//
// Permission failures use HTTP 403 (never 401), so this can't interfere with
// them. In dev mode the shell never gates, so this code simply never fires.
(() => {
  const _fetch = window.fetch;
  let reloading = false;
  window.fetch = async (...args) => {
    const res = await _fetch(...args);
    if (res.status === 401 && !reloading) {
      reloading = true;
      window.location.reload();
    }
    return res;
  };
})();
