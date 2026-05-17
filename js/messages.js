const cards = document.querySelectorAll(".message-card");
const navItems = document.querySelectorAll(".bottom-nav a");
const fab = document.querySelector(".fab");
const menuBtn = document.querySelector(".menu-btn");

cards.forEach((card) => {
  card.addEventListener("click", () => {
    card.classList.add("clicked");

    setTimeout(() => {
      card.classList.remove("clicked");
    }, 250);
  });
});

navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();

    navItems.forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");
  });
});

fab.addEventListener("click", () => {
  fab.animate(
    [
      { transform: "scale(1) rotate(0deg)" },
      { transform: "scale(0.9) rotate(10deg)" },
      { transform: "scale(1) rotate(0deg)" }
    ],
    {
      duration: 280,
      easing: "ease-out"
    }
  );
});

menuBtn.addEventListener("click", () => {
  menuBtn.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: "rotate(8deg)" },
      { transform: "rotate(0deg)" }
    ],
    {
      duration: 220,
      easing: "ease-out"
    }
  );
});