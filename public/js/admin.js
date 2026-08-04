const adminAlert = document.getElementById('admin-alert');
const usersList = document.getElementById('users-list');
const roomsList = document.getElementById('rooms-list');
const reportsList = document.getElementById('reports-list');
const privateSessionsList = document.getElementById('private-sessions-list');
const privateSessionForm = document.getElementById('private-session-form');
let users = [];
let rooms = [];
let reports = [];
let privateSessions = [];
let userFilter = 'all';
let roomFilter = 'pending';
let reportFilter = 'open';

const planOptions = `
  <option value="">Choose validity</option>
  <option value="trial1">1-day free trial</option>
  <option value="month1">1 month · ₹500</option>
  <option value="month3">3 months · ₹999</option>
  <option value="teacher1to1">1-to-1 with teachers · ₹6,000</option>`;


function privateSessionCard(session) {
  const expired = new Date(session.expiresAt).getTime() <= Date.now();
  const state = session.status === 'revoked' ? 'Revoked' : expired ? 'Expired' : 'Active';
  const statusClass = state === 'Active' ? 'approved' : 'rejected';
  const visitorRows = session.recentVisitors?.length
    ? session.recentVisitors.map((visitor) => `<li class="private-visitor-admin-row" data-private-visitor="${escapeHtml(visitor.id)}">
        <div class="private-visitor-summary"><strong>${escapeHtml(visitor.displayName || visitor.name)}</strong>${visitor.specialTag ? `<span class="special-person-tag">${escapeHtml(visitor.specialTag)}</span>` : ''}<small>${visitor.role === 'admin' ? 'Administrator' : escapeHtml(visitor.phone)} · ${escapeHtml(formatDate(visitor.joinedAt))}</small></div>
        <label>Special display name<input class="input input-small" data-private-visitor-field="displayName" maxlength="40" value="${escapeHtml(visitor.displayName || visitor.name)}"></label>
        <label>Special tag<input class="input input-small" data-private-visitor-field="specialTag" list="special-tag-options" maxlength="24" placeholder="Teacher, Mentor, Guest Speaker" value="${escapeHtml(visitor.specialTag || '')}"></label>
        <button class="btn btn-secondary btn-tiny" data-private-action="save-visitor" data-id="${escapeHtml(session.id)}" data-visitor-id="${escapeHtml(visitor.id)}">Save name & tag</button>
      </li>`).join('')
    : '<li class="private-no-visitors">No guests have joined yet.</li>';
  return `
    <article class="admin-item private-session-item" data-private-card="${escapeHtml(session.id)}">
      <div class="admin-item-head">
        <div><strong>${escapeHtml(session.title)}</strong><small>Expires ${escapeHtml(formatDate(session.expiresAt))} · ${session.liveParticipants}/${session.capacity} live · ${session.visitorCount} guest record(s)</small></div>
        <div class="badge-row"><span class="status status-${statusClass}">${state}</span><span class="status status-approved">Admin camera only</span></div>
      </div>
      <div class="private-link-row">
        <input class="input input-small" data-private-link readonly value="${escapeHtml(session.joinUrl)}" aria-label="Private guest link">
        <button class="btn btn-primary btn-small" data-private-action="copy" data-id="${escapeHtml(session.id)}">Copy link</button>
        <a class="btn btn-secondary btn-small" href="${escapeHtml(session.joinUrl)}" target="_blank" rel="noopener">Open</a>
      </div>
      <details class="private-visitor-details"><summary>Guest names and phone numbers</summary><ul>${visitorRows}</ul></details>
      <div class="row-actions admin-actions">
        ${session.status === 'active' && !expired ? `<button class="btn btn-outline btn-tiny" data-private-action="extend" data-id="${escapeHtml(session.id)}">Extend 24h</button><button class="btn btn-danger btn-tiny" data-private-action="revoke" data-id="${escapeHtml(session.id)}">Revoke link</button>` : `<button class="btn btn-primary btn-tiny" data-private-action="reactivate" data-id="${escapeHtml(session.id)}">Reactivate 24h</button>`}
        <button class="btn btn-danger btn-tiny" data-private-action="delete" data-id="${escapeHtml(session.id)}">Delete</button>
      </div>
    </article>`;
}

