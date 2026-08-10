const dashboardAlert = document.getElementById('dashboard-alert');
const recentRooms = document.getElementById('recent-rooms');
let currentUser = null;
let liveRefreshTimer = null;
let liveRefreshSource = null;
let nextConversationCode = null;
let nextConversationTimer = null;

function hasActiveTrial(user = currentUser) {
  return user?.membership?.status === 'active' && user.membership.planKey === 'trial1';
}
function hasActiveMembership(user = currentUser) {
  return user?.membership?.status === 'active';
}

function membershipText(membership) {
  if (!membership) return ['Not set', 'Contact the administrator.'];
  if (membership.status === 'active') {
    const expiry = membership.expiresAt ? formatDate(membership.expiresAt) : 'No expiry';
    return [membership.planLabel, `${membership.daysRemaining} day${membership.daysRemaining === 1 ? '' : 's'} remaining · expires ${expiry}`];
  }
  if (membership.status === 'expired') return ['Trial or plan expired', `Expired ${membership.expiresAt ? formatDate(membership.expiresAt) : ''}. Choose a plan below to continue.`];
  return ['Not activated', 'Choose a plan below and contact us on WhatsApp.'];
}

function roomStatusBadge(status) {
  const label = { pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected', closed: 'Closed' }[status] || status;
  return `<span class="status status-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function renderRooms(rooms) {
  if (!rooms.length) {
    recentRooms.innerHTML = '<div class="empty-state">You have not created a room yet.</div>';
    return;
  }
  recentRooms.innerHTML = rooms.map((room) => {
    const canOpen = room.status === 'approved';
    return `
      <article class="room-row">
        <div>
          <div class="room-row-title"><strong>${escapeHtml(room.title)}</strong>${roomStatusBadge(room.status)}</div>
          <small>${escapeHtml(room.levelLabel)} · Limit ${room.capacity} · Owner ${escapeHtml(room.ownerName)} · ${escapeHtml(formatDate(room.createdAt))}</small>
        </div>
        <div class="row-actions">
          <span class="room-code">${escapeHtml(room.code)}</span>
          ${canOpen ? `<button class="btn btn-outline btn-tiny" data-copy="${escapeHtml(room.code)}">Copy invite</button><a class="btn btn-primary btn-tiny" href="/room/${escapeHtml(room.code)}">Open</a>` : '<span class="helper">Unavailable</span>'}
        </div>
      </article>
    `;
  }).join('');
}

async function loadNextConversation() {
  const roomsLabel = document.getElementById('join-active-rooms');
  const usersLabel = document.getElementById('join-active-users');
  const levelLabelElement = document.getElementById('join-user-level');
  const note = document.getElementById('join-next-note');
  const button = document.getElementById('join-next-button');
  if (!roomsLabel || !usersLabel || !levelLabelElement || !note || !button || !currentUser) return;

  const activeAccess = hasActiveMembership(currentUser);
  levelLabelElement.textContent = activeAccess ? 'All levels · Active access' : (currentUser.levelLabel || levelLabel(currentUser.level));
  try {
    const data = await api('/api/public/live-rooms');
    const rooms = Array.isArray(data.rooms) ? data.rooms : [];
    const totalParticipants = Number(data.totalParticipants || 0);
    const available = activeAccess ? rooms.find((room) => !room.isFull && !room.isLocked) : null;

    roomsLabel.textContent = `${rooms.length} live room${rooms.length === 1 ? '' : 's'}`;
    usersLabel.textContent = `${totalParticipants} learner${totalParticipants === 1 ? '' : 's'} speaking now`;
    nextConversationCode = available?.code || null;
    button.disabled = !activeAccess;

    if (available) {
      button.querySelector('span:first-child').textContent = `Join ${available.title}`;
      note.textContent = `${available.liveParticipants} of ${available.capacity} participants · ${available.levelLabel} · active membership access`;
      button.classList.add('has-live-room');
    } else {
      button.querySelector('span:first-child').textContent = rooms.length ? 'Browse or enter a room code' : 'Create or join a room';
      note.textContent = !activeAccess
        ? 'Your trial or paid plan is not active. Choose a plan below to continue.'
        : (rooms.length
          ? 'No open room is available right now. You can still enter an invite code below.'
          : 'No rooms are live right now. Create one instantly.');
      button.classList.remove('has-live-room');
    }
  } catch (error) {
    roomsLabel.textContent = 'Rooms unavailable';
    usersLabel.textContent = 'Refresh shortly';
    nextConversationCode = null;
    button.disabled = false;
    button.querySelector('span:first-child').textContent = 'Enter a room code';
    note.textContent = 'Live-room status could not be loaded, but invite links still work.';
  }
}

function bindJoinNextConversation() {
  const button = document.getElementById('join-next-button');
  if (!button) return;
  button.addEventListener('click', () => {
    if (nextConversationCode) {
      window.location.href = `/room/${nextConversationCode}`;
      return;
    }
    document.getElementById('join-room-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => document.getElementById('join-code')?.focus(), 450);
  });
}

function updatePricingLinks(user) {
  const username = user?.username || '';
  document.querySelectorAll('.plan-whatsapp-link').forEach((link) => {
    const plan = link.dataset.plan || 'paid plan';
    const price = link.dataset.price || '';
    const message = `Hey, I want to join the Bolo English ${plan} plan for ${price}. My username is ${username}. Please share the payment and activation details.`;
    link.href = `https://wa.me/918808394539?text=${encodeURIComponent(message)}`;
  });
}

