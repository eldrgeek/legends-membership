/*
 * Legends Community Chat — React island built on chatscope's Chat UI Kit,
 * wired to the existing Supabase backend (table: community_messages).
 *
 * Adds the requested features on top of Supabase Realtime (no new backend):
 *   • Multiple rooms        — client-defined conversation list (left sidebar).
 *   • Presence              — channel.track()/presence sync → "N online".
 *   • Typing indicators     — broadcast 'typing' events, TTL-pruned.
 *   • Clear the chat        — admins call the community-clear function (wipes
 *                             the room for everyone); each member can also
 *                             delete their own messages (standard convention).
 *
 * No bundler: bare specifiers are resolved by the importmap in
 * community-chat.html. external=react,react-dom keeps one React instance.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import {
  MainContainer, Sidebar, ConversationList, Conversation,
  ChatContainer, ConversationHeader, MessageList, Message,
  MessageInput, TypingIndicator,
} from '@chatscope/chat-ui-kit-react';

const html = htm.bind(React.createElement);

const ROOMS = [
  { id: 'general', name: 'General' },
  { id: 'introductions', name: 'Introductions' },
  { id: 'events', name: 'Events' },
];

const TYPING_TTL_MS = 3500;

function displayName(email, fallback) {
  if (!email) return fallback || 'Member';
  return email.split('@')[0].replace(/[._-]+/g, ' ');
}
function fullNameFromSession(session) {
  const u = session && session.user;
  if (!u) return 'Member';
  return (u.user_metadata && u.user_metadata.full_name) || displayName(u.email);
}
function formatTime(value) {
  try {
    return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  } catch (e) { return ''; }
}

function ChatApp() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [client, setClient] = useState(null);

  const [activeRoom, setActiveRoom] = useState('general');
  const [messages, setMessages] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingNames, setTypingNames] = useState([]);
  const [status, setStatus] = useState('Connecting…');

  const channelRef = useRef(null);
  const typingRef = useRef({});       // userId → { name, ts }
  const lastTypingSentRef = useRef(0);
  const mounted = useRef(true);

  // ── Auth bootstrap (independent of the page's nav bootstrap) ──────────────
  useEffect(() => {
    mounted.current = true;
    const Auth = window.SomaAuth;
    if (!Auth) { setAuthReady(true); return; }
    Auth.getSession().then((r) => {
      if (!mounted.current) return;
      const s = (r && r.data && r.data.session) || null;
      setSession(s);
      setClient(Auth.getClient && Auth.getClient());
      setAuthReady(true);
      if (s && s.user && Auth.getRole) {
        Auth.getRole(s.user).then((role) => mounted.current && setIsAdmin(role === 'admin'));
      }
    });
    Auth.onAuthStateChange((_e, s) => {
      if (!mounted.current) return;
      setSession(s || null);
      setClient(Auth.getClient && Auth.getClient());
      setAuthReady(true);
      if (s && s.user && Auth.getRole) {
        Auth.getRole(s.user).then((role) => mounted.current && setIsAdmin(role === 'admin'));
      } else {
        setIsAdmin(false);
      }
    });
    return () => { mounted.current = false; };
  }, []);

  // ── Prune typing entries on a timer ───────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      let changed = false;
      Object.keys(typingRef.current).forEach((k) => {
        if (now - typingRef.current[k].ts > TYPING_TTL_MS) { delete typingRef.current[k]; changed = true; }
      });
      if (changed) setTypingNames(Object.values(typingRef.current).map((v) => v.name));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Load + subscribe whenever the room (or client/session) changes ────────
  useEffect(() => {
    if (!client || !session || !session.user) return;
    let cancelled = false;
    const room = activeRoom;
    const me = session.user;

    setMessages([]);
    setOnlineCount(0);
    setTypingNames([]);
    typingRef.current = {};
    setStatus('Loading messages…');

    (async () => {
      const result = await client
        .from('community_messages')
        .select('id,user_id,user_email,body,room,created_at')
        .eq('room', room)
        .order('created_at', { ascending: true })
        .limit(200);
      if (cancelled) return;
      if (result.error) { setStatus(result.error.message || 'Could not load messages.'); return; }
      setMessages(result.data || []);
      setStatus('');
    })();

    const channel = client.channel('community-room-' + room, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_messages', filter: 'room=eq.' + room },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : prev.concat(payload.new)));
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'community_messages', filter: 'room=eq.' + room },
        (payload) => {
          const goneId = payload.old && payload.old.id;
          if (goneId) setMessages((prev) => prev.filter((m) => m.id !== goneId));
        })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineCount(Object.keys(state).length);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || !payload.user_id || payload.user_id === me.id) return;
        typingRef.current[payload.user_id] = { name: payload.name || 'Someone', ts: Date.now() };
        setTypingNames(Object.values(typingRef.current).map((v) => v.name));
      })
      .subscribe(async (st) => {
        if (st === 'SUBSCRIBED') {
          try {
            await channel.track({ user_id: me.id, name: fullNameFromSession(session), online_at: new Date().toISOString() });
          } catch (e) { /* ignore */ }
        }
      });

    return () => {
      cancelled = true;
      try { client.removeChannel(channel); } catch (e) {}
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [client, session, activeRoom]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (textContent) => {
    const body = (textContent || '').trim();
    if (!body || !client || !session || !session.user) return;
    if (body.length > 2000) { setStatus('Keep messages under 2,000 characters.'); return; }
    const user = session.user;
    const { error } = await client.from('community_messages').insert({
      user_id: user.id, user_email: user.email, room: activeRoom, body,
    });
    if (error) setStatus(error.message || 'Message could not be sent.');
  }, [client, session, activeRoom]);

  const broadcastTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !session || !session.user) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1200) return; // throttle
    lastTypingSentRef.current = now;
    try {
      ch.send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id, name: fullNameFromSession(session) } });
    } catch (e) { /* ignore */ }
  }, [session]);

  const deleteOwn = useCallback(async (id) => {
    if (!client) return;
    setMessages((prev) => prev.filter((m) => m.id !== id)); // optimistic
    const { error } = await client.from('community_messages').delete().eq('id', id);
    if (error) setStatus(error.message || 'Could not delete message.');
  }, [client]);

  const clearRoom = useCallback(async () => {
    if (!session) return;
    if (!window.confirm('Clear all messages in “' + activeRoom + '” for everyone? This cannot be undone.')) return;
    setStatus('Clearing room…');
    try {
      const res = await fetch('/.netlify/functions/community-clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ room: activeRoom }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus(out.error || 'Could not clear the room.'); return; }
      setMessages([]); // realtime DELETEs will also arrive for other clients
      setStatus('');
    } catch (e) {
      setStatus('Could not clear the room.');
    }
  }, [session, activeRoom]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!authReady) return html`<div class="community-status">Loading…</div>`;
  if (!session || !session.user) {
    const href = '/login.html?redirect=' + encodeURIComponent('/community-chat.html');
    return html`
      <div class="empty-state" style=${{ padding: '32px', textAlign: 'center' }}>
        <p>You need to be signed in to join the community chat.</p>
        <a class="btn btn-navy" href=${href} style=${{ marginTop: '12px', display: 'inline-block' }}>Sign in or sign up</a>
      </div>`;
  }

  const meId = session.user.id;
  const roomName = (ROOMS.find((r) => r.id === activeRoom) || {}).name || activeRoom;
  const typingContent = typingNames.length
    ? (typingNames.length === 1 ? typingNames[0] + ' is typing' : typingNames.slice(0, 2).join(', ') + ' are typing')
    : '';

  return html`
    <div style=${{ position: 'relative', height: '70vh', minHeight: '460px' }}>
      <${MainContainer} responsive=${true}>
        <${Sidebar} position="left" scrollable=${false}>
          <${ConversationList}>
            ${ROOMS.map((r) => html`
              <${Conversation}
                key=${r.id}
                name=${r.name}
                active=${r.id === activeRoom}
                onClick=${() => setActiveRoom(r.id)}
              />`)}
          <//>
        <//>
        <${ChatContainer}>
          <${ConversationHeader}>
            <${ConversationHeader.Content}
              userName=${'# ' + roomName}
              info=${onlineCount > 0 ? onlineCount + ' online' : 'No one else online'}
            />
            <${ConversationHeader.Actions}>
              ${isAdmin ? html`
                <button class="btn btn-outline-light" style=${{ fontSize: '0.75rem', padding: '4px 10px' }} onClick=${clearRoom}>
                  Clear room
                </button>` : null}
            <//>
          <//>
          <${MessageList}
            typingIndicator=${typingContent ? html`<${TypingIndicator} content=${typingContent} />` : null}
          >
            ${messages.map((m) => {
              const own = m.user_id === meId;
              const model = {
                message: m.body,
                sentTime: formatTime(m.created_at),
                sender: displayName(m.user_email),
                direction: own ? 'outgoing' : 'incoming',
                position: 'single',
              };
              return html`
                <${Message} key=${m.id} model=${model}>
                  <${Message.Header} sender=${displayName(m.user_email)} sentTime=${formatTime(m.created_at)} />
                  ${own ? html`
                    <${Message.Footer}>
                      <button
                        title="Delete message"
                        onClick=${() => deleteOwn(m.id)}
                        style=${{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', opacity: 0.6 }}
                      >Delete</button>
                    <//>` : null}
                <//>`;
            })}
          <//>
          <${MessageInput}
            placeholder=${'Write a message in #' + roomName}
            attachButton=${false}
            onSend=${(innerHtml, textContent) => handleSend(textContent)}
            onChange=${() => broadcastTyping()}
          />
        <//>
      <//>
    </div>
    ${status ? html`<div class="community-status" style=${{ marginTop: '8px' }}>${status}</div>` : null}`;
}

const mountEl = document.getElementById('chat-app');
if (mountEl) {
  createRoot(mountEl).render(html`<${ChatApp} />`);
}
