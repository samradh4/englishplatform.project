const publicRoomGrid = document.getElementById('public-room-grid');
const publicOnlineCount = document.getElementById('public-online-count');
let homepageViewer = null;
let homepageAccessApproved = false;
try { localStorage.removeItem('uh.pendingRoom'); } catch {}

function publicRoomInitials(username) {
  return String(username || 'BE').slice(0, 2).toUpperCase();
}

function roomJoinUrl(code) {
  return homepageAccessApproved ? `/room/${code}` : '/register';
}

function updateHomepageForSession() {
  const navActions = document.querySelector('.nav-actions');
  const heroActions = document.querySelector('.hero-actions');
  if (!homepageViewer) return;

  const destination = homepageViewer.role === 'admin' ? '/admin' : '/dashboard';
  const primaryLabel = homepageViewer.role === 'admin' ? 'Open admin panel' : 'Open dashboard';

  if (navActions) navActions.innerHTML = `
    <a class="btn btn-primary btn-small" href="${destination}">${primaryLabel}</a>
    <button class="btn btn-outline btn-small" type="button" data-home-logout>Sign out</button>`;
  if (heroActions) heroActions.innerHTML = `
    <a class="btn btn-primary" href="${destination}">${primaryLabel} →</a>
    <a class="btn btn-secondary" href="#live-rooms">Browse live rooms</a>`;

  document.querySelectorAll('[data-home-logout]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); }
      finally { window.location.href = '/'; }
    });
  });
}

async function loadHomepageSession() {
  try {
    const data = await api('/api/me');
    homepageViewer = data.user || null;
    homepageAccessApproved = Boolean(data.accessApproved);
    updateHomepageForSession();
  } catch {
    homepageViewer = null;
    homepageAccessApproved = false;
  }
}

function renderPublicRooms(rooms, totalParticipants) {
  publicOnlineCount.textContent = `${totalParticipants} online`;
  if (!rooms.length) {
    publicRoomGrid.innerHTML = `
      <article class="public-room-empty">
        <div class="empty-live-icon"><span class="live-dot"></span></div>
        <div><h3>No live rooms right now.</h3><p>Approved rooms will appear here automatically as soon as members start speaking.</p></div>
        <a class="btn btn-primary" href="/register">Create account</a>
      </article>`;
    return;
  }

  publicRoomGrid.innerHTML = rooms.map((room) => {
    const visibleNames = room.participants || [];
    const overflow = Math.max(0, room.liveParticipants - visibleNames.length);
    const statusText = room.isFull ? 'Room full' : room.isLocked ? 'Locked by admin' : (homepageAccessApproved ? 'Join room' : 'Create account to join');
    const statusClass = room.isFull || room.isLocked ? 'public-room-status muted' : 'public-room-status';
    return `
      <a class="public-room-card" href="${roomJoinUrl(room.code)}" data-room-code="${escapeHtml(room.code)}" aria-label="Create an account to join ${escapeHtml(room.title)}">
        <div class="public-room-top">
          <span class="level-badge level-${room.level}">${escapeHtml(room.levelLabel)}</span>
          <span class="public-room-live"><span class="live-dot"></span>LIVE</span>
        </div>
        <h3>${escapeHtml(room.title)}</h3>
        <p>${room.liveParticipants} of ${room.capacity} participants speaking</p>
        <div class="public-participants">
          ${visibleNames.map((participant) => `
            <span class="public-participant" title="${escapeHtml(participant.username)}">
              <span class="public-avatar">${escapeHtml(publicRoomInitials(participant.username))}</span>
              <strong>${escapeHtml(participant.username)}</strong>
            </span>`).join('')}
          ${overflow ? `<span class="public-more">+${overflow} more</span>` : ''}
        </div>
        <div class="public-room-footer">
          <span class="${statusClass}">${escapeHtml(statusText)}</span>
          <span aria-hidden="true">→</span>
        </div>
      </a>`;
  }).join('');
}

async function loadPublicRooms() {
  try {
    const data = await api('/api/public/live-rooms');
    renderPublicRooms(data.rooms || [], Number(data.totalParticipants || 0));
  } catch (error) {
    publicRoomGrid.innerHTML = `<div class="public-room-loading">Live rooms could not be loaded. Please refresh shortly.</div>`;
  }
}

loadHomepageSession().finally(loadPublicRooms);
setInterval(loadPublicRooms, 10000);
