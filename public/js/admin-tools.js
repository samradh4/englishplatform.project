'use strict';

(() => {
  const exportButton = document.getElementById('download-users-excel');
  const activityList = document.getElementById('admin-join-activity');
  const activityCount = document.getElementById('admin-join-activity-count');
  if (!exportButton || !activityList) return;

  const activityKey = 'bolo.admin.join.activity.v1';
  const seenPrivateGuests = new Set();
  let activity = [];
  let privatePollTimer = null;

  function xmlEscape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function safeDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function loadActivity() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(activityKey) || '[]');
      activity = Array.isArray(stored) ? stored.slice(0, 30) : [];
    } catch {
      activity = [];
    }
  }

  function saveActivity() {
    try { sessionStorage.setItem(activityKey, JSON.stringify(activity.slice(0, 30))); }
    catch {}
  }

  function renderActivity() {
    if (activityCount) activityCount.textContent = String(activity.length);
    if (!activity.length) {
      activityList.innerHTML = '<div class="empty-state">No join activity yet. New member and private-session joins will appear here.</div>';
      return;
    }
    activityList.innerHTML = activity.map((item) => `
      <article class="admin-item admin-activity-item">
        <div class="admin-activity-icon">${item.type === 'private' ? '🔒' : '👋'}</div>
        <div class="admin-activity-copy">
          <strong>${escapeHtml(item.text)}</strong>
          <small>${escapeHtml(safeDate(item.at))}</small>
        </div>
      </article>`).join('');
  }

  function addActivity(text, type = 'member', at = new Date().toISOString(), id = '') {
    const key = id || `${type}:${text}:${at}`;
    if (activity.some((item) => item.key === key)) return;
    activity.unshift({ key, text, type, at });
    activity = activity.slice(0, 30);
    saveActivity();
    renderActivity();
  }

  async function seedRecentMembers() {
    try {
      const data = await api('/api/admin/users?status=all');
      const recent = [...(data.users || [])]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .reverse();
      for (const user of recent) {
        const name = user.fullName || user.displayName || user.username || 'New member';
        addActivity(`${name} joined Bolo English`, 'member', user.createdAt, `member:${user.id}`);
      }
    } catch {}
  }

  async function pollPrivateGuestJoins(firstRun = false) {
    if (document.visibilityState !== 'visible') return;
    try {
      const data = await api('/api/admin/private-sessions');
      for (const session of data.sessions || []) {
        for (const visitor of session.recentVisitors || []) {
          const key = `${session.id}:${visitor.id}`;
          if (seenPrivateGuests.has(key)) continue;
          seenPrivateGuests.add(key);
          if (!firstRun && visitor.role !== 'admin') {
            const name = visitor.displayName || visitor.name || 'Guest';
            addActivity(`${name} joined private session “${session.title}”`, 'private', visitor.joinedAt, `private:${key}`);
          }
        }
      }
    } catch {}
  }

  function startJoinEvents() {
    const source = new EventSource('/api/events');
    source.addEventListener('admin-refresh', async (event) => {
      let payload = {};
      try { payload = JSON.parse(event.data || '{}'); } catch {}
      if (payload.reason !== 'new-trial-member' || !payload.userId) return;
      try {
        const data = await api('/api/admin/users?status=all');
        const user = (data.users || []).find((entry) => entry.id === payload.userId);
        if (!user) return;
        const name = user.fullName || user.displayName || user.username || 'New member';
        addActivity(`${name} joined Bolo English`, 'member', payload.createdAt || user.createdAt, `member:${user.id}`);
        showAlert(adminAlert, `${name} joined Bolo English.`, 'success');
      } catch {}
    });
    window.addEventListener('beforeunload', () => source.close(), { once: true });
  }

  // ---------------------------
  // Minimal real XLSX generator
  // ---------------------------
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255]);
  }

  function u32(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
  }

  function concatBytes(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      const crc = crc32(data);
      const local = concatBytes([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
      ]);
      locals.push(local);

      const central = concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), name
      ]);
      centrals.push(central);
      offset += local.length;
    }

    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = concatBytes([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralSize), u32(offset), u16(0)
    ]);
    return concatBytes([...locals, ...centrals, end]);
  }

  function columnName(index) {
    let n = index + 1;
    let result = '';
    while (n > 0) {
      const remainder = (n - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }

  function buildSheetXml(rows) {
    const body = rows.map((row, rowIndex) => {
      const cells = row.map((value, colIndex) => {
        const ref = `${columnName(colIndex)}${rowIndex + 1}`;
        return `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
      }).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');
    const lastCol = columnName((rows[0]?.length || 1) - 1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${Math.max(1, rows.length)}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${(rows[0] || []).map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="18" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${lastCol}${Math.max(1, rows.length)}"/></worksheet>`;
  }

  function buildXlsx(rows) {
    const sheet = buildSheetXml(rows);
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Bolo English Users" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
      { name: 'xl/worksheets/sheet1.xml', data: sheet }
    ];
    return zipStore(files);
  }

  async function downloadUsersExcel() {
    exportButton.disabled = true;
    const originalText = exportButton.textContent;
    exportButton.textContent = 'Preparing Excel…';
    try {
      const data = await api('/api/admin/users?status=all');
      const list = data.users || [];
      const headers = [
        'Full Name', 'Username', 'Display Name', 'Email', 'Phone', 'Gender', 'English Level',
        'Account Status', 'Membership Plan', 'Membership Status', 'Membership Starts',
        'Membership Expires', 'Days Remaining', 'Special Tag', 'Joined At'
      ];
      const rows = [headers, ...list.map((user) => [
        user.fullName || '',
        user.username || '',
        user.displayName || '',
        user.email || '',
        user.phone || '',
        user.gender || '',
        user.level ? `Level ${user.level}` : '',
        user.status || '',
        user.membership?.planLabel || '',
        user.membership?.status || '',
        user.membership?.startsAt || '',
        user.membership?.expiresAt || '',
        user.membership?.daysRemaining ?? '',
        user.specialTag || '',
        user.createdAt || ''
      ])];

      const bytes = buildXlsx(rows);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `bolo-english-users-${date}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showAlert(adminAlert, `Downloaded ${list.length} member record(s) as Excel.`, 'success');
    } catch (error) {
      showAlert(adminAlert, error.message || 'Could not create the Excel file.');
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = originalText;
    }
  }

  exportButton.addEventListener('click', downloadUsersExcel);

  document.getElementById('clear-admin-join-activity')?.addEventListener('click', () => {
    activity = [];
    saveActivity();
    renderActivity();
  });

  loadActivity();
  renderActivity();
  seedRecentMembers();
  pollPrivateGuestJoins(true).finally(() => {
    privatePollTimer = window.setInterval(() => pollPrivateGuestJoins(false), 5000);
  });
  startJoinEvents();

  window.addEventListener('beforeunload', () => {
    if (privatePollTimer) clearInterval(privatePollTimer);
  });
})();
