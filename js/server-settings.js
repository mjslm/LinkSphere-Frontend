document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const toast = document.getElementById('toast');
  const saveBtn = document.querySelector('.save-btn');
  const deleteBtn = document.querySelector('.delete-btn');
  const nameInput = document.getElementById('serverName');

  saveBtn.addEventListener('click', () => {
    toast.textContent = `Saved: ${nameInput.value || 'Untitled server'}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  });

  deleteBtn.addEventListener('click', () => {
    deleteBtn.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-8px)' },
      { transform: 'translateX(8px)' },
      { transform: 'translateX(0)' }
    ], { duration: 280, easing: 'ease-in-out' });
  });

  document.querySelectorAll('[data-ripple]').forEach((button) => {
    button.style.position = 'relative';
    button.style.overflow = 'hidden';

    button.addEventListener('click', (event) => {
      const rect = button.getBoundingClientRect();
      const circle = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      circle.className = 'ripple';
      circle.style.width = circle.style.height = `${size}px`;
      circle.style.left = `${event.clientX - rect.left - size / 2}px`;
      circle.style.top = `${event.clientY - rect.top - size / 2}px`;
      button.appendChild(circle);
      circle.addEventListener('animationend', () => circle.remove());
    });
  });
});