// md-upgrade.js — converts the WBS app's legacy <button class="md-btn…"> into
// Material Web Components.
//
// The WBS app builds most buttons as innerHTML strings across many render
// functions, so instead of editing every template this upgrader runs once:
//   1. a synchronous initial scan — this file is loaded AFTER the page markup
//      but BEFORE the page's main script, so static buttons become MWC before
//      any listeners are attached;
//   2. a MutationObserver — catches buttons added later by render functions.
//
// Event delegation keeps working: the MWC element carries the same data-*
// attributes and emits a bubbling `click`; the handlers match `[data-action]`
// (the `button` tag qualifier was dropped).
(() => {
  function variantFor(cls) {
    if (cls.indexOf("md-btn--icon") !== -1) return "md-icon-button";
    if (cls.indexOf("md-btn--outlined") !== -1) return "md-outlined-button";
    if (cls.indexOf("md-btn--text") !== -1) return "md-text-button";
    if (cls.indexOf("md-btn--tonal") !== -1) return "md-filled-tonal-button";
    return "md-filled-button";
  }

  function upgrade(btn) {
    const cls = btn.getAttribute("class") || "";
    if (cls.indexOf("md-btn") === -1) return;
    const tag = variantFor(cls);
    const isIcon = tag === "md-icon-button";
    const el = document.createElement(tag);

    // Copy every attribute except class.
    for (const a of Array.from(btn.attributes)) {
      if (a.name !== "class") el.setAttribute(a.name, a.value);
    }
    // Keep only the non-md-btn classes (layout hooks).
    const extra = cls.split(/\s+/).filter((c) => c && c.indexOf("md-btn") !== 0);
    if (extra.length) el.setAttribute("class", extra.join(" "));

    // Move children across; a label button's leading Material Symbols icon
    // goes into slot="icon" so it lays out beside the label, not on top of it.
    while (btn.firstChild) {
      const ch = btn.firstChild;
      if (!isIcon && ch.nodeType === 1 && ch.classList &&
          ch.classList.contains("material-symbols-outlined")) {
        ch.setAttribute("slot", "icon");
      }
      el.appendChild(ch);
    }
    btn.replaceWith(el);
  }

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches("button.md-btn")) upgrade(node);
    if (node.querySelectorAll) node.querySelectorAll("button.md-btn").forEach(upgrade);
  }

  // Initial pass — synchronous, so static buttons are MWC before page scripts run.
  scan(document.body || document.documentElement);

  // Dynamically-rendered buttons (render functions assigning innerHTML).
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) scan(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