function setRoomActionsEnabled(enabled) {
  document.querySelectorAll('#create-room-form input, #create-room-form select, #create-room-form button, #join-room-form input, #join-room-form button')
    .forEach((element) => { element.disabled = !enabled; });
  const joinNextButton = document.getElementById('join-next-button');
  if (joinNextButton && !enabled) joinNextButton.disabled = true;
}

async function loadDashboard() {
  clearAlert(dashboardAlert);
  try {
    const { user } = await api('/api/me');
    if (!user) return window.location.href = '/login';
    if (user.role === 'admin') return window.location.href = '/admin';
    if (user.status !== 'approved' || !user.level) return window.location.href = '/pending';

    currentUser = user;
    const activeAccess = hasActiveMembership(user);
    let rooms = [];
    if (activeAccess) {
      const roomData = await api('/api/rooms');
      rooms = Array.isArray(roomData.rooms) ? roomData.rooms : [];
    }

    const greeting = document.getElementById('dashboard-greeting');
    if (greeting) greeting.textContent = user.displayName || user.username || 'Bolo English learner';
    document.getElementById('member-level').textContent = `${user.levelLabel} · ${user.gender || ''}`;
    document.getElementById('profile-level').value = String(user.level);
    document.getElementById('profile-gender').value = user.gender || 'male';
    const [plan, expiry] = membershipText(user.membership);
    document.getElementById('membership-plan').textContent = plan;
    document.getElementById('membership-expiry').textContent = expiry;

    const pricingSection = document.getElementById('pricing-section');
    const pricingHeading = document.getElementById('pricing-heading');
    const pricingCopy = document.getElementById('pricing-copy');
    const pricingBadge = document.getElementById('pricing-badge');
    pricingSection?.classList.toggle('is-expired', !activeAccess);
    if (!activeAccess) {
      pricingBadge.textContent = 'Your trial has ended';
      pricingHeading.textContent = 'Choose a plan to continue speaking';
      pricingCopy.textContent = 'Room access is paused. Select a plan below and message us on WhatsApp. The administrator will activate your validity after payment.';
      showAlert(dashboardAlert, 'Your free trial or paid plan has ended. Choose a plan below to continue.', 'error');
    } else if (hasActiveTrial(user)) {
      pricingBadge.textContent = 'Free trial active';
      pricingHeading.textContent = 'Continue after your 1-day trial';
      pricingCopy.textContent = 'Your trial is active now. Choose a paid plan anytime so your practice continues without interruption.';
    } else {
      pricingBadge.textContent = 'Paid membership active';
      pricingHeading.textContent = 'Your Bolo English access is active';
      pricingCopy.textContent = 'You can join any available room and create your own rooms. Extend your plan anytime through WhatsApp.';
    }
    updatePricingLinks(user);
    setRoomActionsEnabled(activeAccess);

    const createHeading = document.getElementById('room-create-heading');
    const createNote = document.getElementById('room-create-note');
    const createButton = document.getElementById('room-create-button');
    const joinHeading = document.getElementById('join-room-heading');
    const joinNote = document.getElementById('join-room-note');
    const roomListTitle = document.getElementById('room-list-title');
    const roomListNote = document.getElementById('room-list-note');

    if (createHeading) createHeading.textContent = activeAccess ? 'Create a voice room instantly' : 'Room creation paused';
    if (createNote) createNote.textContent = activeAccess
      ? 'Free-trial and paid members can create rooms immediately without approval.'
      : 'Choose a paid plan to create rooms again.';
    if (createButton) createButton.textContent = activeAccess ? 'Create room now' : 'Membership required';
    if (joinHeading) joinHeading.textContent = activeAccess ? 'Join any active room' : 'Room access paused';
    if (joinNote) joinNote.textContent = activeAccess
      ? 'Paste any valid invite link or room code. Active members may join rooms across all English levels.'
      : 'Choose a paid plan to join voice rooms again.';
    if (roomListTitle) roomListTitle.textContent = 'Your rooms';
    if (roomListNote) roomListNote.textContent = activeAccess
      ? 'Rooms you create open instantly and can be shared using invite links.'
      : 'Your previous rooms remain listed after your membership is reactivated.';

    renderRooms(rooms);
    await loadNextConversation();
  } catch (error) {
    showAlert(dashboardAlert, error.message);
  }
}