function renderPrivateSessions() {
  if (!privateSessionsList) return;
  privateSessionsList.innerHTML = privateSessions.length ? privateSessions.map(privateSessionCard).join('') : '<div class="empty-state">No private guest links yet.</div>';
  const stat = document.getElementById('stat-private');
  if (stat) stat.textContent = privateSessions.filter((session) => session.status === 'active' && new Date(session.expiresAt).getTime() > Date.now()).length;
}

function membershipBadge(user) {
  const m = user.membership;
  if (!m || m.status === 'not-set') return '<span class="status status-pending">No validity</span>';
  if (m.status === 'expired') return '<span class="status status-rejected">Expired</span>';
  return `<span class="status status-approved">${escapeHtml(m.planLabel)} · ${m.daysRemaining}d left</span>`;
}

function userCard(user) {
  const publicName = user.displayName || user.fullName || user.username;
  const legalName = user.fullName || publicName;
  const contactEmail = user.email
    ? `<a class="member-contact-link" href="mailto:${escapeHtml(user.email)}">${escapeHtml(user.email)}</a>`
    : '<span>Not provided</span>';
  const contactPhone = user.phone
    ? `<a class="member-contact-link" href="tel:${escapeHtml(user.phone)}">${escapeHtml(user.phone)}</a>`
    : '<span>Not provided</span>';
  return `
    <article class="admin-item member-admin-card" data-user-card="${escapeHtml(user.id)}">
      <div class="admin-item-head">
        <div class="member-cell"><span class="avatar">${escapeHtml(initials(publicName))}</span><div><strong>${escapeHtml(legalName)}</strong><small>@${escapeHtml(user.username)} · ${escapeHtml(user.gender || 'gender not set')} · joined ${escapeHtml(formatDate(user.createdAt))}</small>${publicName !== legalName ? `<small>Public name: ${escapeHtml(publicName)}</small>` : ''}</div></div>
        <div class="badge-row"><span class="status status-${escapeHtml(user.status)}">${user.status === 'approved' ? 'Instant access' : escapeHtml(user.status)}</span>${user.specialTag ? `<span class="special-person-tag">${escapeHtml(user.specialTag)}</span>` : ''}${membershipBadge(user)}${user.resetStatus ? `<span class="status status-pending">Reset: ${escapeHtml(user.resetStatus)}</span>` : ''}</div>
      </div>
      <div class="member-contact-panel" aria-label="Member contact details">
        <div><span>Email</span><strong>${contactEmail}</strong></div>
        <div><span>Phone</span><strong>${contactPhone}</strong></div>
        <div><span>Username</span><strong>@${escapeHtml(user.username)}</strong></div>
        <div><span>Trial / validity</span><strong>${escapeHtml(user.membership?.planLabel || 'Not set')}</strong></div>
      </div>
      <div class="admin-controls-grid">
        <label>English level<select class="input input-small" data-field="level"><option value="">Choose level</option><option value="1" ${user.level === 1 ? 'selected' : ''}>Level 1</option><option value="2" ${user.level === 2 ? 'selected' : ''}>Level 2</option><option value="3" ${user.level === 3 ? 'selected' : ''}>Level 3</option></select></label>
        <label>Gender<select class="input input-small" data-field="gender"><option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option><option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option></select></label>
        <label>Public display name<input class="input input-small" data-field="displayName" maxlength="40" value="${escapeHtml(publicName)}" placeholder="Name shown in rooms"></label>
        <label>Special tag<input class="input input-small" data-field="specialTag" list="special-tag-options" maxlength="24" value="${escapeHtml(user.specialTag || '')}" placeholder="Teacher, Mentor, Guest Speaker"></label>
        <label>Paid validity<select class="input input-small" data-field="plan">${planOptions}</select></label>
        <div class="device-box"><span>Account access</span><strong>Instant access</strong><small>No approval required. Activate or extend a paid plan after payment.</small></div>
      </div>
      <div class="row-actions admin-actions">
        ${user.status !== 'approved' ? `<button class="btn btn-primary btn-tiny" data-user-action="approve" data-id="${user.id}">Activate account</button>` : `<button class="btn btn-secondary btn-tiny" data-user-action="save" data-id="${user.id}">Save profile</button>`}
        <button class="btn btn-primary btn-tiny" data-user-action="extend" data-id="${user.id}">Activate / extend paid plan</button>
        <button class="btn btn-outline btn-tiny" data-user-action="reset" data-id="${user.id}">Issue reset code</button>
        <button class="btn btn-danger btn-tiny" data-user-action="expire" data-id="${user.id}">Expire now</button>
        <button class="btn btn-danger btn-tiny" data-user-action="delete" data-id="${user.id}">Delete</button>
      </div>
    </article>`;
}
function roomCard(room) {
  return `
    <article class="admin-item" data-room-card="${escapeHtml(room.code)}">
      <div class="admin-item-head">
        <div><strong>${escapeHtml(room.title)}</strong><small>${escapeHtml(room.code)} · Owner ${escapeHtml(room.ownerName)} · ${escapeHtml(formatDate(room.createdAt))}</small></div>
        <div class="badge-row"><span class="status status-${escapeHtml(room.status)}">${escapeHtml(room.status)}</span>${room.isLocked ? '<span class="status status-rejected">Locked</span>' : ''}<span class="status status-approved">${room.liveParticipants} live</span></div>
      </div>
      <div class="admin-controls-grid room-admin-grid">
        <label>Topic<input class="input input-small" data-room-field="title" maxlength="60" value="${escapeHtml(room.title)}"></label>
        <label>Level<select class="input input-small" data-room-field="level"><option value="1" ${room.level === 1 ? 'selected' : ''}>Level 1</option><option value="2" ${room.level === 2 ? 'selected' : ''}>Level 2</option><option value="3" ${room.level === 3 ? 'selected' : ''}>Level 3</option></select></label>
        <label>Participant limit<select class="input input-small" data-room-field="capacity">${Array.from({length:11},(_,i)=>i+2).map(n=>`<option value="${n}" ${room.capacity===n?'selected':''}>${n}</option>`).join('')}</select></label>
        <div class="device-box"><span>Room state</span><strong>${room.levelLabel}</strong><small>${room.bannedCount} banned participant(s)</small></div>
      </div>
      <div class="row-actions admin-actions">
        <button class="btn btn-secondary btn-tiny" data-room-action="save" data-code="${room.code}">Save changes</button>
        ${room.status !== 'approved' ? `<button class="btn btn-primary btn-tiny" data-room-action="approve" data-code="${room.code}">Approve room</button>` : `<a class="btn btn-primary btn-tiny" href="/room/${room.code}">Join as admin</a>`}
        <button class="btn btn-outline btn-tiny" data-room-action="${room.isLocked ? 'unlock' : 'lock'}" data-code="${room.code}">${room.isLocked ? 'Unlock' : 'Lock'}</button>
        <button class="btn btn-outline btn-tiny" data-room-action="clear-bans" data-code="${room.code}">Clear bans</button>
        <button class="btn btn-danger btn-tiny" data-room-action="close" data-code="${room.code}">Close</button>
        <button class="btn btn-danger btn-tiny" data-room-action="delete" data-code="${room.code}">Delete</button>
      </div>
    </article>`;
}

