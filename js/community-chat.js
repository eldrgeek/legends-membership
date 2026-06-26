(function (global) {
  'use strict';

  var state = {
    session: null,
    client: null,
    channel: null,
    messages: [],
    ready: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message, type) {
    var el = byId('chat-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'community-status' + (type ? ' ' + type : '');
  }

  function formatTime(value) {
    try {
      return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
    } catch (e) {
      return '';
    }
  }

  function displayName(email) {
    if (!email) return 'Member';
    return email.split('@')[0].replace(/[._-]+/g, ' ');
  }

  function renderMessages() {
    var list = byId('chat-messages');
    if (!list) return;
    if (!state.messages.length) {
      list.innerHTML = '<div class="empty-state">No messages yet. Start the conversation.</div>';
      return;
    }

    list.innerHTML = state.messages.map(function (message) {
      var own = state.session && state.session.user && message.user_id === state.session.user.id;
      var body = String(message.body || '').replace(/[&<>"']/g, function (ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
      return [
        '<article class="chat-message' + (own ? ' own' : '') + '">',
        '  <div class="chat-message-meta">',
        '    <span>' + displayName(message.user_email) + '</span>',
        '    <time>' + formatTime(message.created_at) + '</time>',
        '  </div>',
        '  <p>' + body + '</p>',
        '</article>'
      ].join('');
    }).join('');
    list.scrollTop = list.scrollHeight;
  }

  async function loadMessages() {
    var result = await state.client
      .from('community_messages')
      .select('id,user_id,user_email,body,room,created_at')
      .eq('room', 'general')
      .order('created_at', { ascending: true })
      .limit(80);

    if (result.error) throw result.error;
    state.messages = result.data || [];
    renderMessages();
  }

  function subscribe() {
    if (state.channel) state.client.removeChannel(state.channel);
    state.channel = state.client
      .channel('community-chat-general')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'community_messages',
        filter: 'room=eq.general'
      }, function (payload) {
        state.messages.push(payload.new);
        renderMessages();
      })
      .subscribe();
  }

  async function sendMessage(event) {
    event.preventDefault();
    var input = byId('chat-body');
    var button = byId('chat-send');
    var body = input ? input.value.trim() : '';
    if (!body) return;
    if (body.length > 2000) {
      setStatus('Please keep messages under 2,000 characters.', 'error');
      return;
    }

    if (button) button.disabled = true;
    setStatus('Sending...', '');
    try {
      var user = state.session.user;
      var result = await state.client.from('community_messages').insert({
        user_id: user.id,
        user_email: user.email,
        room: 'general',
        body: body
      });
      if (result.error) throw result.error;
      input.value = '';
      setStatus('Sent.', 'success');
    } catch (error) {
      setStatus(error.message || 'Message could not be sent.', 'error');
    } finally {
      if (button) button.disabled = false;
      if (input) input.focus();
    }
  }

  async function initWithSession(session) {
    state.session = session;
    if (!session || !session.user) {
      window.location.href = '/login.html?redirect=' + encodeURIComponent('/community-chat.html');
      return;
    }

    state.client = global.SomaAuth && global.SomaAuth.getClient && global.SomaAuth.getClient();
    if (!state.client) {
      setStatus('Community chat is unavailable while auth is loading.', 'error');
      return;
    }

    var form = byId('chat-form');
    if (form && !state.ready) form.addEventListener('submit', sendMessage);
    state.ready = true;

    try {
      await loadMessages();
      subscribe();
      setStatus('Connected to community chat.', 'success');
    } catch (error) {
      setStatus((error && error.message) || 'Community chat is not ready yet.', 'error');
    }
  }

  global.LegendsCommunityChat = {
    initWithSession: initWithSession,
    _state: state
  };
})(window);
