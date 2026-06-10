(function () {
  "use strict";

  const transcriptEl = document.getElementById("chatTranscript");
  const formEl = document.getElementById("chatForm");
  const promptEl = document.getElementById("promptInput");
  const sendBtnEl = document.getElementById("sendBtn");
  const chatHintEl = document.getElementById("chatHint");
  const screenshotInputEl = document.getElementById("screenshotInput");
  const screenshotListEl = document.getElementById("screenshotList");
  const composerDropZoneEl = document.getElementById("composerDropZone");
  const sidebarVersionEl = document.getElementById("sidebarVersion");
  const viewTargetButtons = document.querySelectorAll("[data-view-target]");
  const appViews = document.querySelectorAll(".appView");
  const troubleshootingViewEl = document.getElementById("troubleshooting-platform");
  const chatHistory = [];
  let pendingScreenshots = [];
  let isAuthenticated = false;

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
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
          return "<li>" + renderInline(item) + "</li>";
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

      blocks.push(renderParagraph(paragraphLines.join(" ")));
      paragraphLines = [];
    }

    function flushList() {
      if (!listItems.length) {
        return;
      }

      blocks.push(renderList(listItems, listOrdered));
      listItems = [];
      listOrdered = false;
    }

    function flushCodeBlock() {
      if (!codeLines.length) {
        return;
      }

      blocks.push(renderCodeBlock(codeLines));
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
        blocks.push(
          '<h4 class="messageHeading">' + renderInline(headingMatch[2]) + "</h4>"
        );
        return;
      }

      if (bulletMatch) {
        flushParagraph();
        if (listItems.length && listOrdered) {
          flushList();
        }
        listOrdered = false;
        listItems.push(bulletMatch[1]);
        return;
      }

      if (orderedMatch) {
        flushParagraph();
        if (listItems.length && !listOrdered) {
          flushList();
        }
        listOrdered = true;
        listItems.push(orderedMatch[1]);
        return;
      }

      if (labelMatch) {
        flushParagraph();
        flushList();
        blocks.push(
          '<div class="messageKeyValue"><span class="messageKey">' +
            renderInline(labelMatch[1]) +
            ':</span><span class="messageValue">' +
            renderInline(labelMatch[2] || "") +
            "</span></div>"
        );
        return;
      }

      paragraphLines.push(trimmed);
    });

    flushParagraph();
    flushList();
    flushCodeBlock();

    return blocks.join("");
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

  function activateView(viewId) {
    appViews.forEach(function (view) {
      view.classList.toggle("appView--active", view.id === viewId);
    });

    viewTargetButtons.forEach(function (button) {
      if (button.classList.contains("navItem")) {
        button.classList.toggle("navItem--active", button.getAttribute("data-view-target") === viewId);
      }
    });

    if (viewId === "troubleshooting-platform") {
      troubleshootingViewEl.scrollIntoView({ behavior: "smooth", block: "start" });
      promptEl.focus();
    }
  }

  function setComposerEnabled(enabled) {
    promptEl.disabled = !enabled;
    sendBtnEl.disabled = !enabled;
    screenshotInputEl.disabled = !enabled;
    composerDropZoneEl.classList.toggle("composerDropZone--disabled", !enabled);
  }

  function applyAuthState(state) {
    const user = state?.user || null;
    isAuthenticated = Boolean(state?.authenticated || user?.userId);
    setComposerEnabled(true);

    if (isAuthenticated) {
      chatHintEl.textContent = "Authenticated. Chat and screenshot review are enabled.";
      return;
    }

    chatHintEl.textContent = "Chat is enabled. Microsoft sign-in is optional for testing, and screenshot upload is available.";
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
    sendBtnEl.disabled = true;
    sendBtnEl.classList.add("sendIconButton--busy");

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
      appendMessage("assistant", "Request failed: " + error.message);
    } finally {
      sendBtnEl.disabled = false;
      sendBtnEl.classList.remove("sendIconButton--busy");
      promptEl.focus();
    }
  }

  async function bootstrap() {
    setComposerEnabled(true);

    viewTargetButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        activateView(button.getAttribute("data-view-target"));
      });
    });
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

    activateView("platform-briefing");

    try {
      const healthResponse = await fetch("/api/health", {
        cache: "no-store",
        credentials: "include"
      });
      const healthPayload = await healthResponse.json();
      if (sidebarVersionEl && healthPayload?.appVersion) {
        sidebarVersionEl.textContent = "Version " + healthPayload.appVersion;
      }

      const state = await window.authBootstrap.loadAuthState();
      applyAuthState(state);
    } catch {
      chatHintEl.textContent = "Chat is enabled. Authentication status could not be checked, but you can still use the assistant.";
    }

    formEl.addEventListener("submit", sendPrompt);
  }

  bootstrap();
})();