function reportCard(report) {
  return `
    <article class="admin-item report-item" data-report-card="${escapeHtml(report.id)}" data-status="${escapeHtml(report.status)}">
      <div class="admin-item-head">
        <div><strong>${escapeHtml(report.targetName)} reported by ${escapeHtml(report.reporterName)}</strong><small>Room ${escapeHtml(report.roomTitle)} · ${escapeHtml(report.roomCode)} · ${escapeHtml(formatDate(report.createdAt))}</small></div>
        <div class="badge-row"><span class="status status-${report.status === 'open' ? 'pending' : report.status === 'reviewed' ? 'approved' : 'rejected'}">${escapeHtml(report.status)}</span></div>
      </div>
      <div class="report-complaint">${escapeHtml(report.complaint)}</div>
      <div class="admin-controls-grid report-admin-grid">
        <label>Status<select class="input input-small" data-report-field="status"><option value="open" ${report.status === 'open' ? 'selected' : ''}>Open</option><option value="reviewed" ${report.status === 'reviewed' ? 'selected' : ''}>Reviewed</option><option value="dismissed" ${report.status === 'dismissed' ? 'selected' : ''}>Dismissed</option></select></label>
        <label>Private admin note<textarea class="input input-small" data-report-field="note" maxlength="1000" placeholder="What action did you take?">${escapeHtml(report.adminNote || '')}</textarea></label>
      </div>
      <div class="row-actions admin-actions">
        <a class="btn btn-primary btn-tiny" href="/room/${escapeHtml(report.roomCode)}">Open room</a>
        <button class="btn btn-secondary btn-tiny" data-report-action="save" data-id="${escapeHtml(report.id)}">Save report</button>
        <button class="btn btn-outline btn-tiny" data-report-action="reviewed" data-id="${escapeHtml(report.id)}">Mark reviewed</button>
        <button class="btn btn-outline btn-tiny" data-report-action="dismissed" data-id="${escapeHtml(report.id)}">Dismiss</button>
      </div>
    </article>`;
}

