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
