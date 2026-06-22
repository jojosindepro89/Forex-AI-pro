/* ForexAI Pro — App JavaScript
   Handles: Theme toggle, Mobile nav, WebSocket prices, Toasts, Auto-dismiss alerts
*/

// ── Theme Management ──────────────────────────────────────────
(function initTheme() {
  const saved = getCookie('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

document.addEventListener('DOMContentLoaded', function () {

  // ── Theme Toggle ─────────────────────────────────────────────
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      setCookie('theme', next, 365);
      showToast(`Switched to ${next} mode`, 'info');
    });
  }

  // ── Mobile Hamburger ─────────────────────────────────────────
  const hamburger = document.getElementById('nav-hamburger');
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('mobile-overlay');

  function openDrawer() {
    drawer.setAttribute('aria-hidden', 'false');
    overlay.classList.add('show');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    // Animate hamburger to X
    const spans = hamburger.querySelectorAll('span');
    if (spans[0]) spans[0].style.transform = 'translateY(7px) rotate(45deg)';
    if (spans[1]) spans[1].style.opacity = '0';
    if (spans[2]) spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
  }

  function closeDrawer() {
    drawer.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('show');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    const spans = hamburger.querySelectorAll('span');
    if (spans[0]) spans[0].style.transform = '';
    if (spans[1]) spans[1].style.opacity = '';
    if (spans[2]) spans[2].style.transform = '';
  }

  if (hamburger) hamburger.addEventListener('click', function () {
    drawer.getAttribute('aria-hidden') === 'true' ? openDrawer() : closeDrawer();
  });
  if (overlay) overlay.addEventListener('click', closeDrawer);

  // Close drawer on nav link click
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });

  // ── Avatar Dropdown ───────────────────────────────────────────
  const avatarBtn = document.getElementById('avatar-menu-btn');
  const avatarDrop = document.getElementById('avatar-dropdown');

  if (avatarBtn && avatarDrop) {
    avatarBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isOpen = !avatarDrop.hidden;
      avatarDrop.hidden = isOpen;
      avatarBtn.setAttribute('aria-expanded', String(!isOpen));
      
      // Close notifications dropdown
      const inboxDropdown = document.getElementById('notif-dropdown');
      if (inboxDropdown) inboxDropdown.style.display = 'none';
    });

    avatarBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        avatarBtn.click();
      }
    });

    document.addEventListener('click', function () {
      avatarDrop.hidden = true;
      avatarBtn.setAttribute('aria-expanded', 'false');
    });
  }

  // ── Auto-dismiss Messages ─────────────────────────────────────
  document.querySelectorAll('.alert-msg[data-auto-dismiss]').forEach(function (el) {
    const delay = parseInt(el.dataset.autoDismiss) || 4000;
    setTimeout(() => dismissAlert(el), delay);

    const closeBtn = el.querySelector('.alert-close');
    if (closeBtn) closeBtn.addEventListener('click', () => dismissAlert(el));
  });

  // ── WebSocket Live Prices ─────────────────────────────────────
  initWebSocket();

  // ── Active Nav Link Highlighting ─────────────────────────────
  highlightActiveNav();

  // ── Real-time AI Signal Alerts ────────────────────────────────
  initSignalAlerts();
});