function render() {
  const shownUsers = userFilter === 'all' ? users : users.filter(u => u.status === userFilter);
  const shownRooms = roomFilter === 'all' ? rooms : rooms.filter(r => r.status === roomFilter);
  const shownReports = reportFilter === 'all' ? reports : reports.filter(r => r.status === reportFilter);
  usersList.innerHTML = shownUsers.length ? shownUsers.map(userCard).join('') : '<div class="empty-state">No members in this view.</div>';
  roomsList.innerHTML = shownRooms.length ? shownRooms.map(roomCard).join('') : '<div class="empty-state">No rooms in this view.</div>';
  reportsList.innerHTML = shownReports.length ? shownReports.map(reportCard).join('') : '<div class="empty-state">No safety reports in this view.</div>';
  renderPrivateSessions();
  document.getElementById('stat-pending').textContent = users.filter(u => u.status === 'pending').length;
  document.getElementById('stat-active').textContent = users.filter(u => u.membership?.status === 'active' && u.status === 'approved').length;
  document.getElementById('stat-expired').textContent = users.filter(u => u.membership?.status === 'expired').length;
  document.getElementById('stat-rooms').textContent = rooms.filter(r => r.status === 'pending').length;
  document.getElementById('stat-reports').textContent = reports.filter(r => r.status === 'open').length;
}

async function refreshAll() {
  clearAlert(adminAlert);
  try {
    const [userData, roomData, reportData, privateData] = await Promise.all([api('/api/admin/users?status=all'), api('/api/admin/rooms?status=all'), api('/api/admin/reports?status=all'), api('/api/admin/private-sessions')]);
    users = userData.users;
    rooms = roomData.rooms;
    reports = reportData.reports;
    privateSessions = privateData.sessions;
    render();
  } catch (error) { showAlert(adminAlert, error.message); }
}

function userFields(id) {
  const card = document.querySelector(`[data-user-card="${CSS.escape(id)}"]`);
  return {
    level: Number(card.querySelector('[data-field="level"]').value),
    gender: card.querySelector('[data-field="gender"]').value,
    displayName: card.querySelector('[data-field="displayName"]').value.trim(),
    specialTag: card.querySelector('[data-field="specialTag"]').value.trim(),
    planKey: card.querySelector('[data-field="plan"]').value
  };
}

async function patchUser(id, payload) {
  const result = await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  if (result.resetCode) {
    const message = `One-time reset code for this member: ${result.resetCode}\nIt expires in 30 minutes.`;
    window.prompt('Copy and send this code privately to the member:', result.resetCode);
    showAlert(adminAlert, message, 'success');
  } else showAlert(adminAlert, 'Member updated.', 'success');
  await refreshAll();
}

