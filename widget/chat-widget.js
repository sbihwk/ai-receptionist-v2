(function() {
  'use strict';

  var WIDGET_API_URL = '';
  var sessionId = 'widget-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  var userName = '';
  var userPhone = '';
  var chatStarted = false;

  function init() {
    // Detect API URL from script tag
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.indexOf('chat-widget.js') !== -1) {
        var src = scripts[i].src;
        WIDGET_API_URL = src.substring(0, src.lastIndexOf('/'));
        WIDGET_API_URL = WIDGET_API_URL.replace('/widget', '');
        break;
      }
    }

    // Allow override via data attribute
    var scriptTag = document.querySelector('script[data-widget-url]');
    if (scriptTag) {
      WIDGET_API_URL = scriptTag.getAttribute('data-widget-url');
    }

    if (!WIDGET_API_URL) {
      WIDGET_API_URL = window.location.origin;
    }

    loadStyles();
    createWidget();
  }

  function loadStyles() {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = (WIDGET_API_URL || '') + '/chat-widget.css';
    document.head.appendChild(link);
  }

  function createWidget() {
    var container = document.createElement('div');
    container.id = 'ai-receptionist-widget';

    container.innerHTML = '' +
      '<button class="arw-toggle" id="arw-toggle" aria-label="Open chat">' +
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>' +
        '<span class="arw-badge" id="arw-badge"></span>' +
      '</button>' +
      '<div class="arw-window" id="arw-window">' +
        '<div class="arw-header">' +
          '<div class="arw-header-avatar">A</div>' +
          '<div class="arw-header-info">' +
            '<h3>Alex</h3>' +
            '<p>Virtual Assistant — Online</p>' +
          '</div>' +
          '<button class="arw-close" id="arw-close" aria-label="Close chat">' +
            '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="arw-prechat" id="arw-prechat">' +
          '<h4>Welcome! 👋</h4>' +
          '<p>Let us know who you are and we\'ll get you connected with Alex right away.</p>' +
          '<input type="text" id="arw-name-input" placeholder="Your name" />' +
          '<input type="tel" id="arw-phone-input" placeholder="Phone number" />' +
          '<button id="arw-start-btn">Start Chat</button>' +
        '</div>' +
        '<div class="arw-messages" id="arw-messages" style="display:none;">' +
        '</div>' +
        '<div class="arw-input-area" id="arw-input-area" style="display:none;">' +
          '<input type="text" id="arw-message-input" placeholder="Type your message..." />' +
          '<button class="arw-send-btn" id="arw-send-btn" aria-label="Send">' +
            '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="arw-powered">Powered by AI Receptionist</div>' +
      '</div>';

    document.body.appendChild(container);
    bindEvents();
  }

  function bindEvents() {
    var toggle = document.getElementById('arw-toggle');
    var closeBtn = document.getElementById('arw-close');
    var startBtn = document.getElementById('arw-start-btn');
    var sendBtn = document.getElementById('arw-send-btn');
    var messageInput = document.getElementById('arw-message-input');

    toggle.addEventListener('click', function() {
      var win = document.getElementById('arw-window');
      win.classList.toggle('arw-open');
      var badge = document.getElementById('arw-badge');
      badge.style.display = 'none';
    });

    closeBtn.addEventListener('click', function() {
      document.getElementById('arw-window').classList.remove('arw-open');
    });

    startBtn.addEventListener('click', function() {
      var nameVal = document.getElementById('arw-name-input').value.trim();
      var phoneVal = document.getElementById('arw-phone-input').value.trim();

      if (!nameVal) {
        document.getElementById('arw-name-input').style.borderColor = '#dc2626';
        return;
      }
      if (!phoneVal) {
        document.getElementById('arw-phone-input').style.borderColor = '#dc2626';
        return;
      }

      userName = nameVal;
      userPhone = phoneVal;
      chatStarted = true;

      document.getElementById('arw-prechat').style.display = 'none';
      document.getElementById('arw-messages').style.display = 'flex';
      document.getElementById('arw-input-area').style.display = 'flex';

      addMessage('bot', 'Hi ' + userName + '! I\'m Alex, your virtual assistant. How can I help you today?');
      document.getElementById('arw-message-input').focus();
    });

    sendBtn.addEventListener('click', sendMessage);

    messageInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }

  function sendMessage() {
    var input = document.getElementById('arw-message-input');
    var text = input.value.trim();
    if (!text) return;

    addMessage('user', text);
    input.value = '';
    showTyping(true);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', WIDGET_API_URL + '/widget-chat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onload = function() {
      showTyping(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          addMessage('bot', data.reply || 'Sorry, I didn\'t catch that. Could you try again?');
          if (data.sessionId) sessionId = data.sessionId;
        } catch (e) {
          addMessage('bot', 'Sorry, something went wrong. Please try again or call us directly!');
        }
      } else {
        addMessage('bot', 'Sorry, I\'m having trouble connecting. Please try calling us directly!');
      }
    };

    xhr.onerror = function() {
      showTyping(false);
      addMessage('bot', 'Connection error. Please try calling us for immediate assistance!');
    };

    xhr.send(JSON.stringify({
      message: text,
      sessionId: sessionId,
      userName: userName,
      userPhone: userPhone
    }));
  }

  function addMessage(type, text) {
    var messages = document.getElementById('arw-messages');
    var div = document.createElement('div');
    div.className = 'arw-message ' + (type === 'user' ? 'arw-user' : 'arw-bot');
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping(show) {
    var messages = document.getElementById('arw-messages');
    var existing = document.getElementById('arw-typing-indicator');

    if (show) {
      if (!existing) {
        var typing = document.createElement('div');
        typing.className = 'arw-typing arw-active';
        typing.id = 'arw-typing-indicator';
        typing.innerHTML = '<span class="arw-typing-dot"></span><span class="arw-typing-dot"></span><span class="arw-typing-dot"></span>';
        messages.appendChild(typing);
        messages.scrollTop = messages.scrollHeight;
      }
    } else {
      if (existing) {
        existing.remove();
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