// ── WebSocket Price Stream ────────────────────────────────────
function initWebSocket() {
  if (!window.location.pathname.includes('/dashboard')) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/prices/`;

  let ws;
  let reconnectDelay = 3000;

  function connect() {
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = function () {
        console.log('[ForexAI] WebSocket connected');
        reconnectDelay = 3000;
      };

      ws.onmessage = function (event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'price_update' && data.prices) {
            updatePriceDisplays(data.prices);
          }
        } catch (e) {
          console.warn('[ForexAI] WS message parse error:', e);
        }
      };

      ws.onerror = function (e) {
        console.warn('[ForexAI] WebSocket error — using REST API polling fallback');
      };

      ws.onclose = function () {
        console.log('[ForexAI] WebSocket closed — reconnecting in', reconnectDelay, 'ms');
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
        // Fall back to REST polling
        startRestPolling();
      };
    } catch (e) {
      startRestPolling();
    }
  }

  connect();
}


// ── REST API Price Polling (fallback) ─────────────────────────
let pollingInterval = null;

function startRestPolling() {
  if (pollingInterval) return;
  pollingInterval = setInterval(fetchPrices, 15000);
  fetchPrices(); // immediate first fetch
}

function fetchPrices() {
  fetch('/api/prices/')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.prices) updatePriceDisplays(data.prices);
    })
    .catch(() => {});
}

function updatePriceDisplays(prices) {
  for (const [pair, price] of Object.entries(prices)) {
    const slug = pair.replace('/', '-').toLowerCase();
    const el = document.getElementById('price-' + slug);
    if (el) {
      const decimals = pair.includes('JPY') ? 3 : (pair.includes('XAU') ? 2 : 5);
      const newVal = parseFloat(price).toFixed(decimals);
      if (el.textContent !== newVal) {
        el.textContent = newVal;
        el.classList.add('price-flash');
        setTimeout(() => el.classList.remove('price-flash'), 600);
      }
    }
  }
}


// ── Toast Notifications ───────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3500);
}

// Make globally available
window.showToast = showToast;


// ── Alert Dismiss ─────────────────────────────────────────────
function dismissAlert(el) {
  el.style.opacity = '0';
  el.style.transform = 'translateX(20px)';
  el.style.transition = 'all 0.25s ease-out';
  setTimeout(() => el.remove(), 260);
}


// ── Active Nav Highlighting ───────────────────────────────────
function highlightActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href !== '/' && path.startsWith(href)) {
      link.classList.add('active');
    }
  });
}


// ── Cookie Utilities ──────────────────────────────────────────
function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function getCookie(name) {
  return document.cookie.split('; ').reduce((acc, c) => {
    const [k, v] = c.split('=');
    return k === name ? decodeURIComponent(v) : acc;
  }, '');
}


// ── Real-time AI Signal Alerts & Voice Notifications ──────────
function initSignalAlerts() {
  const toggleBtn = document.getElementById('alert-toggle');
  if (!toggleBtn) return;

  let voiceAlertsActive = localStorage.getItem('voice_alerts_active') === 'true';
  updateAlertToggleUI(voiceAlertsActive);

  // ── Notification Inbox Setup ─────────────────────────────
  const inboxBtn = document.getElementById('notif-inbox-btn');
  const inboxDropdown = document.getElementById('notif-dropdown');
  const inboxListContainer = document.getElementById('notif-list-container');
  const clearBtn = document.getElementById('clear-notifs-btn');
  const notifBadge = document.getElementById('notif-badge');

  let unreadCount = parseInt(localStorage.getItem('unread_notifs_count') || '0');
  updateNotifBadge();
  renderNotifLogs();

  if (inboxBtn && inboxDropdown) {
    inboxBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isVisible = inboxDropdown.style.display === 'block';

      // Close avatar dropdown if open
      const avatarDrop = document.getElementById('avatar-dropdown');
      if (avatarDrop) {
        avatarDrop.hidden = true;
        const avatarMenuBtn = document.getElementById('avatar-menu-btn');
        if (avatarMenuBtn) avatarMenuBtn.setAttribute('aria-expanded', 'false');
      }

      if (isVisible) {
        inboxDropdown.style.display = 'none';
      } else {
        inboxDropdown.style.display = 'block';
        // Mark as read
        unreadCount = 0;
        localStorage.setItem('unread_notifs_count', '0');
        updateNotifBadge();
      }
    });

    document.addEventListener('click', function (e) {
      if (!inboxDropdown.contains(e.target) && e.target !== inboxBtn) {
        inboxDropdown.style.display = 'none';
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      localStorage.setItem('signal_notification_logs', '[]');
      renderNotifLogs();
    });
  }

  function addNotifLog(symbol, alertData, currentSignal) {
    let logs = JSON.parse(localStorage.getItem('signal_notification_logs') || '[]');
    const newLog = {
      id: Date.now(),
      symbol: symbol,
      message: alertData.body,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type: currentSignal
    };
    logs.unshift(newLog);
    if (logs.length > 20) logs.pop();
    localStorage.setItem('signal_notification_logs', JSON.stringify(logs));

    if (inboxDropdown.style.display !== 'block') {
      unreadCount++;
      localStorage.setItem('unread_notifs_count', unreadCount.toString());
      updateNotifBadge();
    }
    renderNotifLogs();
  }

  function updateNotifBadge() {
    if (notifBadge) {
      if (unreadCount > 0) {
        notifBadge.textContent = unreadCount;
        notifBadge.style.display = 'flex';
      } else {
        notifBadge.style.display = 'none';
      }
    }
  }

  function renderNotifLogs() {
    if (!inboxListContainer) return;
    const logs = JSON.parse(localStorage.getItem('signal_notification_logs') || '[]');
    if (logs.length === 0) {
      inboxListContainer.innerHTML = `
        <div class="notif-empty-state" style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
          No recent signal alerts.
        </div>`;
      return;
    }

    inboxListContainer.innerHTML = '';
    logs.forEach(log => {
      const item = document.createElement('div');
      item.style.padding = '10px 16px';
      item.style.borderBottom = '1px solid var(--bg-border)';
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.gap = '4px';
      item.style.transition = 'background var(--dur-fast)';
      item.style.cursor = 'pointer';

      item.addEventListener('mouseenter', () => item.style.backgroundColor = 'var(--bg-elevated)');
      item.addEventListener('mouseleave', () => item.style.backgroundColor = 'transparent');

      let badgeColor = 'var(--text-muted)';
      if (log.type === 'BUY') badgeColor = 'var(--signal-buy)';
      if (log.type === 'SELL') badgeColor = 'var(--signal-sell)';

      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700; font-family: var(--font-mono); font-size: 12px; color: var(--text-primary); border-left: 3px solid ${badgeColor}; padding-left: 6px;">${log.symbol}</span>
          <span style="font-size: 9px; color: var(--text-muted);">${log.time}</span>
        </div>
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; padding-left: 9px;">
          ${log.message}
        </div>
      `;
      inboxListContainer.appendChild(item);
    });
  }

  toggleBtn.addEventListener('click', function () {
    voiceAlertsActive = !voiceAlertsActive;
    localStorage.setItem('voice_alerts_active', voiceAlertsActive ? 'true' : 'false');
    updateAlertToggleUI(voiceAlertsActive);

    if (voiceAlertsActive) {
      showToast('Voice alerts enabled', 'success');
      playChime();
      setTimeout(() => {
        speakText('Voice alerts activated');
      }, 400);

      // Request system notification permission if needed
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } else {
      showToast('Voice alerts disabled', 'info');
      // Cancel any ongoing speech
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  });

  // Start polling signals every 10 seconds
  let isFirstLoad = true;
  let prevSignals = {};

  function pollSignals() {
    fetch('/api/signals/')
      .then(res => {
        if (!res.ok) throw new Error('Signals fetch failed');
        return res.json();
      })
      .then(data => {
        if (data && data.signals && Array.isArray(data.signals)) {
          data.signals.forEach(sig => {
            const symbol = sig.symbol;
            const currentSignal = sig.signal_type;

            if (isFirstLoad) {
              prevSignals[symbol] = currentSignal;
            } else {
              const oldSignal = prevSignals[symbol];
              if (oldSignal !== undefined && oldSignal !== currentSignal) {
                handleSignalChange(symbol, oldSignal, currentSignal);
                prevSignals[symbol] = currentSignal;
              }
            }
          });
          isFirstLoad = false;
        }
      })
      .catch(err => {
        console.warn('[ForexAI] Signal polling error:', err);
      });
  }

  function handleSignalChange(symbol, oldSignal, currentSignal) {
    const alertData = getAlertMessage(symbol, oldSignal, currentSignal);
    if (!alertData) return;

    // Show visual warning toast with the action instruction
    showToast(alertData.body, 'warning');

    // Add to session log list
    addNotifLog(symbol, alertData, currentSignal);

    // Show desktop system notification popup if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(alertData.title, {
          body: alertData.body,
          tag: `signal-${symbol}`,
          renotify: true
        });
      } catch (e) {
        console.warn('[ForexAI] System notification error:', e);
      }
    }

    if (localStorage.getItem('voice_alerts_active') === 'true') {
      playChime();
      setTimeout(() => {
        speakText(alertData.speech);
      }, 600);
    }
  }

  function getAlertMessage(symbol, oldSignal, currentSignal) {
    if (oldSignal === 'HOLD' && currentSignal === 'BUY') {
      return {
        title: `${symbol} Entry Alert`,
        body: `Enter BUY position for ${symbol}`,
        speech: `Enter BUY position for ${formatSymbolForSpeech(symbol)}`
      };
    }
    if (oldSignal === 'HOLD' && currentSignal === 'SELL') {
      return {
        title: `${symbol} Entry Alert`,
        body: `Enter SELL position for ${symbol}`,
        speech: `Enter SELL position for ${formatSymbolForSpeech(symbol)}`
      };
    }
    if (oldSignal === 'BUY' && currentSignal === 'HOLD') {
      return {
        title: `${symbol} Exit Alert`,
        body: `Exit BUY position for ${symbol}`,
        speech: `Exit BUY position for ${formatSymbolForSpeech(symbol)}`
      };
    }
    if (oldSignal === 'SELL' && currentSignal === 'HOLD') {
      return {
        title: `${symbol} Exit Alert`,
        body: `Exit SELL position for ${symbol}`,
        speech: `Exit SELL position for ${formatSymbolForSpeech(symbol)}`
      };
    }
    if (oldSignal === 'BUY' && currentSignal === 'SELL') {
      return {
        title: `${symbol} Reversal Alert`,
        body: `Exit BUY and Enter SELL position for ${symbol}`,
        speech: `Exit BUY and Enter SELL position for ${formatSymbolForSpeech(symbol)}`
      };
    }
    if (oldSignal === 'SELL' && currentSignal === 'BUY') {
      return {
        title: `${symbol} Reversal Alert`,
        body: `Exit SELL and Enter BUY position for ${symbol}`,
        speech: `Exit SELL and Enter BUY position for ${formatSymbolForSpeech(symbol)}`
      };
    }
    return null;
  }

  function formatSymbolForSpeech(symbol) {
    const parts = symbol.split('/');
    if (parts.length === 2) {
      return `${parts[0].split('').join(' ')} to ${parts[1].split('').join(' ')}`;
    }
    return symbol.split('').join(' ');
  }

  function playChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 arpeggio
      const duration = 0.6;
      const now = ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        const startTime = now + (idx * 0.08);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);
      });
    } catch (e) {
      console.warn('[ForexAI] Web Audio chime failed:', e);
    }
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
    window.speechSynthesis.speak(utterance);
  }

  function updateAlertToggleUI(active) {
    const bellOn = toggleBtn.querySelector('.icon-bell');
    const bellOff = toggleBtn.querySelector('.icon-bell-off');
    if (active) {
      if (bellOn) bellOn.style.display = 'block';
      if (bellOff) bellOff.style.display = 'none';
      toggleBtn.style.color = 'var(--accent-primary, #00f5a0)';
    } else {
      if (bellOn) bellOn.style.display = 'none';
      if (bellOff) bellOff.style.display = 'block';
      toggleBtn.style.color = 'var(--text-secondary)';
    }
  }

  // Initial fetch and set interval
  pollSignals();
  setInterval(pollSignals, 10000);
}

// ── Global Audio & Speech Synthesis Unlocker for Reload Resilience ────
(function initAudioUnlocker() {
  function unlock() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
      }
    } catch (e) {}

    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {}

    document.removeEventListener('click', unlock);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('touchstart', unlock);
  }

  document.addEventListener('click', unlock);
  document.addEventListener('keydown', unlock);
  document.addEventListener('touchstart', unlock);
})();