usersList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-user-action]');
  if (!button) return;
  const { userAction: action, id } = button.dataset;
  const fields = userFields(id);
  button.disabled = true;
  try {
    if (action === 'approve') {
      if (![1,2,3].includes(fields.level) || !fields.planKey) throw new Error('Choose a level and validity plan first.');
      await patchUser(id, { status: 'approved', level: fields.level, gender: fields.gender, displayName: fields.displayName, specialTag: fields.specialTag, planKey: fields.planKey, approveDevice: false });
    } else if (action === 'save') await patchUser(id, { level: fields.level, gender: fields.gender, displayName: fields.displayName, specialTag: fields.specialTag });
    else if (action === 'device') await patchUser(id, { approveDevice: false });
    else if (action === 'extend') {
      if (!fields.planKey) throw new Error('Choose a validity plan first.');
      await patchUser(id, { planKey: fields.planKey, planMode: 'extend' });
    } else if (action === 'reset') await patchUser(id, { issueResetCode: true });
    else if (action === 'pending') await patchUser(id, { status: 'pending' });
    else if (action === 'expire') { if (confirm('Expire this membership now?')) await patchUser(id, { expireNow: true }); }
    else if (action === 'delete') {
      if (!confirm('Delete this member and their rooms?')) return;
      await api(`/api/admin/users/${id}`, { method: 'DELETE' });
      showAlert(adminAlert, 'Member deleted.', 'success');
      await refreshAll();
    }
  } catch (error) { showAlert(adminAlert, error.message); }
  finally { button.disabled = false; }
});

function roomFields(code) {
  const card = document.querySelector(`[data-room-card="${CSS.escape(code)}"]`);
  return {
    title: card.querySelector('[data-room-field="title"]').value.trim(),
    level: Number(card.querySelector('[data-room-field="level"]').value),
    capacity: Number(card.querySelector('[data-room-field="capacity"]').value)
  };
}

async function patchRoom(code, payload) {
  await api(`/api/admin/rooms/${code}`, { method: 'PATCH', body: JSON.stringify(payload) });
  showAlert(adminAlert, 'Room updated.', 'success');
  await refreshAll();
}

roomsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-room-action]');
  if (!button) return;
  const { roomAction: action, code } = button.dataset;
  const fields = roomFields(code);
  button.disabled = true;
  try {
    if (action === 'save') await patchRoom(code, fields);
    else if (action === 'approve') await patchRoom(code, { ...fields, status: 'approved' });
    else if (action === 'lock') await patchRoom(code, { isLocked: true });
    else if (action === 'unlock') await patchRoom(code, { isLocked: false });
    else if (action === 'clear-bans') await patchRoom(code, { clearBans: true });
    else if (action === 'close') { if (confirm('Close this room and remove all participants?')) await patchRoom(code, { status: 'closed' }); }
    else if (action === 'delete') {
      if (!confirm('Permanently delete this room?')) return;
      await api(`/api/admin/rooms/${code}`, { method: 'DELETE' });
      showAlert(adminAlert, 'Room deleted.', 'success');
      await refreshAll();
    }
  } catch (error) { showAlert(adminAlert, error.message); }
  finally { button.disabled = false; }
});

reportsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-report-action]');
  if (!button) return;
  const { reportAction: action, id } = button.dataset;
  const card = document.querySelector(`[data-report-card="${CSS.escape(id)}"]`);
  const status = action === 'save' ? card.querySelector('[data-report-field="status"]').value : action;
  const adminNote = card.querySelector('[data-report-field="note"]').value.trim();
  button.disabled = true;
  try {
    await api(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status, adminNote }) });
    showAlert(adminAlert, 'Safety report updated.', 'success');
    await refreshAll();
  } catch (error) { showAlert(adminAlert, error.message); }
  finally { button.disabled = false; }
});



privateSessionForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = privateSessionForm.querySelector('button[type="submit"]');
  setBusy(button, true, 'Creating…');
  try {
    const result = await api('/api/admin/private-sessions', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('private-title').value.trim(),
        capacity: Number(document.getElementById('private-capacity').value),
        expiresInHours: Number(document.getElementById('private-expiry').value)
      })
    });
    privateSessionForm.reset();
    document.getElementById('private-capacity').value = '4';
    document.getElementById('private-expiry').value = '24';
    await navigator.clipboard?.writeText(result.session.joinUrl).catch(() => {});
    showAlert(adminAlert, 'Private guest link created and copied. Share it only with intended guests.', 'success');
    await refreshAll();
  } catch (error) { showAlert(adminAlert, error.message); }
  finally { setBusy(button, false); }
});

