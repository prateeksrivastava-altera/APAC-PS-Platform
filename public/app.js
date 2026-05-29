(function () {
  "use strict";

  const transcriptEl = document.getElementById("chatTranscript");
  const formEl = document.getElementById("chatForm");
  const promptEl = document.getElementById("promptInput");
  const sendBtnEl = document.getElementById("sendBtn");
  const missionStatusEl = document.getElementById("missionStatus");
  const refreshMissionBtnEl = document.getElementById("refreshMissionBtn");
  const appTargetButtons = document.querySelectorAll("[data-app-target]");
  const workspaceEl = document.getElementById("ai-troubleshooting");
  const chatHistory = [];

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function renderBody(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
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
  }

  function setMissionMeta(items) {
    missionStatusEl.innerHTML = "";
    items.forEach(function (item) {
      const card = document.createElement("div");
      card.className = "metaCard";
      card.innerHTML =
        '<div class="metaLabel">' +
        escapeHtml(item.label) +
        '</div><div class="metaValue">' +
        renderBody(item.value) +
        "</div>";
      missionStatusEl.appendChild(card);
    });
  }

  function revealWorkspace() {
    workspaceEl.scrollIntoView({ behavior: "smooth", block: "start" });
    promptEl.focus();
  }

  async function loadMission() {
    setMissionMeta([{ label: "Status", value: "Loading mission details..." }]);

    const response = await fetch("/api/mission", {
      cache: "no-store",
      credentials: "include",
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load mission metadata.");
    }

    const mission = payload.mission;
    setMissionMeta([
      { label: "Mission ID", value: String(payload.missionId) },
      { label: "Workspace ID", value: String(payload.workspaceId) },
      { label: "Lookup result", value: payload.found ? "Found" : "Not returned by mission listing" },
      { label: "Mission name", value: mission?.name || "APAC PS - Troubleshooting Issues" },
      { label: "Description", value: mission?.description || payload.note || "No description returned." },
    ]);
  }

  async function sendPrompt(event) {
    event.preventDefault();
    const prompt = promptEl.value.trim();
    if (!prompt) {
      return;
    }

    appendMessage("user", prompt);
    promptEl.value = "";
    sendBtnEl.disabled = true;
    sendBtnEl.textContent = "Sending...";

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
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Chat request failed.");
      }

      appendMessage("assistant", payload.text || "No text returned.");
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
    } catch (error) {
      appendMessage("assistant", "Request failed: " + error.message);
    } finally {
      sendBtnEl.disabled = false;
      sendBtnEl.textContent = "Send";
      promptEl.focus();
    }
  }

  async function bootstrap() {
    setMissionMeta([{ label: "Status", value: "Checking authentication..." }]);

    appTargetButtons.forEach(function (button) {
      button.addEventListener("click", revealWorkspace);
    });

    try {
      await window.authBootstrap.requireAuthOrRedirect();
      await loadMission();
      formEl.addEventListener("submit", sendPrompt);
      refreshMissionBtnEl.addEventListener("click", loadMission);
    } catch (error) {
      setMissionMeta([{ label: "Status", value: error.message }]);
    }
  }

  bootstrap();
})();
