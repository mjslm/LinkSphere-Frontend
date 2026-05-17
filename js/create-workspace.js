const form = document.querySelector(".form");
const button = document.querySelector(".create-btn");
const iconBox = document.getElementById("iconBox");
const input = document.getElementById("workspace");

function addIcon() {
  iconBox.classList.add("active");
  iconBox.querySelector(".camera").textContent = "✅";
  iconBox.querySelector("p").textContent = "ICON ADDED";
}

iconBox.addEventListener("click", addIcon);

iconBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    addIcon();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (input.value.trim() === "") {
    input.focus();
    input.style.borderColor = "#d50000";
    return;
  }

  button.classList.add("loading");
  button.innerHTML = "CREATING...";

  setTimeout(() => {
    button.innerHTML = "WORKSPACE CREATED ✓";
    button.style.background = "#000";
  }, 1200);
});