privateSessionsList?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-private-action]');
  if (!button) return;
  const { privateAction: action, id } = button.dataset;
  const card = document.querySelector(`[data-private-card="${CSS.escape(id)}"]`);
  const link = card?.querySelector('[data-private-link]')?.value || '';
  button.disabled = true;
  try {
    if (action === 'save-visitor') {
      const row = button.closest('[data-private-visitor]');
      const visitorId = button.dataset.visitorId;
      const displayName = row.querySelector('[data-private-visitor-field="displayName"]').value.trim();
      const specialTag = row.querySelector('[data-private-visitor-field="specialTag"]').value.trim();
      await api(`/api/admin/private-sessions/${id}/visitors/${visitorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName, specialTag })
      });
      showAlert(adminAlert, 'Special guest name and tag updated live.', 'success');
      await refreshAll();
    } else if (action === 'copy') {
      await navigator.clipboard.writeText(link);
      showAlert(adminAlert, 'Private link copied. Anyone with this link can enter after giving name and phone number.', 'success');
    } else if (action === 'extend') {
      await api(`/api/admin/private-sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ expiresInHours: 24, status: 'active' }) });
      showAlert(adminAlert, 'Private link extended for 24 hours.', 'success');
      await refreshAll();
    } else if (action === 'revoke') {
      if (!confirm('Revoke this private link and disconnect current guests?')) return;
      await api(`/api/admin/private-sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'revoked' }) });
      showAlert(adminAlert, 'Private link revoked.', 'success');
      await refreshAll();
    } else if (action === 'reactivate') {
      await api(`/api/admin/private-sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active', expiresInHours: 24 }) });
      showAlert(adminAlert, 'Private link reactivated for 24 hours.', 'success');
      await refreshAll();
    } else if (action === 'delete') {
      if (!confirm('Permanently delete this private link and its guest records?')) return;
      await api(`/api/admin/private-sessions/${id}`, { method: 'DELETE' });
      showAlert(adminAlert, 'Private link deleted.', 'success');
      await refreshAll();
    }
  } catch (error) { showAlert(adminAlert, error.message); }
  finally { button.disabled = false; }
});

document.getElementById('user-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-user-filter]'); if (!button) return;
  userFilter = button.dataset.userFilter;
  document.querySelectorAll('[data-user-filter]').forEach(b => b.className = `btn ${b === button ? 'btn-primary' : 'btn-outline'} btn-small`);
  render();
});
document.getElementById('room-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-room-filter]'); if (!button) return;
  roomFilter = button.dataset.roomFilter;
  document.querySelectorAll('[data-room-filter]').forEach(b => b.className = `btn ${b === button ? 'btn-primary' : 'btn-outline'} btn-small`);
  render();
});
document.getElementById('report-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-report-filter]'); if (!button) return;
  reportFilter = button.dataset.reportFilter;
  document.querySelectorAll('[data-report-filter]').forEach(b => b.className = `btn ${b === button ? 'btn-primary' : 'btn-outline'} btn-small`);
  render();
});
document.getElementById('refresh-all').addEventListener('click', refreshAll);

let adminLiveRefreshTimer = null;
const adminLiveUpdates = createLiveUpdateStream({
  'admin-refresh': ({ reason }) => {
    clearTimeout(adminLiveRefreshTimer);
    adminLiveRefreshTimer = setTimeout(async () => {
      await refreshAll();
      const messages = {
        'member-request': 'A new member is waiting for approval.',
        'room-request': 'A new room is waiting for approval.',
        'password-reset-request': 'A member requested password help.',
        'safety-report': 'A new safety report was received.'
      };
      if (messages[reason]) showAlert(adminAlert, messages[reason], 'success');
    }, 180);
  }
});

const adminFallbackTimer = window.setInterval(() => {
  if (document.visibilityState === 'visible') refreshAll();
}, 15000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshAll();
});
window.addEventListener('beforeunload', () => {
  adminLiveUpdates?.close();
  clearTimeout(adminLiveRefreshTimer);
  clearInterval(adminFallbackTimer);
});

refreshAll();
