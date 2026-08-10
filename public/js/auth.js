// Clear legacy saved room destinations so login and registration open the correct page.
try { localStorage.removeItem('uh.pendingRoom'); } catch {}

const path = window.location.pathname;
const mode = path === '/register' ? 'register'
  : path === '/forgot-password' ? 'forgot'
  : path === '/reset-password' ? 'reset'
  : 'login';

const alertBox = document.getElementById('auth-alert');
const forms = {
  login: document.getElementById('login-form'),
  register: document.getElementById('register-form'),
  forgot: document.getElementById('forgot-form'),
  reset: document.getElementById('reset-form')
};

function configurePage() {
  Object.entries(forms).forEach(([key, form]) => { if (form) form.hidden = key !== mode; });
  const memberTabs = document.getElementById('member-tabs');
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  memberTabs.hidden = !['login', 'register'].includes(mode);
  loginTab.classList.toggle('active', mode === 'login');
  registerTab.classList.toggle('active', mode === 'register');

  const content = {
    login: ['Welcome back', 'Sign in to Bolo English', 'Members and administrators use the same secure login.'],
    register: ['Start your free trial', 'Create your Bolo English account', 'Enter your details once and begin your 1-day trial immediately—no approval wait.'],
    forgot: ['Password help', 'Forgot your password?', 'Submit your username so the administrator can issue a one-time reset code.'],
    reset: ['Secure reset', 'Set a new password', 'Use the one-time code provided by the administrator.']
  }[mode];

  document.getElementById('auth-eyebrow').textContent = content[0];
  document.getElementById('auth-title').textContent = content[1];
  document.getElementById('auth-subtitle').textContent = content[2];
  document.title = `${content[1]} | Bolo English`;
  forms[mode]?.querySelector('input,select')?.focus();
}

async function submit(form, endpoint, payload, busyText) {
  clearAlert(alertBox);
  const button = form.querySelector('button[type="submit"]');
  setBusy(button, true, busyText);
  try {
    const data = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    if (data.redirect) window.location.replace(data.redirect);
    else showAlert(alertBox, data.message || 'Done.', 'success');
  } catch (error) {
    showAlert(alertBox, error.message);
  } finally {
    setBusy(button, false);
  }
}

forms.login.addEventListener('submit', (event) => {
  event.preventDefault();
  submit(forms.login, '/api/auth/login', {
    username: document.getElementById('login-username').value.trim(),
    password: document.getElementById('login-password').value
  }, 'Signing in…');
});

forms.register.addEventListener('submit', (event) => {
  event.preventDefault();
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm').value;
  if (password !== confirmPassword) return showAlert(alertBox, 'Passwords do not match.');
  if (!document.getElementById('register-consent').checked) return showAlert(alertBox, 'Please accept the community rules and trial terms.');

  submit(forms.register, '/api/auth/register', {
    fullName: document.getElementById('register-full-name').value.trim(),
    phone: document.getElementById('register-phone').value.trim(),
    email: document.getElementById('register-email').value.trim(),
    level: Number(document.getElementById('register-level').value),
    gender: document.getElementById('register-gender').value,
    username: document.getElementById('register-username').value.trim(),
    password
  }, 'Creating your account…');
});

forms.forgot.addEventListener('submit', (event) => {
  event.preventDefault();
  submit(forms.forgot, '/api/auth/forgot', {
    username: document.getElementById('forgot-username').value.trim()
  }, 'Sending request…');
});

forms.reset.addEventListener('submit', (event) => {
  event.preventDefault();
  const newPassword = document.getElementById('reset-password').value;
  const confirmPassword = document.getElementById('reset-confirm').value;
  if (newPassword !== confirmPassword) return showAlert(alertBox, 'Passwords do not match.');
  submit(forms.reset, '/api/auth/reset', {
    username: document.getElementById('reset-username').value.trim(),
    code: document.getElementById('reset-code').value.trim(),
    newPassword
  }, 'Resetting password…');
});

configurePage();

// Restore an existing saved login without showing the auth form again.
(async function redirectSignedInUser() {
  try {
    const data = await api('/api/me');
    if (!data.user) return;
    const target = data.user.role === 'admin' ? '/admin' : '/dashboard';
    window.location.replace(target);
  } catch {}
})();
