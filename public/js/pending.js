const statusAlert = document.getElementById('status-alert');
const checkButton = document.getElementById('check-status');
let statusCheckInFlight = false;

function renderPending(user) {
  const membership = user.membership || {};
  if (user.status === 'approved' && membership.status === 'expired') {
    document.getElementById('pending-eyebrow').textContent = 'Membership expired';
    document.getElementById('pending-title').textContent = 'Your validity has ended.';
    document.getElementById('pending-copy').textContent = 'Your free trial or paid plan has ended. Open your dashboard, choose a plan, and message Bolo English on WhatsApp.';
  } else if (user.status === 'approved' && membership.status === 'not-set') {
    document.getElementById('pending-eyebrow').textContent = 'Validity required';
    document.getElementById('pending-title').textContent = 'Your membership needs activation.';
    document.getElementById('pending-copy').textContent = 'Complete payment and ask the administrator to activate your selected paid validity plan.';
  } else if (user.status === 'approved' && !user.level) {
    document.getElementById('pending-eyebrow').textContent = 'English level required';
    document.getElementById('pending-title').textContent = 'Your account is approved.';
    document.getElementById('pending-copy').textContent = 'Contact the administrator to correct your English speaking level.';
  }

  const details = [
    `<span class="status status-${escapeHtml(user.status)}">Account: ${escapeHtml(user.status)}</span>`
  ];
  if (user.levelLabel) details.push(`<span class="level-badge level-${user.level}">${escapeHtml(user.levelLabel)}</span>`);
  if (membership.planLabel) {
    const statusClass = membership.status === 'active' ? 'approved' : membership.status === 'expired' ? 'rejected' : 'pending';
    details.push(`<span class="status status-${statusClass}">${escapeHtml(membership.planLabel)}${membership.daysRemaining ? ` · ${membership.daysRemaining}d left` : ''}</span>`);
  }
  document.getElementById('pending-details').innerHTML = details.join('');
}

function approvedDestination() {
  try { localStorage.removeItem('uh.pendingRoom'); } catch {}
  return '/dashboard';
}

async function checkStatus(showWaitingMessage = false) {
  if (statusCheckInFlight) return;
  statusCheckInFlight = true;
  try {
    const { user, accessApproved } = await api('/api/me');
    if (!user) return window.location.replace('/login');
    if (user.role === 'admin') return window.location.replace('/admin');
    if (accessApproved) {
      showAlert(statusAlert, 'Approved! Opening your account…', 'success');
      return window.location.replace(approvedDestination());
    }
    renderPending(user);
    if (showWaitingMessage) showAlert(statusAlert, 'Validity is not active yet. This page also updates automatically.', 'success');
  } catch (error) {
    if (showWaitingMessage) showAlert(statusAlert, error.message);
  } finally {
    statusCheckInFlight = false;
  }
}

// The requested button performs a real page refresh, then the fresh page checks
// the latest account, level, and membership status from the backend.
checkButton.addEventListener('click', () => {
  setBusy(checkButton, true, 'Refreshing…');
  window.location.reload();
});

const liveUpdates = createLiveUpdateStream({
  'account-updated': () => checkStatus(false),
  'account-deleted': () => window.location.replace('/login')
});

// Polling is a fallback for older browsers or networks that interrupt SSE.
const approvalFallbackTimer = window.setInterval(() => {
  if (document.visibilityState === 'visible') checkStatus(false);
}, 6000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkStatus(false);
});
window.addEventListener('beforeunload', () => {
  liveUpdates?.close();
  clearInterval(approvalFallbackTimer);
});

checkStatus(false);
