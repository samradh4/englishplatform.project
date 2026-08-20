const api = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const initials = (name) => String(name || 'BE')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join('');

const formatDate = (value) => {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

const levelLabel = (level) => ({
  1: 'Level 1 · Beginner',
  2: 'Level 2 · Intermediate',
  3: 'Level 3 · Advanced'
})[Number(level)] || 'Level not assigned';

function showAlert(element, message, type = 'error') {
  if (!element) return;
  element.textContent = message;
  element.className = `alert show alert-${type}`;
}

function clearAlert(element) {
  if (!element) return;
  element.textContent = '';
  element.className = 'alert';
}

function setBusy(button, busy, busyText = 'Please wait…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function bindLogout() {
  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); }
      finally { window.location.href = '/login'; }
    });
  });
}

async function loadUserChip() {
  const chip = document.querySelector('[data-user-chip]');
  if (!chip) return null;
  const { user } = await api('/api/me');
  if (!user) return null;
  chip.innerHTML = `
    <span class="avatar avatar-small">${escapeHtml(initials(user.displayName))}</span>
    <span><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.role === 'admin' ? 'Administrator' : levelLabel(user.level))}</small></span>
  `;
  return user;
}

bindLogout();
loadUserChip().catch(() => {});


/**
 * Opens a single authenticated Server-Sent Events stream for live account,
 * room, and admin updates. EventSource reconnects automatically if the
 * network briefly drops. Each handler receives already-parsed JSON.
 */
function createLiveUpdateStream(handlers = {}) {
  if (!('EventSource' in window)) return null;
  const source = new EventSource('/api/events');
  Object.entries(handlers).forEach(([eventName, handler]) => {
    source.addEventListener(eventName, (event) => {
      try { handler(JSON.parse(event.data || '{}'), event); }
      catch (error) { console.error(`Live update handler failed for ${eventName}`, error); }
    });
  });
  return source;
}

/**
 * Global Bolo English WhatsApp support shortcut.
 * Kept in common.js so the same support option is available on public,
 * member, normal-room and private-session pages.
 */
function installWhatsAppSupport() {
  if (!document.body || document.getElementById('bolo-whatsapp-support')) return;

  const style = document.createElement('style');
  style.id = 'bolo-whatsapp-support-style';
  style.textContent = `
    .bolo-whatsapp-support {
      position: fixed;
      right: max(16px, env(safe-area-inset-right));
      bottom: max(18px, env(safe-area-inset-bottom));
      z-index: 9998;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 48px;
      padding: 0 16px;
      border-radius: 999px;
      background: #25D366;
      color: #062d19;
      text-decoration: none;
      font: inherit;
      font-weight: 800;
      box-shadow: 0 10px 30px rgba(0, 0, 0, .22);
      border: 1px solid rgba(255, 255, 255, .45);
    }
    .bolo-whatsapp-support:hover { transform: translateY(-1px); }
    .bolo-whatsapp-support .bolo-wa-icon { font-size: 20px; line-height: 1; }
    .room-body .bolo-whatsapp-support,
    .private-guest-body .bolo-whatsapp-support {
      bottom: calc(max(18px, env(safe-area-inset-bottom)) + 82px);
    }
    @media (max-width: 640px) {
      .bolo-whatsapp-support {
        right: max(10px, env(safe-area-inset-right));
        min-height: 44px;
        padding: 0 12px;
        font-size: 13px;
      }
      .room-body .bolo-whatsapp-support,
      .private-guest-body .bolo-whatsapp-support {
        bottom: calc(max(12px, env(safe-area-inset-bottom)) + 76px);
      }
    }
  `;
  document.head.appendChild(style);

  const link = document.createElement('a');
  link.id = 'bolo-whatsapp-support';
  link.className = 'bolo-whatsapp-support';
  link.href = 'https://wa.me/918808394539?text=Hi%20Bolo%20English%2C%20I%20need%20help.';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'Chat with Bolo English on WhatsApp at +91 88083 94539');
  link.innerHTML = '<span class="bolo-wa-icon" aria-hidden="true">💬</span><span>WhatsApp</span>';
  document.body.appendChild(link);
}

installWhatsAppSupport();
