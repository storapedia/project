export function showLoader(show, text = 'Loading...') {
  let loader = document.getElementById('loader-overlay');
  if (show) {
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'loader-overlay';
      loader.innerHTML = `<div class="spinner"></div><p id="loader-text"></p>`;
      document.body.appendChild(loader);
    }
    loader.querySelector('#loader-text').textContent = text;
    loader.style.display = 'flex';
  } else if (loader) {
    loader.style.display = 'none';
  }
}

export function showToast(message, type = 'success') {
  if (typeof Swal === 'undefined') return;
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: type,
    title: message,
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
  });
}

export function showModal(modalId, contentHTML) {
  let modal = document.getElementById(modalId);
  if (modal) {
    modal.remove();
  }
  
  modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'modal-overlay';
  modal.innerHTML = contentHTML;
  document.body.appendChild(modal);

  setTimeout(() => {
    modal.classList.add('active');
  }, 10);

  modal.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') || e.target.closest('.close-modal-btn') || e.target.closest('.back-modal-btn')) {
      hideModal(modalId);
    }
  });
}

export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    modal.addEventListener('transitionend', () => modal.remove(), { once: true });
  }
}

export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}