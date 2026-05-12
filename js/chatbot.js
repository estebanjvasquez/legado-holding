/* =============================================================================
   LEGADO — js/chatbot.js
   Chat assistant and emergency chatbot overlay.
   Depends on: main.js  (CHAT_WEBHOOK_URL, currentLang, $, t,
               generateSessionId, escapeHTML, simpleMarkdown,
               chatIcon, alertIcon)
   ============================================================================= */

let chatMode = "wizard"; // "wizard" | "emergency"
let chatMessages = [];
let chatLoading = false;
let chatSessionId = null;

function openChat(mode) {
  chatMode = mode;
  chatMessages = [];
  chatSessionId = generateSessionId();

  const overlay = $("#chatbot-overlay");
  overlay.classList.remove("hidden");
  $("#chat-header").className =
    `chat-header ${mode === "emergency" ? "emergency" : "normal"}`;
  $("#chat-title").textContent =
    mode === "emergency" ? t("chat_emergency") : t("chat_title");
  $("#chat-header-icon").innerHTML =
    mode === "emergency" ? alertIcon() : chatIcon();
  $("#chat-input").placeholder =
    mode === "emergency" ? t("chat_ph_emergency") : t("chat_placeholder");
  $("#chat-send-btn").className =
    `chat-send-btn ${mode === "emergency" ? "emergency" : "normal"}`;

  $("#chat-messages").innerHTML = `
    <div class="chat-bubble-wrap bot chat-greeting">
      <div class="chat-bubble bot${mode === "emergency" ? " emergency" : ""}">
        ${mode === "emergency" ? t("chat_greeting_emergency") : t("chat_greeting")}
      </div>
    </div>`;

  setTimeout(() => $("#chat-input").focus(), 300);
}

function closeChat() {
  $("#chatbot-overlay").classList.add("hidden");
}

function appendChatBubble(role, content) {
  const msgs = $("#chat-messages");
  const wrap = document.createElement("div");
  wrap.className = `chat-bubble-wrap ${role === "user" ? "user" : "bot"}`;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role === "user" ? "user" : "bot"}${chatMode === "emergency" && role === "assistant" ? " emergency" : ""}`;
  bubble.innerHTML =
    role === "assistant" ? simpleMarkdown(content) : escapeHTML(content);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTypingIndicator() {
  const msgs = $("#chat-messages");
  const wrap = document.createElement("div");
  wrap.className = "chat-bubble-wrap bot";
  wrap.id = "typing-indicator";
  wrap.innerHTML = `<div class="chat-bubble bot"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTypingIndicator() {
  $("#typing-indicator")?.remove();
}

async function sendChatMessage() {
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text || chatLoading) return;

  input.value = "";
  chatLoading = true;
  updateChatUI();
  chatMessages.push({ role: "user", content: text });
  appendChatBubble("user", text);
  showTypingIndicator();

  try {
    const resp = await fetch(CHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        messages: chatMessages,
        mode: chatMode,
        sessionId: chatSessionId,
        lang: currentLang,
      }),
    });
    removeTypingIndicator();
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    const reply =
      data?.response ||
      data?.message ||
      data?.content ||
      data?.text ||
      (Array.isArray(data) ? data[0]?.response || data[0]?.message : null) ||
      t(chatMode === "emergency" ? "chat_error_emergency" : "chat_error");
    chatMessages.push({ role: "assistant", content: reply });
    appendChatBubble("assistant", reply);
  } catch (e) {
    console.error("Chat error:", e);
    removeTypingIndicator();
    const err = t(chatMode === "emergency" ? "chat_error_emergency" : "chat_error");
    chatMessages.push({ role: "assistant", content: err });
    appendChatBubble("assistant", err);
  } finally {
    chatLoading = false;
    updateChatUI();
    $("#chat-input").focus();
  }
}

function updateChatUI() {
  const input = $("#chat-input");
  const sendBtn = $("#chat-send-btn");
  if (input) input.disabled = chatLoading;
  if (sendBtn) sendBtn.disabled = chatLoading || !input?.value.trim();
}

function initChat() {
  const input = $("#chat-input");
  const sendBtn = $("#chat-send-btn");
  sendBtn?.addEventListener("click", sendChatMessage);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  input?.addEventListener("input", () => {
    if (sendBtn) sendBtn.disabled = !input.value.trim() || chatLoading;
  });
  $("#chat-close-btn")?.addEventListener("click", closeChat);
  $("#emergency-btn")?.addEventListener("click", () => openChat("emergency"));
}
