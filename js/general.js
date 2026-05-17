const input = document.querySelector(".inputbar input");
const messages = document.querySelector(".messages");
const inputbar = document.querySelector(".inputbar");
const sendButton = document.querySelector(".send-btn");

function updateSendButton() {
  inputbar.classList.toggle("typing", input.value.trim().length > 0);
}

function sendMessage() {
  const text = input.value.trim();

  if (!text) return;

  const msg = document.createElement("div");
  msg.className = "message new-message";

  msg.innerHTML = `
    <div class="avatar">Y</div>
    <div class="content">
      <div class="meta"><span>YOU</span><small>NOW</small></div>
      <p></p>
    </div>
  `;

  msg.querySelector("p").textContent = text;
  messages.appendChild(msg);

  input.value = "";
  updateSendButton();

  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: "smooth"
  });
}

input.addEventListener("input", updateSendButton);

input.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

sendButton.addEventListener("click", sendMessage);