(function () {
  "use strict";

  const transcriptEl = document.getElementById("chatTranscript");
  const formEl = document.getElementById("chatForm");
  const promptEl = document.getElementById("promptInput");
  const sendBtnEl = document.getElementById("sendBtn");
  const chatHintEl = document.getElementById("chatHint");
  const archiveChatBtnEl = document.getElementById("archiveChatBtn");
  const refreshChatBtnEl = document.getElementById("refreshChatBtn");
  const archiveCountEl = document.getElementById("archiveCount");
  const archiveListEl = document.getElementById("archiveList");
  const screenshotInputEl = document.getElementById("screenshotInput");
  const screenshotListEl = document.getElementById("screenshotList");
  const composerDropZoneEl = document.getElementById("composerDropZone");
  const kbEnhancerToggleEl = document.getElementById("kbEnhancerToggle");
  const kbEnhancerBodyEl = document.getElementById("kbEnhancerBody");
  const kbProductSelectEl = document.getElementById("kbProductSelect");
  const kbDropZoneEl = document.getElementById("kbDropZone");
  const kbFileInputEl = document.getElementById("kbFileInput");
  const kbFileLabelEl = document.getElementById("kbFileLabel");
  const kbUploadBtnEl = document.getElementById("kbUploadBtn");
  const kbStatusEl = document.getElementById("kbStatus");
  const sidebarVersionEl = document.getElementById("sidebarVersion");
  const mainHeaderIdentityEl = document.getElementById("mainHeaderIdentity");
  const mainHeaderIdentityAvatarEl = document.getElementById("mainHeaderIdentityAvatar");
  const mainHeaderIdentityNameEl = document.getElementById("mainHeaderIdentityName");
  const hubFeedbackBtnEl = document.getElementById("hubFeedbackBtn");
  const hubFeedbackAdminBtnEl = document.getElementById("hubFeedbackAdminBtn");
  const hubFeedbackOverlayEl = document.getElementById("hubFeedbackOverlay");
  const hubFeedbackAdminOverlayEl = document.getElementById("hubFeedbackAdminOverlay");
  const viewTargetButtons = document.querySelectorAll("[data-view-target]");
  const appViews = document.querySelectorAll(".appView");
  const troubleshootingViewEl = document.getElementById("troubleshooting-platform");
  const popoutTroubleshooterBtnEl = document.getElementById("popoutTroubleshooterBtn");
  const popoutSmeBtnEl = document.getElementById("popoutSmeBtn");
  const openFullHubLinkEl = document.getElementById("openFullHubLink");
  const smeNavToggleEl = document.getElementById("smeNavToggle");
  const smeNavSubmenuEl = document.getElementById("smeNavSubmenu");
  const smeRoleButtons = document.querySelectorAll("[data-sme-role]");
  const smePanelTitleEl = document.getElementById("smePanelTitle");
  const smePanelHintEl = document.getElementById("smePanelHint");
  const smeTranscriptEl = document.getElementById("smeTranscript");
  const smeFormEl = document.getElementById("smeForm");
  const smePromptInputEl = document.getElementById("smePromptInput");
  const smeSendBtnEl = document.getElementById("smeSendBtn");
  const smeAttachmentInputEl = document.getElementById("smeAttachmentInput");
  const smeAttachmentListEl = document.getElementById("smeAttachmentList");
  const smeComposerDropZoneEl = smeFormEl ? smeFormEl.querySelector(".composerDropZone") : null;
  const integrationFormEl = document.getElementById("integrationForm");
  const integrationSowFileEl = document.getElementById("integrationSowFile");
  const integrationSowFileMetaEl = document.getElementById("integrationSowFileMeta");
  const integrationResultEl = document.getElementById("integrationResult");
  const integrationSendBtnEl = document.getElementById("integrationSendBtn");
  const trainingFrameEl = document.querySelector(".embeddedAppFrame");
  const chatHistory = [];
  const TROUBLESHOOTING_ARCHIVE_KEY = "apac_ps_troubleshooting_archives";
  const currentChatMessages = [];
  let archivedChats = [];
  const defaultChatHint =
    "Chat is enabled, and screenshot upload is available.";
  const authenticatedChatHint = "Authenticated. Chat and screenshot review are enabled.";
  const waitingStages = [
    "Reviewing the prompt and isolating the issue...",
    "Checking the general troubleshooting guidelines...",
    "Searching the relevant product documentation and KBs...",
    "Combining the findings into next-step guidance..."
  ];
  let pendingScreenshots = [];
  let isAuthenticated = false;
  let requestPending = false;
  let waitingStageTimer = null;
  let waitingStageIndex = 0;
  let kbExpanded = false;
  let kbPending = false;
  let kbFile = null;
  let smeMenuExpanded = false;
  let activeSmeRoleKey = "integration-consultant";
  const smeRoleConfigs = {
    "integration-consultant": {
      title: "Integration Consultant",
      description: "Ask your Integration Consultant question.",
      missionLabel: "",
      missionId: "4050"
    },
    "systems-engineering": {
      title: "Systems Engineering",
      description: "Ask your Systems Engineering question.",
      missionLabel: "",
      missionId: "43459"
    },
    "implementation-consultant": {
      title: "Implementation Consultant",
      description: "Ask your Implementation Consultant question.",
      missionLabel: "",
      missionId: ""
    },
    "project-manager": {
      title: "Project Manager",
      description: "Ask your Project Manager question.",
      missionLabel: "",
      missionId: ""
    }
  };
  const smeSessions = {};
  const SME_ATTACHMENT_ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"];
  const url = new URL(window.location.href);
  const widgetMode = url.searchParams.get("widget") === "1";
  const desktopWidgetMode = Boolean(window.desktopWidget && window.desktopWidget.isDesktopWidget);
  const widgetView = url.searchParams.get("view") || "";
  const widgetSmeRole = url.searchParams.get("smeRole") || "";
  const HUB_AUTH_STORAGE_KEY = "apac_hub_auth_user";
  const ACTIVE_VIEW_STORAGE_KEY = "apac_hub_active_view";
  const HUB_REQUEST_ADMIN_EMAIL = "prateek.srivastava@alterahealth.com";
  const HUB_REQUEST_STATUS_VALUES = ["New", "WIP", "Closed Completed", "Closed Cancelled"];
  let activeViewId = readStoredActiveView() || "platform-briefing";
  let hubFeedbackFormState = {
    type: "bug",
    application: "Platform Briefing",
    description: "",
    pending: false,
    message: "",
    error: false,
  };
  let hubFeedbackAdminState = {
    loading: false,
    message: "",
    error: false,
    requests: [],
  };

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function readStoredHubAuthUser() {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(HUB_AUTH_STORAGE_KEY) || "null");
      if (stored && (stored.name || stored.email)) {
        return {
          name: stored.name || "",
          email: stored.email || "",
        };
      }
    } catch (_error) {
      // Ignore storage read issues.
    }

    return null;
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

  function getPreferredDisplayName(user) {
    if (!user) {
      return "User";
    }

    const rawName = String(user.name || "").trim();
    if (rawName && rawName !== String(user.email || "").trim()) {
      return rawName;
    }

    const emailBasedName = humanizeIdentityName(user.email || "");
    if (emailBasedName) {
      return emailBasedName;
    }

    return rawName || user.email || "User";
  }

  function readStoredActiveView() {
    try {
      const stored = window.sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY) || "";
      if (stored && document.getElementById(stored)) {
        return stored;
      }
    } catch (_error) {
      // Ignore storage read issues.
    }

    return null;
  }

  function persistActiveView(viewId) {
    try {
      if (viewId) {
        window.sessionStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, viewId);
      }
    } catch (_error) {
      // Ignore storage write issues.
    }
  }

  function isHubRequestAdminClient(user) {
    return String(user && user.email ? user.email : "").trim().toLowerCase() === HUB_REQUEST_ADMIN_EMAIL;
  }

  function getCurrentHubUser() {
    return window.__hubAuthUser || readStoredHubAuthUser() || null;
  }

  function getCurrentApplicationLabel() {
    if (activeViewId === "troubleshooting-platform") {
      return "Troubleshooting Platform";
    }
    if (activeViewId === "training-platform") {
      return "Training Platform";
    }
    if (activeViewId === "integration-sow-platform") {
      return "SOW to Design (Integration)";
    }
    if (activeViewId === "subject-matter-expert") {
      const role = smeRoleConfigs[activeSmeRoleKey] || smeRoleConfigs["integration-consultant"];
      return "Subject Matter Expert - " + role.title;
    }
    return "Platform Briefing";
  }

  function getApplicationOptions() {
    const options = [
      "Platform Briefing",
      "Troubleshooting Platform",
      "Training Platform",
      "Subject Matter Expert - Integration Consultant",
      "Subject Matter Expert - Systems Engineering",
      "Subject Matter Expert - Implementation Consultant",
      "Subject Matter Expert - Project Manager",
      "SOW to Design (Integration)",
    ];
    const current = getCurrentApplicationLabel();
    if (!options.includes(current)) {
      options.unshift(current);
    }
    return options;
  }

  function closeHubFeedbackForm() {
    if (hubFeedbackOverlayEl) {
      hubFeedbackOverlayEl.hidden = true;
      hubFeedbackOverlayEl.innerHTML = "";
    }
  }

  function closeHubFeedbackAdmin() {
    if (hubFeedbackAdminOverlayEl) {
      hubFeedbackAdminOverlayEl.hidden = true;
      hubFeedbackAdminOverlayEl.innerHTML = "";
    }
  }

  function renderHubFeedbackForm() {
    if (!hubFeedbackOverlayEl) {
      return;
    }
    const options = getApplicationOptions();
    hubFeedbackOverlayEl.innerHTML = `
      <div class="hubOverlayCard" role="dialog" aria-modal="true" aria-labelledby="hub-feedback-title">
        <div class="hubOverlayHeader">
          <div>
            <div id="hub-feedback-title" class="hubOverlayTitle">Report a bug or enhancement</div>
            <div class="hubOverlaySub">Submit a hub issue or improvement request. The current application is selected by default.</div>
          </div>
          <button class="light-btn hubOverlayClose" type="button" id="hubFeedbackCloseBtn">Close</button>
        </div>
        <form id="hubFeedbackForm">
          <div class="hubFormGrid">
            <div class="hubField">
              <label>Request type</label>
              <div class="hubRadioRow">
                <label class="hubRadio">
                  <input type="radio" name="hubRequestType" value="bug" ${hubFeedbackFormState.type !== "enhancement" ? "checked" : ""}>
                  <span>Bug</span>
                </label>
                <label class="hubRadio">
                  <input type="radio" name="hubRequestType" value="enhancement" ${hubFeedbackFormState.type === "enhancement" ? "checked" : ""}>
                  <span>Enhancement</span>
                </label>
              </div>
            </div>
            <div class="hubField">
              <label for="hubFeedbackApplication">Application</label>
              <select id="hubFeedbackApplication" class="hubSelect">
                ${options.map(function (option) {
                  return '<option value="' + escapeHtml(option) + '"' + (hubFeedbackFormState.application === option ? " selected" : "") + ">" + escapeHtml(option) + "</option>";
                }).join("")}
              </select>
            </div>
            <div class="hubField hubField--full">
              <label for="hubFeedbackDescription">Description</label>
              <textarea id="hubFeedbackDescription" class="hubTextarea" placeholder="Describe the bug or enhancement request.">${escapeHtml(hubFeedbackFormState.description)}</textarea>
            </div>
          </div>
          <div class="hubOverlayActions">
            <button class="light-btn" type="button" id="hubFeedbackCancelBtn">Cancel</button>
            <button class="primary" type="submit" id="hubFeedbackSubmitBtn"${hubFeedbackFormState.pending ? " disabled" : ""}>${hubFeedbackFormState.pending ? "Submitting..." : "Submit Request"}</button>
          </div>
          ${hubFeedbackFormState.message ? `<div class="hubFeedbackStatus${hubFeedbackFormState.error ? " hubFeedbackStatus--error" : ""}">${escapeHtml(hubFeedbackFormState.message)}</div>` : ""}
        </form>
      </div>
    `;
    hubFeedbackOverlayEl.hidden = false;
    const closeBtn = document.getElementById("hubFeedbackCloseBtn");
    const cancelBtn = document.getElementById("hubFeedbackCancelBtn");
    const form = document.getElementById("hubFeedbackForm");
    if (closeBtn) closeBtn.onclick = closeHubFeedbackForm;
    if (cancelBtn) cancelBtn.onclick = closeHubFeedbackForm;
    if (form) form.onsubmit = submitHubFeedback;
    hubFeedbackOverlayEl.onclick = function (event) {
      if (event.target === hubFeedbackOverlayEl) {
        closeHubFeedbackForm();
      }
    };
  }

  function openHubFeedbackForm() {
    hubFeedbackFormState = {
      type: hubFeedbackFormState.type || "bug",
      application: getCurrentApplicationLabel(),
      description: "",
      pending: false,
      message: "",
      error: false,
    };
    renderHubFeedbackForm();
  }

  async function submitHubFeedback(event) {
    event.preventDefault();
    const typeEl = document.querySelector('input[name="hubRequestType"]:checked');
    const appEl = document.getElementById("hubFeedbackApplication");
    const descriptionEl = document.getElementById("hubFeedbackDescription");
    hubFeedbackFormState.type = typeEl ? typeEl.value : "bug";
    hubFeedbackFormState.application = appEl ? appEl.value : getCurrentApplicationLabel();
    hubFeedbackFormState.description = descriptionEl ? descriptionEl.value.trim() : "";
    if (!hubFeedbackFormState.description) {
      hubFeedbackFormState.message = "Description is required.";
      hubFeedbackFormState.error = true;
      renderHubFeedbackForm();
      return;
    }
    hubFeedbackFormState.pending = true;
    hubFeedbackFormState.message = "";
    hubFeedbackFormState.error = false;
    renderHubFeedbackForm();
    try {
      const response = await fetch("/api/hub-requests", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: hubFeedbackFormState.type,
          application: hubFeedbackFormState.application,
          description: hubFeedbackFormState.description,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to submit request.");
      }
      hubFeedbackFormState.pending = false;
      hubFeedbackFormState.message = "Request submitted successfully.";
      hubFeedbackFormState.error = false;
      hubFeedbackFormState.description = "";
      renderHubFeedbackForm();
    } catch (error) {
      hubFeedbackFormState.pending = false;
      hubFeedbackFormState.message = error.message || "Unable to submit request.";
      hubFeedbackFormState.error = true;
      renderHubFeedbackForm();
    }
  }

  function renderHubFeedbackAdmin() {
    if (!hubFeedbackAdminOverlayEl) {
      return;
    }
    const rows = hubFeedbackAdminState.requests.map(function (request) {
      const rowId = escapeHtml(String(request.id || ""));
      const statusOptions = HUB_REQUEST_STATUS_VALUES.map(function (status) {
        return '<option value="' + escapeHtml(status) + '"' + (String(request.status || "") === status ? " selected" : "") + ">" + escapeHtml(status) + "</option>";
      }).join("");
      return `
        <tr data-request-id="${rowId}">
          <td>${rowId}</td>
          <td>${escapeHtml(request.type || "")}</td>
          <td>${escapeHtml(request.application || "")}</td>
          <td>${escapeHtml(request.description || "")}</td>
          <td>${escapeHtml(request.reportedByName || request.reportedByEmail || "")}</td>
          <td>${escapeHtml(request.reportedAtDisplay || "")}</td>
          <td>
            <select class="hubRequestStatusSelect" data-request-id="${rowId}">
              ${statusOptions}
            </select>
          </td>
          <td>
            <textarea class="hubRequestNotesInput" data-request-id="${rowId}" placeholder="Add notes...">${escapeHtml(request.notes || "")}</textarea>
            <div style="margin-top:8px; display:flex; justify-content:flex-end;">
              <button class="light-btn hubRequestSaveBtn" data-request-id="${rowId}" type="button">Save</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
    hubFeedbackAdminOverlayEl.innerHTML = `
      <div class="hubOverlayCard" role="dialog" aria-modal="true" aria-labelledby="hub-feedback-admin-title">
        <div class="hubOverlayHeader">
          <div>
            <div id="hub-feedback-admin-title" class="hubOverlayTitle">Bugs and enhancement requests</div>
            <div class="hubOverlaySub">Review new requests, track status, and add implementation notes.</div>
          </div>
          <button class="light-btn hubOverlayClose" type="button" id="hubFeedbackAdminCloseBtn">Close</button>
        </div>
        ${hubFeedbackAdminState.message ? `<div class="hubFeedbackStatus${hubFeedbackAdminState.error ? " hubFeedbackStatus--error" : ""}">${escapeHtml(hubFeedbackAdminState.message)}</div>` : ""}
        <div class="hubFeedbackTableWrap" style="margin-top:14px;">
          <table class="hubFeedbackTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Application</th>
                <th>Description</th>
                <th>Reported By</th>
                <th>Date Reported</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${hubFeedbackAdminState.loading ? '<tr><td colspan="8">Loading requests...</td></tr>' : (rows || '<tr><td colspan="8">No requests submitted yet.</td></tr>')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    hubFeedbackAdminOverlayEl.hidden = false;
    const closeBtn = document.getElementById("hubFeedbackAdminCloseBtn");
    if (closeBtn) closeBtn.onclick = closeHubFeedbackAdmin;
    hubFeedbackAdminOverlayEl.onclick = function (event) {
      if (event.target === hubFeedbackAdminOverlayEl) {
        closeHubFeedbackAdmin();
      }
    };
    hubFeedbackAdminOverlayEl.querySelectorAll(".hubRequestSaveBtn").forEach(function (button) {
      button.onclick = function () {
        saveHubFeedbackRequest(button.getAttribute("data-request-id"));
      };
    });
  }

  async function loadHubFeedbackRequests() {
    hubFeedbackAdminState.loading = true;
    hubFeedbackAdminState.message = "";
    hubFeedbackAdminState.error = false;
    renderHubFeedbackAdmin();
    try {
      const response = await fetch("/api/hub-requests", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load requests.");
      }
      hubFeedbackAdminState.loading = false;
      hubFeedbackAdminState.requests = Array.isArray(payload.requests) ? payload.requests : [];
      renderHubFeedbackAdmin();
    } catch (error) {
      hubFeedbackAdminState.loading = false;
      hubFeedbackAdminState.message = error.message || "Unable to load requests.";
      hubFeedbackAdminState.error = true;
      renderHubFeedbackAdmin();
    }
  }

  function openHubFeedbackAdmin() {
    hubFeedbackAdminState.message = "";
    hubFeedbackAdminState.error = false;
    renderHubFeedbackAdmin();
    loadHubFeedbackRequests();
  }

  async function saveHubFeedbackRequest(requestId) {
    const row = hubFeedbackAdminOverlayEl ? hubFeedbackAdminOverlayEl.querySelector('tr[data-request-id="' + requestId + '"]') : null;
    if (!row) {
      return;
    }
    const statusEl = row.querySelector(".hubRequestStatusSelect");
    const notesEl = row.querySelector(".hubRequestNotesInput");
    try {
      const response = await fetch("/api/hub-requests/" + encodeURIComponent(requestId), {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: statusEl ? statusEl.value : "New",
          notes: notesEl ? notesEl.value.trim() : "",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save request.");
      }
      hubFeedbackAdminState.requests = hubFeedbackAdminState.requests.map(function (request) {
        return String(request.id) === String(requestId) ? payload.request : request;
      });
      hubFeedbackAdminState.message = "Request updated.";
      hubFeedbackAdminState.error = false;
      renderHubFeedbackAdmin();
    } catch (error) {
      hubFeedbackAdminState.message = error.message || "Unable to save request.";
      hubFeedbackAdminState.error = true;
      renderHubFeedbackAdmin();
    }
  }

  function renderInline(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function renderParagraph(text) {
    return "<p>" + renderInline(text) + "</p>";
  }

  function renderList(items, ordered) {
    const tag = ordered ? "ol" : "ul";
    return (
      "<" +
      tag +
      ' class="messageList">' +
      items
        .map(function (item) {
          const text = item && typeof item === "object" ? item.text : item;
          const children =
            item && typeof item === "object" && Array.isArray(item.children) ? item.children : [];
          return (
            "<li>" +
            renderInline(text) +
            (children.length ? renderList(children, false) : "") +
            "</li>"
          );
        })
        .join("") +
      "</" +
      tag +
      ">"
    );
  }

  function renderCodeBlock(lines) {
    return '<pre class="messageCode"><code>' + escapeHtml(lines.join("\n")) + "</code></pre>";
  }

  function normalizeLabel(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getCalloutType(text) {
    const normalized = normalizeLabel(text);

    if (
      normalized === "recommended next action" ||
      normalized === "recommendation" ||
      normalized === "recommended action" ||
      normalized === "next steps"
    ) {
      return "recommendation";
    }

    return "";
  }

  function isStandaloneSectionHeading(text) {
    const normalized = normalizeLabel(text);
    return [
      "current understanding",
      "likely issue class",
      "next checks",
      "next steps",
      "what the documents suggest",
      "what this suggests",
      "workaround or impact",
      "recommended next action",
      "recommendation",
      "next steps",
      "please confirm",
      "escalation ready summary"
    ].includes(normalized);
  }

  function renderBlock(block) {
    if (block.type === "paragraph") {
      return renderParagraph(block.text);
    }

    if (block.type === "list") {
      return renderList(block.items, block.ordered);
    }

    if (block.type === "code") {
      return renderCodeBlock(block.lines);
    }

    if (block.type === "heading") {
      return '<h4 class="messageHeading">' + renderInline(block.text) + "</h4>";
    }

    if (block.type === "keyValue") {
      return (
        '<div class="messageKeyValue"><span class="messageKey">' +
        renderInline(block.key) +
        ':</span><span class="messageValue">' +
        renderInline(block.value || "") +
        "</span></div>"
      );
    }

    if (block.type === "callout") {
      const titleClass =
        block.calloutType === "confirm"
          ? "messageCalloutTitle messageCalloutTitle--confirm"
          : "messageCalloutTitle messageCalloutTitle--recommendation";
      return (
        '<section class="messageCallout messageCallout--' +
        block.calloutType +
        '"><div class="' +
        titleClass +
        '">' +
        renderInline(block.title) +
        "</div>" +
        block.blocks.map(renderBlock).join("") +
        "</section>"
      );
    }

    return "";
  }

  function renderBody(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const blocks = [];
    let paragraphLines = [];
    let listItems = [];
    let listOrdered = false;
    let codeLines = [];
    let inCodeBlock = false;

    function flushParagraph() {
      if (!paragraphLines.length) {
        return;
      }

      blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
      paragraphLines = [];
    }

    function flushList() {
      if (!listItems.length) {
        return;
      }

      blocks.push({ type: "list", items: listItems.slice(), ordered: listOrdered });
      listItems = [];
      listOrdered = false;
    }

    function flushCodeBlock() {
      if (!codeLines.length) {
        return;
      }

      blocks.push({ type: "code", lines: codeLines.slice() });
      codeLines = [];
    }

    lines.forEach(function (line) {
      const trimmed = line.trim();
      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      const labelMatch = trimmed.match(/^([A-Z][A-Za-z /-]{2,40}):\s*(.*)$/);

      if (trimmed.startsWith("```")) {
        flushParagraph();
        flushList();

        if (inCodeBlock) {
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return;
      }

      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }

      if (headingMatch) {
        flushParagraph();
        flushList();
        blocks.push({ type: "heading", text: headingMatch[2] });
        return;
      }

      if (isStandaloneSectionHeading(trimmed)) {
        flushParagraph();
        flushList();
        blocks.push({ type: "heading", text: trimmed });
        return;
      }

      if (bulletMatch) {
        flushParagraph();
        if (listItems.length && listOrdered) {
          listItems[listItems.length - 1].children.push({
            text: bulletMatch[1],
            children: [],
          });
          return;
        }
        listOrdered = false;
        listItems.push({
          text: bulletMatch[1],
          children: [],
        });
        return;
      }

      if (orderedMatch) {
        flushParagraph();
        if (listItems.length && !listOrdered) {
          flushList();
        }
        listOrdered = true;
        listItems.push({
          text: orderedMatch[1],
          children: [],
        });
        return;
      }

      if (labelMatch) {
        flushParagraph();
        flushList();
        blocks.push({ type: "keyValue", key: labelMatch[1], value: labelMatch[2] || "" });
        return;
      }

      paragraphLines.push(trimmed);
    });

    flushParagraph();
    flushList();
    flushCodeBlock();

    const transformedBlocks = [];
    const deferredRecommendationBlocks = [];
    let currentCallout = null;

    function flushCallout() {
      if (!currentCallout) {
        return;
      }

      if (currentCallout.calloutType === "recommendation") {
        deferredRecommendationBlocks.push(currentCallout);
      } else {
        transformedBlocks.push(currentCallout);
      }
      currentCallout = null;
    }

    blocks.forEach(function (block) {
      let calloutType = "";

      if (block.type === "heading") {
        calloutType = getCalloutType(block.text);
        if (calloutType) {
          flushCallout();
          currentCallout = {
            type: "callout",
            calloutType: calloutType,
            title: block.text,
            blocks: [],
          };
          return;
        }
      }

      if (block.type === "keyValue") {
        calloutType = getCalloutType(block.key);
        if (calloutType) {
          flushCallout();
          currentCallout = {
            type: "callout",
            calloutType: calloutType,
            title: block.key,
            blocks: block.value
              ? [{ type: "paragraph", text: block.value }]
              : [],
          };
          return;
        }
      }

      if (block.type === "heading" || block.type === "keyValue") {
        flushCallout();
        transformedBlocks.push(block);
        return;
      }

      if (currentCallout) {
        currentCallout.blocks.push(block);
        return;
      }

      transformedBlocks.push(block);
    });

    flushCallout();

    deferredRecommendationBlocks.forEach(function (block) {
      transformedBlocks.push(block);
    });

    return transformedBlocks.map(renderBlock).join("");
  }

  function appendMessage(role, text) {
    const article = document.createElement("article");
    article.className = "message " + (role === "user" ? "message--user" : "message--assistant");
    article.innerHTML =
      '<div class="messageRole">' +
      (role === "user" ? "You" : "Assistant") +
      '</div><div class="messageBody">' +
      renderBody(text) +
      "</div>";

    transcriptEl.appendChild(article);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    currentChatMessages.push({ role: role, text: text });
  }

  function createMessageMarkup(role, text) {
    return (
      '<article class="message ' +
      (role === "user" ? "message--user" : "message--assistant") +
      '"><div class="messageRole">' +
      (role === "user" ? "You" : "Assistant") +
      '</div><div class="messageBody">' +
      renderBody(text) +
      "</div></article>"
    );
  }

  function getStarterMessage() {
    return "Start with the issue symptom, scope, timeline, affected users, recent changes, and what has already been tried.";
  }

  function initializeTroubleshootingChat() {
    if (!transcriptEl) {
      return;
    }
    transcriptEl.innerHTML = "";
    currentChatMessages.length = 0;
    appendMessage("assistant", getStarterMessage());
  }

  function loadArchivedChats() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(TROUBLESHOOTING_ARCHIVE_KEY) || "[]");
      archivedChats = Array.isArray(parsed) ? parsed : [];
    } catch {
      archivedChats = [];
    }
  }

  function persistArchivedChats() {
    window.localStorage.setItem(TROUBLESHOOTING_ARCHIVE_KEY, JSON.stringify(archivedChats));
  }

  function buildArchiveTitle(messages) {
    const firstUserMessage = messages.find(function (item) {
      return item.role === "user" && item.text;
    });
    if (!firstUserMessage) {
      return "Archived troubleshooting chat";
    }
    const title = String(firstUserMessage.text).replace(/\s+/g, " ").trim();
    return title.length > 72 ? title.slice(0, 69) + "..." : title;
  }

  function renderArchivedChats() {
    if (!archiveListEl || !archiveCountEl) {
      return;
    }

    archiveCountEl.textContent = String(archivedChats.length);
    if (!archivedChats.length) {
      archiveListEl.innerHTML = '<div class="archiveEmpty">No archived chats yet.</div>';
      return;
    }

    archiveListEl.innerHTML = archivedChats
      .map(function (archive, index) {
        const transcript = (archive.messages || [])
          .map(function (message) {
            return createMessageMarkup(message.role, message.text);
          })
          .join("");

        return (
          '<article class="archiveItem" data-archive-index="' +
          index +
          '"><button class="archiveItemToggle" type="button" data-archive-toggle="' +
          index +
          '"><div><div class="archiveItemTitle">' +
          escapeHtml(archive.title || "Archived troubleshooting chat") +
          '</div><div class="archiveItemMeta">' +
          escapeHtml(archive.createdAtLabel || "") +
          "</div></div><span class=\"archiveItemChevron\" aria-hidden=\"true\">&#8250;</span></button><div class=\"archiveItemBody\" hidden><div class=\"archiveTranscript\">" +
          transcript +
          "</div></div></article>"
        );
      })
      .join("");

    archiveListEl.querySelectorAll("[data-archive-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        const parent = button.closest(".archiveItem");
        const body = parent ? parent.querySelector(".archiveItemBody") : null;
        if (!parent || !body) {
          return;
        }
        const willOpen = body.hidden;
        body.hidden = !willOpen;
        parent.classList.toggle("is-open", willOpen);
      });
    });
  }

  function resetTroubleshootingChat() {
    chatHistory.length = 0;
    pendingScreenshots = [];
    if (screenshotInputEl) {
      screenshotInputEl.value = "";
    }
    renderScreenshotList();
    clearWaitingStageTimer();
    requestPending = false;
    setComposerEnabled(true);
    updateChatHint();
    initializeTroubleshootingChat();
  }

  function archiveCurrentChat() {
    const userMessages = currentChatMessages.filter(function (item) {
      return item.role === "user";
    });
    if (!userMessages.length) {
      return;
    }

    const createdAt = new Date();
    archivedChats.unshift({
      title: buildArchiveTitle(currentChatMessages),
      createdAtIso: createdAt.toISOString(),
      createdAtLabel: createdAt.toLocaleString(),
      messages: currentChatMessages.map(function (message) {
        return { role: message.role, text: message.text };
      })
    });
    archivedChats = archivedChats.slice(0, 12);
    persistArchivedChats();
    renderArchivedChats();
    resetTroubleshootingChat();
  }

  function appendIntegrationMessage(role, text) {
    if (!integrationResultEl) {
      return;
    }

    const article = document.createElement("article");
    article.className = "message " + (role === "user" ? "message--user" : "message--assistant");
    article.innerHTML =
      '<div class="messageRole">' +
      (role === "user" ? "You" : "Assistant") +
      '</div><div class="messageBody">' +
      renderBody(text) +
      "</div>";

    integrationResultEl.appendChild(article);
    integrationResultEl.scrollTop = integrationResultEl.scrollHeight;
  }

  function appendIntegrationDownload(downloadUrl, fileName) {
    if (!integrationResultEl || !downloadUrl) {
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "integrationDownloadCard";
    wrap.innerHTML =
      '<div class="integrationDownloadTitle">Template-based IDD export ready</div>' +
      '<div class="integrationDownloadMeta">' +
      escapeHtml(fileName || "integration-design-document.docx") +
      "</div>" +
      '<a class="primaryButton integrationDownloadButton" href="' +
      escapeHtml(downloadUrl) +
      '" download>' +
      "Download IDD (.docx)" +
      "</a>";

    integrationResultEl.appendChild(wrap);
    integrationResultEl.scrollTop = integrationResultEl.scrollHeight;
  }

  function appendSmeMessage(role, text, roleKey) {
    const targetRoleKey = roleKey in smeRoleConfigs ? roleKey : activeSmeRoleKey;
    const session = getSmeSession(targetRoleKey);
    session.messages.push({ role: role, text: text });

    if (!smeTranscriptEl || targetRoleKey !== activeSmeRoleKey) {
      return;
    }

    const article = document.createElement("article");
    article.className = "message " + (role === "user" ? "message--user" : "message--assistant");
    article.innerHTML =
      '<div class="messageRole">' +
      (role === "user" ? "You" : "Assistant") +
      '</div><div class="messageBody">' +
      renderBody(text) +
      "</div>";

    smeTranscriptEl.appendChild(article);
    smeTranscriptEl.scrollTop = smeTranscriptEl.scrollHeight;
  }

  function getDefaultSmeAssistantMessage(roleKey) {
    const role = smeRoleConfigs[roleKey] || smeRoleConfigs["integration-consultant"];
    return role.description;
  }

  if (widgetSmeRole && widgetSmeRole in smeRoleConfigs) {
    activeSmeRoleKey = widgetSmeRole;
  }

  function getSmeSession(roleKey) {
    const normalizedRoleKey = roleKey in smeRoleConfigs ? roleKey : "integration-consultant";
    if (!smeSessions[normalizedRoleKey]) {
      smeSessions[normalizedRoleKey] = {
        apiHistory: [],
        pendingAttachment: null,
        messages: [
          {
            role: "assistant",
            text: getDefaultSmeAssistantMessage(normalizedRoleKey),
          },
        ],
      };
    }
    return smeSessions[normalizedRoleKey];
  }

  function isSupportedSmeAttachment(file) {
    const name = String(file && file.name ? file.name : "").toLowerCase();
    return SME_ATTACHMENT_ACCEPTED_EXTENSIONS.some(function (ext) {
      return name.endsWith(ext);
    });
  }

  function getSmeAttachmentDisplayLabel(file) {
    const name = String(file && file.name ? file.name : "").toLowerCase();
    if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
      return "Attached image";
    }
    return "Attached file";
  }

  function renderSmeAttachment() {
    if (!smeAttachmentListEl) {
      return;
    }

    const session = getSmeSession(activeSmeRoleKey);
    if (!session.pendingAttachment) {
      smeAttachmentListEl.innerHTML = "";
      return;
    }

    smeAttachmentListEl.innerHTML =
      '<div class="screenshotItem">' +
      escapeHtml(session.pendingAttachment.name) +
      '<button class="screenshotRemove" type="button" id="smeAttachmentRemoveBtn" aria-label="Remove attachment">&times;</button></div>';

    const removeBtn = document.getElementById("smeAttachmentRemoveBtn");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        clearSmeAttachment(activeSmeRoleKey);
      });
    }
  }

  function clearSmeAttachment(roleKey) {
    const session = getSmeSession(roleKey);
    session.pendingAttachment = null;
    if (roleKey === activeSmeRoleKey && smeAttachmentInputEl) {
      smeAttachmentInputEl.value = "";
    }
    if (roleKey === activeSmeRoleKey) {
      renderSmeAttachment();
    }
  }

  function setSmeAttachment(file, roleKey) {
    const session = getSmeSession(roleKey);
    session.pendingAttachment = file || null;
    if (roleKey === activeSmeRoleKey) {
      renderSmeAttachment();
    }
  }

  function renderSmeTranscript(roleKey) {
    if (!smeTranscriptEl) {
      return;
    }

    const session = getSmeSession(roleKey);
    smeTranscriptEl.innerHTML = session.messages
      .map(function (message) {
        return createMessageMarkup(message.role, message.text);
      })
      .join("");
    smeTranscriptEl.scrollTop = smeTranscriptEl.scrollHeight;
  }

  function activateSmeRole(roleKey) {
    const role = smeRoleConfigs[roleKey] || smeRoleConfigs["integration-consultant"];
    activeSmeRoleKey = roleKey in smeRoleConfigs ? roleKey : "integration-consultant";

    smeRoleButtons.forEach(function (button) {
      button.classList.toggle("navSubItem--active", button.getAttribute("data-sme-role") === activeSmeRoleKey);
    });

    if (smePanelTitleEl) {
      smePanelTitleEl.textContent = role.title;
    }
    if (smePanelHintEl) {
      smePanelHintEl.textContent = role.description;
    }
    if (smePromptInputEl) {
      smePromptInputEl.placeholder = "Ask a question for " + role.title + ".";
    }
    renderSmeTranscript(activeSmeRoleKey);
    renderSmeAttachment();
    if (!hubFeedbackOverlayEl?.hidden) {
      hubFeedbackFormState.application = getCurrentApplicationLabel();
      renderHubFeedbackForm();
    }
  }

  function handleSmeSubmit(event) {
    event.preventDefault();
    if (!smePromptInputEl) {
      return;
    }

    const prompt = smePromptInputEl.value.trim();
    if (!prompt) {
      return;
    }

    const requestRoleKey = activeSmeRoleKey;
    const role = smeRoleConfigs[requestRoleKey] || smeRoleConfigs["integration-consultant"];
    const session = getSmeSession(requestRoleKey);
    const attachment = session.pendingAttachment;
    appendSmeMessage("user", prompt, requestRoleKey);
    if (attachment) {
      appendSmeMessage(
        "user",
        getSmeAttachmentDisplayLabel(attachment) + ": `" + attachment.name + "`",
        requestRoleKey
      );
    }
    smePromptInputEl.value = "";

    if (!role.missionId) {
      appendSmeMessage(
        "assistant",
        "**" + role.title + "** is not connected to a Matcha mission yet."
      );
      smePromptInputEl.focus();
      return;
    }

    if (smePromptInputEl) {
      smePromptInputEl.disabled = true;
    }
    if (smeSendBtnEl) {
      smeSendBtnEl.disabled = true;
      smeSendBtnEl.textContent = "Sending...";
    }

    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("roleKey", requestRoleKey);
    formData.append("missionId", role.missionId);
    formData.append("chatHistory", JSON.stringify(session.apiHistory));
    if (attachment) {
      formData.append("attachment", attachment);
    }

    fetch("/api/sme-chat", {
      method: "POST",
      credentials: "include",
      body: formData,
    })
      .then(function (response) {
        return response.json().then(function (payload) {
          return { ok: response.ok, payload: payload };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(result.payload.error || "SME chat request failed.");
        }

        appendSmeMessage("assistant", result.payload.text || "No text returned.", requestRoleKey);
        session.apiHistory.push({ role: "user", content: prompt });
        if (attachment) {
          session.apiHistory.push({
            role: "user",
            content: result.payload.attachmentMessage || getSmeAttachmentDisplayLabel(attachment) + ": " + attachment.name,
          });
          clearSmeAttachment(requestRoleKey);
        }
        session.apiHistory.push({
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: result.payload.text || "",
            },
          ],
        });
      })
      .catch(function (error) {
        appendSmeMessage("assistant", "Request failed: " + error.message, requestRoleKey);
      })
      .finally(function () {
        if (smePromptInputEl) {
          smePromptInputEl.disabled = false;
          smePromptInputEl.focus();
        }
        if (smeSendBtnEl) {
          smeSendBtnEl.disabled = false;
          smeSendBtnEl.textContent = "Start Chat";
        }
      });
  }

  function removeWaitingMessage() {
    const existing = transcriptEl.querySelector(".message--waiting");
    if (existing) {
      existing.remove();
    }
  }

  function updateWaitingStage() {
    const stageMessage = transcriptEl.querySelector(".messageWaitingText");
    const stageItems = transcriptEl.querySelectorAll(".messageStage");

    if (stageMessage) {
      stageMessage.textContent = waitingStages[waitingStageIndex];
    }

    stageItems.forEach(function (item, index) {
      item.classList.toggle("messageStage--active", index === waitingStageIndex);
      item.classList.toggle("messageStage--complete", index < waitingStageIndex);
    });
  }

  function clearWaitingStageTimer() {
    if (waitingStageTimer) {
      window.clearInterval(waitingStageTimer);
      waitingStageTimer = null;
    }
  }

  function startWaitingStageTimer() {
    clearWaitingStageTimer();
    waitingStageIndex = 0;
    updateWaitingStage();

    waitingStageTimer = window.setInterval(function () {
      if (!requestPending) {
        clearWaitingStageTimer();
        return;
      }

      waitingStageIndex = Math.min(waitingStageIndex + 1, waitingStages.length - 1);
      updateWaitingStage();

      if (waitingStageIndex >= waitingStages.length - 1) {
        clearWaitingStageTimer();
      }
    }, 1800);
  }

  function appendWaitingMessage() {
    removeWaitingMessage();

    const article = document.createElement("article");
    article.className = "message message--assistant message--waiting";
    const stageItems = waitingStages
      .map(function (stage) {
        return '<li class="messageStage">' + escapeHtml(stage) + "</li>";
      })
      .join("");
    article.innerHTML =
      '<div class="messageRole">Assistant</div>' +
      '<div class="messageBody messageBody--waiting">' +
      '<span class="messageSpinner" aria-hidden="true"></span>' +
      '<div class="messageWaitingContent">' +
      '<p class="messageWaitingText">' + escapeHtml(waitingStages[0]) + "</p>" +
      '<ol class="messageStageList">' + stageItems + "</ol>" +
      "</div>" +
      "</div>";

    transcriptEl.appendChild(article);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    startWaitingStageTimer();
  }

  function updateChatHint() {
    if (requestPending) {
      chatHintEl.textContent = "Assistant is working. Please wait before sending another message.";
      return;
    }

    chatHintEl.textContent = isAuthenticated ? authenticatedChatHint : defaultChatHint;
  }

  function applyWidgetMode() {
    if (!widgetMode) {
      if (openFullHubLinkEl) {
        openFullHubLinkEl.hidden = true;
      }
      if (popoutTroubleshooterBtnEl) {
        popoutTroubleshooterBtnEl.hidden = false;
      }
      if (popoutSmeBtnEl) {
        popoutSmeBtnEl.hidden = false;
      }
      return;
    }

    document.body.classList.add("widgetMode");
    if (desktopWidgetMode) {
      document.body.classList.add("desktopWidgetMode");
    }
    if (widgetView === "subject-matter-expert") {
      activateView("subject-matter-expert");
    } else {
      activateView("troubleshooting-platform");
    }
    if (openFullHubLinkEl) {
      openFullHubLinkEl.hidden = true;
    }
    if (popoutTroubleshooterBtnEl) {
      popoutTroubleshooterBtnEl.hidden = true;
    }
    if (popoutSmeBtnEl) {
      popoutSmeBtnEl.hidden = true;
    }
  }

  function renderKbEnhancer() {
    const kbEnhancerEl = document.getElementById("kbEnhancer");
    if (!kbEnhancerToggleEl || !kbEnhancerBodyEl || !kbStatusEl) {
      return;
    }

    kbEnhancerToggleEl.setAttribute("aria-expanded", kbExpanded ? "true" : "false");
    if (kbEnhancerEl) {
      kbEnhancerEl.classList.toggle("kbMini--expanded", kbExpanded);
    }
    kbEnhancerBodyEl.hidden = !kbExpanded;
    kbEnhancerBodyEl.setAttribute("aria-hidden", kbExpanded ? "false" : "true");

    if (kbFileLabelEl) {
      kbFileLabelEl.textContent = kbFile ? kbFile.name : "Drop DOCX here or click to select";
    }

    if (kbUploadBtnEl) {
      kbUploadBtnEl.disabled = kbPending || !kbFile;
      kbUploadBtnEl.textContent = kbPending ? "Uploading..." : "Upload";
    }

    if (kbDropZoneEl) {
      kbDropZoneEl.classList.toggle("composerDropZone--busy", kbPending);
    }
  }

  function setKbStatus(text, tone) {
    if (!kbStatusEl) {
      return;
    }
    kbStatusEl.textContent = text || "";
    kbStatusEl.classList.remove("kbMiniStatus--success", "kbMiniStatus--error");
    if (tone === "success") {
      kbStatusEl.classList.add("kbMiniStatus--success");
    } else if (tone === "error") {
      kbStatusEl.classList.add("kbMiniStatus--error");
    }
  }

  function setKbFile(file) {
    kbFile = file || null;
    renderKbEnhancer();
  }

  async function uploadKbIssue() {
    if (!kbFile || !kbProductSelectEl) {
      setKbStatus("Select a DOCX file first.", "error");
      return;
    }

    kbPending = true;
    setKbStatus("Uploading to Matcha...", "");
    renderKbEnhancer();

    try {
      const form = new FormData();
      form.append("product", kbProductSelectEl.value || "sunrise");
      form.append("file", kbFile);

      const response = await fetch("/training-platform/api/matcha/kb-issue-upload", {
        method: "POST",
        body: form
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || payload.details || "Upload failed");
      }

      setKbStatus('Uploaded to "' + payload.folderName + '".', "success");
      kbFile = null;
      if (kbFileInputEl) {
        kbFileInputEl.value = "";
      }
    } catch (error) {
      setKbStatus(error && error.message ? error.message : "Upload failed.", "error");
    } finally {
      kbPending = false;
      renderKbEnhancer();
    }
  }

  function setSmeMenuExpanded(expanded) {
    smeMenuExpanded = Boolean(expanded);
    if (smeNavToggleEl) {
      smeNavToggleEl.setAttribute("aria-expanded", smeMenuExpanded ? "true" : "false");
    }
    if (smeNavSubmenuEl) {
      smeNavSubmenuEl.classList.toggle("navSubmenu--collapsed", !smeMenuExpanded);
    }
  }

  function popoutTroubleshooter() {
    const popupUrl = new URL(window.location.href);
    popupUrl.searchParams.set("widget", "1");
    popupUrl.searchParams.delete("view");
    popupUrl.searchParams.delete("smeRole");
    const features = [
      "popup=yes",
      "width=540",
      "height=920",
      "resizable=yes",
      "scrollbars=yes"
    ].join(",");
    const popup = window.open(popupUrl.toString(), "apac-ps-troubleshooter", features);
    if (popup) {
      popup.focus();
      return;
    }
    window.location.href = popupUrl.toString();
  }

  function popoutSmeRole() {
    const popupUrl = new URL(window.location.href);
    popupUrl.searchParams.set("widget", "1");
    popupUrl.searchParams.set("view", "subject-matter-expert");
    popupUrl.searchParams.set("smeRole", activeSmeRoleKey);
    const features = [
      "popup=yes",
      "width=540",
      "height=920",
      "resizable=yes",
      "scrollbars=yes"
    ].join(",");
    const popup = window.open(popupUrl.toString(), "apac-ps-sme-" + activeSmeRoleKey, features);
    if (popup) {
      popup.focus();
      return;
    }
    window.location.href = popupUrl.toString();
  }

  function activateView(viewId) {
    activeViewId = viewId;
    persistActiveView(viewId);

    appViews.forEach(function (view) {
      view.classList.toggle("appView--active", view.id === viewId);
    });

    viewTargetButtons.forEach(function (button) {
      if (button.classList.contains("navItem")) {
        button.classList.toggle("navItem--active", button.getAttribute("data-view-target") === viewId);
      }
    });
    if (!hubFeedbackOverlayEl?.hidden) {
      hubFeedbackFormState.application = getCurrentApplicationLabel();
      renderHubFeedbackForm();
    }

    if (viewId === "troubleshooting-platform") {
      promptEl.focus();
      return;
    }

    if (viewId === "integration-sow-platform" && integrationSowFileEl) {
      integrationSowFileEl.focus();
      return;
    }

    if (viewId === "subject-matter-expert" && smePromptInputEl) {
      smePromptInputEl.focus();
    }
  }

  function setComposerEnabled(enabled) {
    const active = enabled && !requestPending;
    promptEl.disabled = !active;
    sendBtnEl.disabled = !active;
    screenshotInputEl.disabled = !active;
    composerDropZoneEl.classList.toggle("composerDropZone--disabled", !active);
    composerDropZoneEl.classList.toggle("composerDropZone--busy", requestPending);
  }

  function setRequestPending(pending) {
    requestPending = pending;
    setComposerEnabled(true);
    updateChatHint();

    if (pending) {
      sendBtnEl.classList.add("sendIconButton--busy");
      appendWaitingMessage();
      return;
    }

    sendBtnEl.classList.remove("sendIconButton--busy");
    clearWaitingStageTimer();
    removeWaitingMessage();
  }

  function applyAuthState(state) {
    const fetchedUser = state?.user || null;
    const storedUser = readStoredHubAuthUser();
    const user = fetchedUser || storedUser || null;
    isAuthenticated = Boolean(state?.authenticated || fetchedUser?.userId || storedUser?.email);
    const displayName = getPreferredDisplayName(user);
    const initials = displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("") || "PS";

    if (mainHeaderIdentityAvatarEl) {
      mainHeaderIdentityAvatarEl.textContent = initials;
    }
    if (mainHeaderIdentityNameEl) {
      mainHeaderIdentityNameEl.textContent = isAuthenticated ? displayName : "Sign in";
    }
    if (mainHeaderIdentityEl) {
      mainHeaderIdentityEl.hidden = !isAuthenticated;
    }
    if (hubFeedbackAdminBtnEl) {
      hubFeedbackAdminBtnEl.hidden = !isHubRequestAdminClient(user);
    }
    try {
      const hubAuthUser = fetchedUser || storedUser
        ? {
            name: getPreferredDisplayName(fetchedUser || storedUser),
            email: (fetchedUser || storedUser).email || "",
          }
        : null;
      window.__hubAuthUser = hubAuthUser;
      if (hubAuthUser) {
        window.sessionStorage.setItem("apac_hub_auth_user", JSON.stringify(hubAuthUser));
      } else {
        window.sessionStorage.removeItem("apac_hub_auth_user");
      }
    } catch (_error) {
      // Ignore storage access failures.
    }
    if (trainingFrameEl) {
      const frameSource = trainingFrameEl.getAttribute("data-src") || trainingFrameEl.getAttribute("src") || "/training-platform/";
      const frameUrl = new URL(frameSource, window.location.origin);
      if (user?.name) {
        frameUrl.searchParams.set("user_name", user.name);
      } else {
        frameUrl.searchParams.delete("user_name");
      }
      if (user?.email) {
        frameUrl.searchParams.set("user_email", user.email);
      } else {
        frameUrl.searchParams.delete("user_email");
      }
      if (trainingFrameEl.getAttribute("src") !== frameUrl.toString()) {
        trainingFrameEl.src = frameUrl.toString();
      }
    }
    if (!hubFeedbackOverlayEl?.hidden) {
      hubFeedbackFormState.application = getCurrentApplicationLabel();
      renderHubFeedbackForm();
    }
    setComposerEnabled(true);
    updateChatHint();
  }

  function setIntegrationPending(pending) {
    if (!integrationFormEl || !integrationSendBtnEl) {
      return;
    }

    if (integrationSowFileEl) {
      integrationSowFileEl.disabled = pending;
    }
    integrationSendBtnEl.disabled = pending;
    integrationSendBtnEl.textContent = pending ? "Generating..." : "Generate Draft";
  }

  function updateIntegrationFileMeta() {
    if (!integrationSowFileEl || !integrationSowFileMetaEl) {
      return;
    }

    const file = integrationSowFileEl.files && integrationSowFileEl.files[0];
    if (!file) {
      integrationSowFileMetaEl.textContent =
        "Supported formats: PDF, DOC, DOCX, TXT, MD. Attach the signed SOW file so Matcha can read it directly.";
      return;
    }

    integrationSowFileMetaEl.textContent =
      "Selected file: " + file.name + " (" + Math.max(1, Math.round(file.size / 1024)) + " KB)";
  }

  function renderScreenshotList() {
    screenshotListEl.innerHTML = "";
    pendingScreenshots.forEach(function (screenshot) {
      const pill = document.createElement("div");
      pill.className = "screenshotItem";
      pill.textContent = screenshot.name;
      screenshotListEl.appendChild(pill);
    });
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function loadScreenshotFiles(fileList) {
    const files = Array.from(fileList || []);
    pendingScreenshots = [];

    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      pendingScreenshots.push({
        name: file.name,
        dataUrl,
      });
    }

    renderScreenshotList();
  }

  async function handleScreenshotSelection() {
    await loadScreenshotFiles(screenshotInputEl.files || []);
  }

  async function sendPrompt(event) {
    event.preventDefault();
    const prompt = promptEl.value.trim();
    if (!prompt) {
      return;
    }

    appendMessage("user", prompt);
    promptEl.value = "";
    setRequestPending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          chatHistory,
          screenshots: pendingScreenshots,
        }),
      });

      const payload = await response.json();
      removeWaitingMessage();
      if (!response.ok) {
        throw new Error(payload.error || "Chat request failed.");
      }

      appendMessage("assistant", payload.text || "No text returned.");
      if (pendingScreenshots.length) {
        chatHistory.push({
          role: "user",
          content: "Attached screenshots: " + pendingScreenshots.map(function (item) { return item.name; }).join(", "),
        });
      }
      chatHistory.push({ role: "user", content: prompt });
      chatHistory.push({
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: payload.text || "",
          },
        ],
      });
      pendingScreenshots = [];
      screenshotInputEl.value = "";
      renderScreenshotList();
    } catch (error) {
      removeWaitingMessage();
      appendMessage("assistant", "Request failed: " + error.message);
    } finally {
      setRequestPending(false);
      promptEl.focus();
    }
  }

  async function sendIntegrationPrompt(event) {
    event.preventDefault();
    if (!integrationSowFileEl) {
      return;
    }

    const sowFile = integrationSowFileEl && integrationSowFileEl.files ? integrationSowFileEl.files[0] : null;

    if (!sowFile) {
      return;
    }

    appendIntegrationMessage("user", "Attached SOW: " + sowFile.name);
    setIntegrationPending(true);

    try {
      const formData = new FormData();
      if (sowFile) {
        formData.append("sowFile", sowFile);
      }

      const response = await fetch("/api/integration-design", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Integration design request failed.");
      }

      appendIntegrationMessage("assistant", payload.text || "No text returned.");
      if (payload.downloadUrl) {
        appendIntegrationDownload(payload.downloadUrl, payload.exportFileName);
      }
      integrationSowFileEl.value = "";
      updateIntegrationFileMeta();
    } catch (error) {
      appendIntegrationMessage("assistant", "Request failed: " + error.message);
    } finally {
      setIntegrationPending(false);
    }
  }

  async function bootstrap() {
    setComposerEnabled(true);

    viewTargetButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        activateView(button.getAttribute("data-view-target"));
      });
    });
    if (hubFeedbackBtnEl) {
      hubFeedbackBtnEl.addEventListener("click", openHubFeedbackForm);
    }
    if (hubFeedbackAdminBtnEl) {
      hubFeedbackAdminBtnEl.addEventListener("click", openHubFeedbackAdmin);
    }
    if (smeNavToggleEl) {
      smeNavToggleEl.addEventListener("click", function () {
        setSmeMenuExpanded(!smeMenuExpanded);
      });
    }
    if (popoutTroubleshooterBtnEl) {
      popoutTroubleshooterBtnEl.addEventListener("click", popoutTroubleshooter);
    }
    if (popoutSmeBtnEl) {
      popoutSmeBtnEl.addEventListener("click", popoutSmeRole);
    }
    if (archiveChatBtnEl) {
      archiveChatBtnEl.addEventListener("click", function () {
        if (requestPending) {
          return;
        }
        archiveCurrentChat();
      });
    }
    if (refreshChatBtnEl) {
      refreshChatBtnEl.addEventListener("click", function () {
        if (requestPending) {
          return;
        }
        resetTroubleshootingChat();
      });
    }
    if (kbEnhancerToggleEl) {
      kbEnhancerToggleEl.addEventListener("click", function () {
        kbExpanded = !kbExpanded;
        renderKbEnhancer();
      });
    }
    if (kbDropZoneEl && kbFileInputEl) {
      kbDropZoneEl.addEventListener("click", function () {
        if (!kbPending) {
          kbFileInputEl.click();
        }
      });
      kbDropZoneEl.addEventListener("keydown", function (event) {
        if ((event.key === "Enter" || event.key === " ") && !kbPending) {
          event.preventDefault();
          kbFileInputEl.click();
        }
      });
      ["dragenter", "dragover"].forEach(function (eventName) {
        kbDropZoneEl.addEventListener(eventName, function (event) {
          event.preventDefault();
          if (!kbPending) {
            kbDropZoneEl.classList.add("kbMiniDropZone--active");
          }
        });
      });
      ["dragleave", "dragend", "drop"].forEach(function (eventName) {
        kbDropZoneEl.addEventListener(eventName, function (event) {
          event.preventDefault();
          kbDropZoneEl.classList.remove("kbMiniDropZone--active");
        });
      });
      kbDropZoneEl.addEventListener("drop", function (event) {
        if (kbPending) {
          return;
        }
        const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
        if (!file) {
          return;
        }
        if (!/\.docx$/i.test(file.name)) {
          setKbStatus("Only DOCX files are allowed.", "error");
          return;
        }
        setKbStatus("", "");
        setKbFile(file);
      });
      kbFileInputEl.addEventListener("change", function () {
        const file = kbFileInputEl.files && kbFileInputEl.files[0] ? kbFileInputEl.files[0] : null;
        if (file && !/\.docx$/i.test(file.name)) {
          kbFileInputEl.value = "";
          setKbFile(null);
          setKbStatus("Only DOCX files are allowed.", "error");
          return;
        }
        setKbStatus("", "");
        setKbFile(file);
      });
    }
    if (kbUploadBtnEl) {
      kbUploadBtnEl.addEventListener("click", uploadKbIssue);
    }
    screenshotInputEl.addEventListener("change", function () {
      handleScreenshotSelection().catch(function () {
        pendingScreenshots = [];
        renderScreenshotList();
        appendMessage("assistant", "Screenshot processing failed. Please try the upload again.");
      });
    });
    promptEl.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!sendBtnEl.disabled) {
          formEl.requestSubmit();
        }
      }
    });
    ["dragenter", "dragover"].forEach(function (eventName) {
      composerDropZoneEl.addEventListener(eventName, function (event) {
        event.preventDefault();
        if (!screenshotInputEl.disabled) {
          composerDropZoneEl.classList.add("composerDropZone--active");
        }
      });
    });
    ["dragleave", "dragend", "drop"].forEach(function (eventName) {
      composerDropZoneEl.addEventListener(eventName, function (event) {
        event.preventDefault();
        composerDropZoneEl.classList.remove("composerDropZone--active");
      });
    });
    composerDropZoneEl.addEventListener("drop", function (event) {
      if (screenshotInputEl.disabled) {
        return;
      }

      loadScreenshotFiles(event.dataTransfer ? event.dataTransfer.files : []).catch(function () {
        pendingScreenshots = [];
        renderScreenshotList();
        appendMessage("assistant", "Dropped screenshot processing failed. Please try again.");
      });
    });

    const initialView = widgetMode
      ? (widgetView === "subject-matter-expert" ? "subject-matter-expert" : "troubleshooting-platform")
      : readStoredActiveView() || "platform-briefing";
    activateView(initialView);
    applyWidgetMode();
    loadArchivedChats();
    renderArchivedChats();
    resetTroubleshootingChat();

    try {
      const healthResponse = await fetch("/api/health", {
        cache: "no-store",
        credentials: "include"
      });
      const healthPayload = await healthResponse.json();
      if (sidebarVersionEl && healthPayload?.appVersion) {
        sidebarVersionEl.textContent = "Version " + healthPayload.appVersion;
      }

      const state = window.authBootstrap.requireAuthOrRedirect
        ? await window.authBootstrap.requireAuthOrRedirect()
        : await window.authBootstrap.loadAuthState();
      if (!state) {
        return;
      }
      applyAuthState(state);
    } catch {
      applyAuthState({
        authenticated: false,
        user: null
      });
    }

    formEl.addEventListener("submit", sendPrompt);
    if (integrationFormEl) {
      integrationFormEl.addEventListener("submit", sendIntegrationPrompt);
      if (integrationSowFileEl) {
        integrationSowFileEl.addEventListener("change", updateIntegrationFileMeta);
        updateIntegrationFileMeta();
      }
    }

    smeRoleButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setSmeMenuExpanded(true);
        activateView("subject-matter-expert");
        activateSmeRole(button.getAttribute("data-sme-role"));
      });
    });
    setSmeMenuExpanded(false);
    activateSmeRole(activeSmeRoleKey);
    renderKbEnhancer();

    if (smeFormEl) {
      smeFormEl.addEventListener("submit", handleSmeSubmit);
    }
    if (smeAttachmentInputEl) {
      smeAttachmentInputEl.addEventListener("change", function () {
        const file =
          smeAttachmentInputEl.files && smeAttachmentInputEl.files[0]
            ? smeAttachmentInputEl.files[0]
            : null;
        if (!file) {
          clearSmeAttachment(activeSmeRoleKey);
          return;
        }
        if (!isSupportedSmeAttachment(file)) {
          clearSmeAttachment(activeSmeRoleKey);
          appendSmeMessage(
            "assistant",
            "Unsupported attachment type. Supported files: PDF, DOCX, TXT, PNG, JPG.",
            activeSmeRoleKey
          );
          return;
        }
        setSmeAttachment(file, activeSmeRoleKey);
      });
    }
    if (smeComposerDropZoneEl) {
      ["dragenter", "dragover"].forEach(function (eventName) {
        smeComposerDropZoneEl.addEventListener(eventName, function (event) {
          event.preventDefault();
          if (smeAttachmentInputEl && !smeAttachmentInputEl.disabled) {
            smeComposerDropZoneEl.classList.add("composerDropZone--active");
          }
        });
      });
      ["dragleave", "dragend", "drop"].forEach(function (eventName) {
        smeComposerDropZoneEl.addEventListener(eventName, function (event) {
          event.preventDefault();
          smeComposerDropZoneEl.classList.remove("composerDropZone--active");
        });
      });
      smeComposerDropZoneEl.addEventListener("drop", function (event) {
        if (!smeAttachmentInputEl || smeAttachmentInputEl.disabled) {
          return;
        }

        const file =
          event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]
            ? event.dataTransfer.files[0]
            : null;

        if (!file) {
          return;
        }

        if (!isSupportedSmeAttachment(file)) {
          clearSmeAttachment(activeSmeRoleKey);
          appendSmeMessage(
            "assistant",
            "Unsupported attachment type. Supported files: PDF, DOCX, TXT, PNG, JPG.",
            activeSmeRoleKey
          );
          return;
        }

        setSmeAttachment(file, activeSmeRoleKey);
      });
    }
  }

  bootstrap();
})();
