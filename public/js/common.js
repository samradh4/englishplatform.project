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
      padding: 0 16px 0 10px;
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
    .bolo-whatsapp-support .bolo-wa-icon {
      width: 30px;
      height: 30px;
      flex: 0 0 30px;
      display: block;
      object-fit: contain;
      border-radius: 50%;
    }
    .room-body .bolo-whatsapp-support,
    .private-guest-body .bolo-whatsapp-support {
      bottom: calc(max(18px, env(safe-area-inset-bottom)) + 82px);
    }
    @media (max-width: 640px) {
      .bolo-whatsapp-support {
        right: max(10px, env(safe-area-inset-right));
        min-height: 44px;
        padding: 0 12px 0 8px;
        font-size: 13px;
      }
      .bolo-whatsapp-support .bolo-wa-icon {
        width: 28px;
        height: 28px;
        flex-basis: 28px;
      }
      .room-body .bolo-whatsapp-support,
      .private-guest-body .bolo-whatsapp-support {
        bottom: calc(max(12px, env(safe-area-inset-bottom)) + 76px);
      }
    }
  `;
  document.head.appendChild(style);

  const whatsappLogo = 'data:image/webp;base64,UklGRjQRAABXRUJQVlA4WAoAAAAQAAAAXwAAXwAAQUxQSOYFAAABCYVt2zZQ3XQ6/x/ccUNE/yeA087WWgPZhtZbY0oSUFeLFyPCP/4oxeW85Yfnh+YMv6TwCZlSYgAfDAVt2zAJf9r7IxAREwDYpFQkVvxMaVFx20jK7PVfM8PiwTNiAibAs23bqhtb29b7mKAlsx0csZmZGVInu9PnAs7dnew5SWZm5mB2gC0pRGuOnrFkSWsdSEbEBCB8Y4LgEQLUMjzSQBKA4JIIgu1AmoUYg5EUCACUajMQZONICzF1cggKqao6main49G4IOdkghpGs5i7OebNc08+eXa3G+AQ4ZPB/vXpaGo5UU2imeWMsvXcG8+tgz+9+bff/v7K4SRAagZpIXeKPfPJKwKArCBAZoJAA3Dwh+//chLMJWnlyJA7Ht7+0kkAhWRCgCkBBlzNBwOiuK8Yaami3vqiAgotYNESuf047vRRakErZamaPPHlk0CxiOVKXDt1eGPqckGrQoYc8MXngFvA0glxM17e78iFlbFkZ74ClGBYSULcunk9qrhWxII98SKcEStLMZ+96KzdV4G0eOE0RKy0hAvbIRq4NAK0Ex0QKy9srxuxdBrELpxoIFElAlwOGeQOobEOJ6hlhKr00OTpUInEwknL4bbYJPR6lWGJFuN6n2iycLtXcQnM/g7VKBDbwyxpIQRT/cTJAnwLL+YcDAs2hJfhDZ6eKtm4oNR/3uBfJ9cUAAqI484Jpz/gyVGExKJk958j4Z+qumMTCM96tuZtAOB8D8ULVsHNx0m0IZXZgwPXcDBYVzsAPLWvmkPGzffQlkTV65VjkLG8JoWWgNi55ZDmATI/QLG2ILevjQLmZ9p+GkRreri3nyXNQdOzDmsP0S8nzB+HL6GE9gCrfxCaQ0iHT6NNyc4/6yDNAsLhLtgicF4bBpdm0HQS7QKc7+ZAzHMasnY5uZajcQ6cgNgmxM56CsTRhGm3ZYC19RDIo0DaOto2d0MgZpNVyxAxG+cgGFsGsGRGzgCI9iXml7eOfC4B45YRylSCZkB61DLAdCwXZkrqgS0zGpY5BOf9lhH6j0pxHQU590u7AA+G01qY6wHULndGkzLfwxvtQtwYjYtrBhj0j1aRTfbXO4GYSVn4M6xFgNtYSzYHwM5fe1R7iBd3qkDMq3TtL2gR4q+P5fkoO/wp2lO2f3AucC5A018cmlqDfzqxbsegjy7+DN4WVv/hWRjmpwaDb7i1hNs/cBY8BjQc/ea39FYgTtUg+NP+w6+BrSBuDwIWWD8a/+ZX9BYgdgfFJV6Zjvq/RBuK6RBlEfIyeRxqHrF5txQX+CSqF8HGUbl/WOqykGiPPwFrHKCbZVIcx6fl8FpyNJ04e3k4nrp0PFhIL0BsmjbOVN1OILEI2zsBQ7OpeCJXORqxQMbyrNQ0YCPlFAyLjXgFpVkCUowhGLmY0H0KRKMJB81ILJY4222W0x85SGKxRPQX4KFBbsMH0+LCosDMlyE2RsTlu5NpkYSFp63zII4rcDWkUH7w3eQHtROLpunJGjaXBCPgtjwp8NLXr3QH/SJi8Wn0EnyWBCOh+/0nApxcikDuf/vnsINxEZaR+y9ABCCIRuDh9YtXPdcfvNGBRC5GkAF3f/SjXh706yIs1UYnYIJoIPo3Ll3s55Ondzq3/jB87+3TBBwE5xJEAvXFX//iII0Ox0VYLsfRixmI4a3L/34Qd8+cWA9wRd74050zbz5/0gBAmkECwOTG3//0732bHI7qQnAp4t3HQUzuXPn3XW6fObmRAIsxoNTQwcWLvY1nnjqz0yVnoAzu37x86cb9fv+gN6yLQCzXcf31f/39xgNunT61lQkLKcVgBtWTcYEf3L65P7Luzla3E1SPB72HDx/2hsNhvz8Y1u7EsglVX/VUaTIcDBlSTDGYJIBkiClVVbfKOcUYgkFeSj2dZoApp+SglgZgemer0nQ8mUxjDMGIOUmzEGNMKaYQjMBRIaYYYyBW04sCUUopbiSOTZJ2JElALne3YEZiZb0QcAnCogkSBAFAgkSstgQI/58HVlA4ICgLAAAQMgCdASpgAGAAPjEUiEKiISEXGQcwIAMEtABoCw4/VdWb655vlbfo/4M5mM7XXH+w+6r3q+oD7gPcA/Uj9WesR5gP1d/Yf0QPc5/jPUA/r3+v6wD0AP2W9Mz9vPhG/cv0p804/o/az/eO4b9P/evy45kHOvif+yX5rhd4AX4//OP8D4ae0dst6AXsB8+/w/3E+jV/VeiniAfqB/gOOg8d9gP+L/1D/Lf3f8lPpb/jP+//kv8l6Vvzb+7/9H/M/AJ/If6B/mv7D/kf+7/hv///+PJH6Jn6mO2hyXu/m9Iutuq7P+WSnnYZqnkpzlXW6VoIe9P5tFaXuRxQt16Y/LwTomqd+uo31+FoR8s8Ej1jigNBkDy1DZeDukExLnx9WYhmWlxzGpTokrpZB4cpsfxGP9/AnG5/azoO+bEVkfRwyBU9cnOJq3okDV5VNFedo8I1Mvny8aGzt7+9tJG36N+dZvvgjdDspyhgE6zLDAoluiqGXdp3PzlijXOGOHsN0/1EdBbGZN8XQI5JfacZM9mFeo3vCe/+gRHAAP7/j8EPOqZjlWV/5Q6Gm+9Cx//CtQrv4jo8UL62ppJGGXOympK+vTk6l0xnMkrt7Wh56ENB5fkyW4cPRI+k+sevg6wE9tb++q+zLRBSboVwbBUdLuNX20BZLgg/FNsWZq33+rB2lojqGl7TWVFRdOfPAg7b3vdMSvXu8Z18tulqivrxmidQrAIIQip7LVL5TBV/YxMrRWKYr61MYolxwXNMfQKwEdd+XIZGD3sXj0nkaoI03y/AG9nT2Jgqr5LUFx119rwrQyZ+1M6H2CIBe+nobI0+Hw4ZXSlZu2PQ2R93y8Q0ZcelsYWRZ8hSRSyPq/hYQXBMviv7x/4byFoeMr1pqaIfqwwsVjzFnwl/9a49Lzx6pAC/WQD357r64z7XsoTiDUZskgaU3YprXcTBmGASkqM2JZIUb9caRl9FpfaT+J0wZ/pFSgSME4gJB/23rC3YD64BnXXl33VSBEm7Uc0GD/8R0Pq6bHNuUgMFod8yN4ldwzUfcxKhDXmffaEnMRdF74z/qMDVCsMv+lzndRX+rLGjO2/f4ILVT5huFDez/7/xMdqgZA3Yl5Dokk54hFNmLdoLpkXK7YXPOLxpE+rcEI+ZdpBdzLwOqtZIntMl6vkAEH7+GgXxqD54r2fSOki0t8oOoC4hlDor/7DTZ/emv0nocbdR9Wl3LRQXnATf5idrEWzk9EL5jCoff0iWn35BxeGOWjicgr8vDEU/nNjq/nOawGE7UP3A7weuqn24lVyEIzMEmvgsaSZREx72vrFn45CnBcoORHCKwZWrnBotkDa/9WXzYCV3InumAOQkzdGNBPVqM3U1q032iwLHuanSuyK0Ea1q0tnd0GhkktY6yhpFwpb2hIWxwSo7El3G8bAfr8iF7+rd7f/6IdzmHNwIu9/1G+M8Z9shM7rop/9mw1Km5ZtXgIICcsozTVd8r03cab3epjHea30YK3unHq/jxym39pjt/6PtV0DmgKMYdZf0Oq89qCa+mYqXYvySvMnhVPNHSwWxdoCTycRzCJ8JTEf5NtE0v4joI5IM6H3xF75QbsCxYq2zLV/WA+WUvfpVP0tc5yZVEGUMfB49iv/5oJNUGVNdzDD4kvTtARIOrqKtuEVm5jjyOWETi5z8klpQ4C4S0bZCbtINB+Uff1GHneSxfBCyg+oXzWZGTnkigreWkZoiadB8+dn2jbcGHB/4ib3X+V2wdX4tTwUiryx1f0i6iX/9mHROqguUqSfrf1Iq+W+W8zBl/9NPxwCMn0hGsPp3XDe3j7o7DMCN50t1zA/jPN6SKLTgUOFKS2tNKk5f0+NfqCOBq4VszxNbNivw7GpNar0CNzRfY3KygsodTg/Bt1YvDKgM6lUbHBX+BdVNXVJDX42McZFfl4Wm2MRo4kpIJV1Ce6eIW5G2CzRIJg8Cu6sVAF1DfDLT6DzlVDgaxh6NH1Jq8k2l9Jo+6fPGMxm9aO7oZzkcNzRr8mrtgxsWXHsdl/7vPLVD3Gi2PUH/f5EVUUteO5FsclkWdZ7SZyQZNn10OfyFvoAOF3NjhiGxFSDN+bYVxd5q+IN594oAAOMuMPi1G9LZwiB1eOJblydDZrXrJ+R5ja94sWdG1Eiv6xIuE9ARzzlR7p+zfspbIuwPEOYNImx2BTScQl8gIWQ0moERkNe06QX8XtsPrVN5R74rSmpf7D6A8lURITXMIGltLOJVg8c1y8EcYcvEX1/6WH69CZcXQgqcQ8ZOrDouVpf5NLCWBFNNrgwGDJ5LGCWR/aKJUnRyuOzVLVBfcEYEhi0Qa7vNmkqsd5UlNiB7ctKCm6S0c9x26ZuF+jvAvM153MLG558N/iXbcKBpfEo6Wx4LYhRCPgTIs7HLLcmSNSI9lfxCi3DwpLVugZxFDqMkFkOISscn+98fwM8/M465XPOudoG2hSHWHQtUkZkY+Dm4VyLh6Hwqup7jEbzkq62a5w5PcflxNfg7dtp1zWS3UJ7y2p8wqWgKpMCKYdMRpnwshnJ/eAyQrRB59vEK88UazE7dsv6HYacKTGhgoj51UFrE7da8Aa73zYgBUrfzsKnK7+xi5bw2/wnJidTCTUAm2r0NJovFeH49mvXS6V+JqGU//fsFMiTxPvK6KRWJWqaUvbsJoUZdeB+7/1+SdiuuOFhaYqy97WigfJKq/3bzLSxcFuHQepoYwy4bXCWi707fkDswoZkS+KeMu4UMMYwYnQP51Y+y8PmIWLlvtyKfXHzmRT3p2pEDY6kz8bVs8fQr//s8RYlJxd1ykSYvegBGRdE58DUEKgZiT3xHsGgdz47a2378VW7bQ2BFrByF9AU+NjLVOJA5UwB5f1F/g+kGOOtZrRaRZ7VxPfHBXjfeGcKVs/uVu0VHOrylvLg/iy8jXvyy5ue4SJS6b60rLr95cUXZdI0d9vKcgS0rlp/UkV5gRaj+rUAH+hBm+QPCemyPZu/X8S0W3aqixbXZhePC0eZYg1GbFFVcnrwoSQnwy6x8UJI0rtf0CDe9o8oklMqGD3RQpnV1ECjifDWtJocx3x2VtjZ/W13SBwPsDUa65kTqrUez+nn6EYl+H/1SNGxAOjZ3Oz9Q6TEXW9QYUpxgu0aca/TOJkizQvkPo+L/YmXOgcfFLQACIsjWGdgAMJRGy6PQPw6/lxoPgsv/AZ8mkoZ9+mPYv4665xMd0PEp7L/6ly3Gq5jnBJy8eBGkVvdPTHTLdFQnJxJ9+wKt80j25TFqBagEGGMO3tGJ5YUUqBuou4sn/uodk/4xebQAD1iGUEamqNGlCXOMxGwAxJgS8WmLZQTVWbVhmKpIY24yaQdi0REFfxnlT7UaOqb9Cr39UlgsoYKACeOdU7czgFpHnNeLI9GC/RddUD6g18kfM2l6vUkxnL92Gfw7Tu7KTFUlVrFJVWCkxcG59rEPeuLr3B/A1l1+LWjx1sDg/RLYtuq6rCI8Zti5Xxv0mOiZaWA4A873MM32JpP8TMRUlXrndViGxs5pH1PzA1eiIDloQIYt7HH5ICWD85zBz+h9cw6mmsIfKSb42zewpbU9CAEc5MiKycpan6B1Mqrf8/LzNIUdxiuSmmJrItAU0ve/wvKG8pPYZC/Z4PrmQzst+Iu1EG0kr1QIG/ILbRffjoQ8w8+3fwZYoFysvmHuetngcVDU2YxyuKpRdFlkQYAW9cZQdF/w7oRdNkBGvV1Li+YtLcqct8LGL3/xwU4HoR88aaiEJ3+5sAZ3X3wLvab/cYUNrG67U8pGBDAPhgP/RuwEAlH/bKeLAAA=';

  const link = document.createElement('a');
  link.id = 'bolo-whatsapp-support';
  link.className = 'bolo-whatsapp-support';
  link.href = 'https://wa.me/918808394539?text=Hi%20Bolo%20English%2C%20I%20need%20help.';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'Chat with Bolo English on WhatsApp at +91 88083 94539');
  link.innerHTML = `<img class="bolo-wa-icon" src="${whatsappLogo}" alt="" aria-hidden="true"><span>WhatsApp</span>`;
  document.body.appendChild(link);
}

installWhatsAppSupport();
