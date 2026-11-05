/**
 * CustomCare Embeddable Website Support Widget (`widget.js`)
 *
 * Usage:
 *   <script src="https://getcustomcare.xyz/widget.js"
 *           data-customcare-token="wgt_..."
 *           data-api-base="https://getcustomcare.xyz"
 *           async></script>
 *
 * Or programmatic initialization:
 *   window.initCustomCareWidget({
 *     publicToken: 'wgt_...',
 *     apiBaseUrl: 'https://getcustomcare.xyz',
 *     position: 'bottom-right',
 *     primaryColor: '#0d9488',
 *   });
 */
(function (window, document) {
  'use strict';

  if (window.__CUSTOMCARE_WIDGET_LOADED__) return;
  window.__CUSTOMCARE_WIDGET_LOADED__ = true;

  // Locate the script tag that loaded this file to extract data attributes
  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.querySelectorAll('script[src*="widget.js"]');
      return scripts[scripts.length - 1];
    })();

  var dataset = currentScript ? currentScript.dataset : {};
  var scriptSrc = currentScript ? currentScript.src : '';
  var inferredOrigin = (function () {
    try {
      return new URL(scriptSrc).origin;
    } catch (e) {
      return 'https://getcustomcare.xyz';
    }
  })();

  var DEFAULT_API_BASE = dataset.apiBase || inferredOrigin || 'https://getcustomcare.xyz';
  var DEFAULT_PUBLIC_TOKEN = dataset.customcareToken || dataset.token || null;
  var DEFAULT_COLOR = dataset.primaryColor || '#0d9488';
  var DEFAULT_POSITION = dataset.position || 'bottom-right';

  var SESSION_STORAGE_KEY_PREFIX = 'customcare_wgt_session_';

  function getOrCreateSessionRef(token) {
    try {
      var key = SESSION_STORAGE_KEY_PREFIX + token;
      var existing = window.localStorage.getItem(key);
      if (existing && existing.length > 5) return existing;
      var created = 'wgt_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      window.localStorage.setItem(key, created);
      return created;
    } catch (e) {
      return 'wgt_transient_' + Date.now().toString(36);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createWidgetInstance(options) {
    var publicToken = options.publicToken || DEFAULT_PUBLIC_TOKEN;
    var apiBaseUrl = (options.apiBaseUrl || DEFAULT_API_BASE).replace(/\/+$/, '');
    var primaryColor = options.primaryColor || DEFAULT_COLOR;
    var position = options.position || DEFAULT_POSITION;

    if (!publicToken) {
      console.warn(
        '[CustomCare Widget] Public widget token missing. Add data-customcare-token="wgt_..." to your <script> tag.'
      );
      return null;
    }

    var sessionRef = getOrCreateSessionRef(publicToken);
    var isOpen = false;
    var isLoading = false;
    var widgetConfig = {
      launcherTitle: 'Support Chat',
      welcomeGreeting: 'Hi! How can we help you today?',
      allowHumanEscalation: true,
      primaryColor: primaryColor,
    };
    var messages = [];
    var escalationStatus = 'normal';

    // Outer Host Container
    var host = document.createElement('div');
    host.id = 'customcare-widget-host-' + publicToken.slice(0, 8);
    host.setAttribute('aria-live', 'polite');
    host.style.cssText =
      'position: fixed; z-index: 2147483640; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; pointer-events: none;';

    if (position === 'bottom-left') {
      host.style.bottom = '20px';
      host.style.left = '20px';
    } else {
      host.style.bottom = '20px';
      host.style.right = '20px';
    }

    // Shadow Root for 100% CSS style isolation from host website styles
    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    var style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .launcher-btn {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        background: ${primaryColor};
        color: #ffffff;
        border: none;
        border-radius: 9999px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 10px 25px -5px rgba(13, 148, 136, 0.4), 0 8px 10px -6px rgba(13, 148, 136, 0.2);
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
      }
      .launcher-btn:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 14px 28px -5px rgba(13, 148, 136, 0.5);
      }
      .launcher-btn:active {
        transform: translateY(0) scale(0.98);
      }
      .launcher-icon {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .window-card {
        pointer-events: auto;
        display: none;
        flex-direction: column;
        width: 380px;
        max-width: calc(100vw - 32px);
        height: 580px;
        max-height: calc(100vh - 100px);
        background: #ffffff;
        border-radius: 20px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.18), 0 0 1px 1px rgba(15, 23, 42, 0.05);
        margin-bottom: 14px;
        overflow: hidden;
        animation: ccFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes ccFadeIn {
        from { opacity: 0; transform: translateY(12px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .window-header {
        background: #0f172a;
        color: #ffffff;
        padding: 16px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 2px solid ${primaryColor};
      }
      .header-title-box {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .brand-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25);
      }
      .brand-title {
        font-size: 14px;
        font-weight: 800;
        letter-spacing: -0.01em;
      }
      .brand-subtitle {
        font-size: 11px;
        color: #94a3b8;
        font-weight: 500;
      }
      .close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        line-height: 1;
        transition: color 0.15s;
      }
      .close-btn:hover { color: #ffffff; }
      .message-list {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #f8fafc;
      }
      .msg-bubble {
        max-width: 82%;
        padding: 11px 14px;
        border-radius: 14px;
        font-size: 13px;
        line-height: 1.5;
        word-break: break-word;
      }
      .msg-bot {
        align-self: flex-start;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        border-bottom-left-radius: 4px;
      }
      .msg-user {
        align-self: flex-end;
        background: ${primaryColor};
        color: #ffffff;
        border-bottom-right-radius: 4px;
      }
      .msg-system {
        align-self: center;
        background: #f1f5f9;
        color: #64748b;
        font-size: 11px;
        border-radius: 8px;
        padding: 6px 10px;
        text-align: center;
      }
      .input-bar {
        padding: 12px 14px;
        background: #ffffff;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 8px;
      }
      .chat-input {
        flex: 1;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        padding: 10px 14px;
        font-size: 13px;
        outline: none;
        color: #0f172a;
        transition: border-color 0.15s;
      }
      .chat-input:focus {
        border-color: ${primaryColor};
      }
      .send-btn {
        background: ${primaryColor};
        color: #ffffff;
        border: none;
        border-radius: 12px;
        padding: 0 16px;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .footer-badge {
        font-size: 10px;
        text-align: center;
        padding: 6px 12px;
        background: #ffffff;
        border-top: 1px solid #f1f5f9;
        color: #94a3b8;
        font-weight: 600;
      }
      .footer-badge a {
        color: #0f766e;
        text-decoration: none;
      }
    `;

    var container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = position === 'bottom-left' ? 'flex-start' : 'flex-end';

    // Window Card
    var card = document.createElement('div');
    card.className = 'window-card';

    // Header
    var header = document.createElement('div');
    header.className = 'window-header';
    header.innerHTML = `
      <div class="header-title-box">
        <div class="brand-dot"></div>
        <div>
          <div class="brand-title" id="cc-widget-title">Customer Support</div>
          <div class="brand-subtitle">Powered by CustomCare</div>
        </div>
      </div>
      <button type="button" class="close-btn" aria-label="Close Chat">&times;</button>
    `;

    // Messages Container
    var messageList = document.createElement('div');
    messageList.className = 'message-list';

    // Input Bar Form
    var inputBar = document.createElement('form');
    inputBar.className = 'input-bar';
    inputBar.innerHTML = `
      <input type="text" class="chat-input" placeholder="Type your message..." autocomplete="off" />
      <button type="submit" class="send-btn">Send</button>
    `;

    // Footer
    var footer = document.createElement('div');
    footer.className = 'footer-badge';
    footer.innerHTML = `Secured by <a href="${escapeHtml(apiBaseUrl)}" target="_blank" rel="noopener noreferrer">.CUSTOMCARE</a>`;

    card.appendChild(header);
    card.appendChild(messageList);
    card.appendChild(inputBar);
    card.appendChild(footer);

    // Launcher Button
    var launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'launcher-btn';
    launcher.innerHTML = `
      <span class="launcher-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </span>
      <span id="cc-launcher-text">Support</span>
    `;

    container.appendChild(card);
    container.appendChild(launcher);
    shadow.appendChild(style);
    shadow.appendChild(container);
    document.body.appendChild(host);

    var titleEl = header.querySelector('#cc-widget-title');
    var launcherTextEl = launcher.querySelector('#cc-launcher-text');
    var closeBtn = header.querySelector('.close-btn');
    var inputEl = inputBar.querySelector('.chat-input');
    var sendBtn = inputBar.querySelector('.send-btn');

    function renderMessages() {
      messageList.innerHTML = '';
      messages.forEach(function (msg) {
        var el = document.createElement('div');
        el.className = 'msg-bubble ' + (msg.type === 'user' ? 'msg-user' : msg.type === 'system' ? 'msg-system' : 'msg-bot');
        el.textContent = msg.text;
        messageList.appendChild(el);
      });
      messageList.scrollTop = messageList.scrollHeight;
    }

    function addMessage(type, text) {
      messages.push({ type: type, text: text, time: new Date() });
      renderMessages();
    }

    // Toggle Window Visibility
    function toggleOpen(openState) {
      isOpen = typeof openState === 'boolean' ? openState : !isOpen;
      card.style.display = isOpen ? 'flex' : 'none';
      if (isOpen) {
        setTimeout(function () { inputEl.focus(); }, 50);
        messageList.scrollTop = messageList.scrollHeight;
      }
    }

    launcher.addEventListener('click', function () {
      toggleOpen();
    });

    closeBtn.addEventListener('click', function () {
      toggleOpen(false);
    });

    // Load Widget Config and Previous Session Messages from Server
    async function initWidgetState() {
      try {
        var res = await fetch(
          apiBaseUrl + '/api/widget/' + encodeURIComponent(publicToken) + '?sessionRef=' + encodeURIComponent(sessionRef),
          { cache: 'no-store' }
        );
        var body = await res.json();
        if (body && body.ok && body.data) {
          if (body.data.widgetConfig) {
            widgetConfig = body.data.widgetConfig;
            if (widgetConfig.launcherTitle) {
              titleEl.textContent = widgetConfig.launcherTitle;
              launcherTextEl.textContent = widgetConfig.launcherTitle;
            }
            if (widgetConfig.primaryColor) {
              launcher.style.background = widgetConfig.primaryColor;
            }
          }

          if (body.data.conversation && body.data.conversation.messages && body.data.conversation.messages.length > 0) {
            body.data.conversation.messages.forEach(function (m) {
              addMessage(m.senderType === 'customer' ? 'user' : 'bot', m.body);
            });
          } else {
            addMessage('bot', widgetConfig.welcomeGreeting || 'Hi! How can we help you today?');
          }
        } else {
          addMessage('bot', widgetConfig.welcomeGreeting || 'Hi! How can we help you today?');
        }
      } catch (e) {
        addMessage('bot', widgetConfig.welcomeGreeting || 'Hi! How can we help you today?');
      }
    }

    // Handle Form Submit
    inputBar.addEventListener('submit', async function (e) {
      e.preventDefault();
      var text = inputEl.value.trim();
      if (!text || isLoading) return;

      inputEl.value = '';
      addMessage('user', text);
      isLoading = true;
      sendBtn.disabled = true;

      try {
        var idempotencyKey = 'idem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        var res = await fetch(apiBaseUrl + '/api/widget/' + encodeURIComponent(publicToken), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            sessionRef: sessionRef,
            idempotencyKey: idempotencyKey,
          }),
        });

        var body = await res.json();
        if (body && body.ok && body.data) {
          if (body.data.botReply) {
            addMessage('bot', body.data.botReply);
          }
          if (body.data.escalated && escalationStatus !== 'escalated') {
            escalationStatus = 'escalated';
            addMessage('system', 'Your conversation has been forwarded to our human support queue.');
          }
        } else {
          var errMsg = (body && body.error && body.error.message) || 'Unable to deliver message right now.';
          addMessage('system', errMsg);
        }
      } catch (err) {
        addMessage('system', 'Connection issue. Please verify your internet connection and try again.');
      } finally {
        isLoading = false;
        sendBtn.disabled = false;
        inputEl.focus();
      }
    });

    initWidgetState();

    return {
      open: function () { toggleOpen(true); },
      close: function () { toggleOpen(false); },
      destroy: function () {
        if (host && host.parentNode) {
          host.parentNode.removeChild(host);
        }
      },
    };
  }

  // Global programmatic API
  window.initCustomCareWidget = createWidgetInstance;
  window.createCareFlowWidget = createWidgetInstance;

  // Auto-initialize when loaded via script tag with data-customcare-token
  if (DEFAULT_PUBLIC_TOKEN) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        createWidgetInstance({
          publicToken: DEFAULT_PUBLIC_TOKEN,
          apiBaseUrl: DEFAULT_API_BASE,
          primaryColor: DEFAULT_COLOR,
          position: DEFAULT_POSITION,
        });
      });
    } else {
      createWidgetInstance({
        publicToken: DEFAULT_PUBLIC_TOKEN,
        apiBaseUrl: DEFAULT_API_BASE,
        primaryColor: DEFAULT_COLOR,
        position: DEFAULT_POSITION,
      });
    }
  }
})(window, document);