function extractRoomCode(value) {
  const input = String(value || '').trim();
  const match = input.toUpperCase().match(/(?:ROOM\/)?([A-F0-9]{8})(?:\b|$)/);
  return match?.[1] || null;
}

document.getElementById('profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  setBusy(button, true, 'Saving…');
  try {
    const data = await api('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        level: Number(document.getElementById('profile-level').value),
        gender: document.getElementById('profile-gender').value
      })
    });
    currentUser = data.user;
    showAlert(dashboardAlert, 'Speaking profile updated.', 'success');
    await loadDashboard();
  } catch (error) {
    showAlert(dashboardAlert, error.message);
  } finally {
    setBusy(button, false);
  }
});

document.getElementById('create-room-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlert(dashboardAlert);
  const button = event.currentTarget.querySelector('button');
  setBusy(button, true, 'Submitting…');
  try {
    const data = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('room-title').value.trim(),
        capacity: Number(document.getElementById('room-capacity-input').value)
      })
    });
    showAlert(dashboardAlert, data.message || 'Room created.', 'success');
    await loadDashboard();
  } catch (error) {
    showAlert(dashboardAlert, error.message);
  } finally {
    setBusy(button, false);
  }
});

document.getElementById('join-room-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = extractRoomCode(document.getElementById('join-code').value);
  if (!code) return showAlert(dashboardAlert, 'Enter a valid 8-character room code or invite link.');
  window.location.href = `/room/${code}`;
});

recentRooms.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  const link = `${window.location.origin}/room/${button.dataset.copy}`;
  try {
    await navigator.clipboard.writeText(link);
    showAlert(dashboardAlert, 'Invite link copied.', 'success');
  } catch {
    window.prompt('Copy this invite link:', link);
  }
});

document.getElementById('refresh-rooms').addEventListener('click', loadDashboard);

function scheduleDashboardRefresh(message = '') {
  clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(async () => {
    await loadDashboard();
    if (message) showAlert(dashboardAlert, message, 'success');
  }, 180);
}

liveRefreshSource = createLiveUpdateStream({
  'room-updated': ({ room }) => {
    const message = room?.status === 'approved'
      ? `“${room.title}” was approved and is ready to join.`
      : 'A room request was updated by the administrator.';
    scheduleDashboardRefresh(message);
  },
  'room-deleted': () => scheduleDashboardRefresh('A room was removed by the administrator.'),
  'account-updated': () => scheduleDashboardRefresh('Your account settings were updated by the administrator.'),
  'account-deleted': () => window.location.replace('/login')
});

nextConversationTimer = window.setInterval(() => {
  if (document.visibilityState === 'visible') loadNextConversation();
}, 10000);

const dashboardFallbackTimer = window.setInterval(() => {
  if (document.visibilityState === 'visible') scheduleDashboardRefresh();
}, 12000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleDashboardRefresh();
});
window.addEventListener('beforeunload', () => {
  liveRefreshSource?.close();
  clearTimeout(liveRefreshTimer);
  clearInterval(dashboardFallbackTimer);
  clearInterval(nextConversationTimer);
});

bindJoinNextConversation();
loadDashboard();
