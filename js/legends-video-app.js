/*
 * Legends Community Video — React island built on LiveKit's prebuilt UI.
 *
 * Replaces the previous hand-rolled track handling (js/soma-community-video.js),
 * which acquired audio+video together and hard-disconnected the participant when
 * the camera was blocked — the cause of "can't see herself / others can't see
 * her". LiveKit's <VideoConference/> manages device acquisition, self-view, the
 * participant grid, mute/camera/screen-share controls, and gracefully tolerates
 * a denied or missing camera (you join anyway and can retry from the control bar).
 *
 * No bundler: bare specifiers ("react", "@livekit/components-react", …) are
 * resolved by the <script type="importmap"> in community-video.html via esm.sh.
 * `external=react,react-dom` in that map guarantees a single React instance so
 * hooks/context work across the LiveKit components.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
// NOTE: @livekit/components-styles is plain CSS, so it is loaded via a <link>
// in community-video.html (a bare JS `import` of a .css file is rejected by
// browsers). Do not import it here.

const html = htm.bind(React.createElement);

// Per-TAB connection id → the token function builds a LiveKit identity of
// `${user.id}-${connectionId}`, so the same user can join from two tabs as two
// distinct participants. (sessionStorage is per-tab by design.)
function getConnectionId() {
  const key = 'legends-video-connection-id';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    sessionStorage.setItem(key, created);
    return created;
  } catch (e) {
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }
}

async function fetchToken(session, roomName) {
  const res = await fetch('/.netlify/functions/livekit-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ room: roomName, connectionId: getConnectionId() }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not create a video token.');
  return body; // { url, token, room, identity, name }
}

function SignInPrompt() {
  const href = '/login.html?redirect=' + encodeURIComponent('/community-video.html');
  return html`
    <div class="empty-state" style=${{ padding: '32px', textAlign: 'center' }}>
      <p>You need to be signed in to join the video room.</p>
      <a class="btn btn-navy" href=${href} style=${{ marginTop: '12px', display: 'inline-block' }}>
        Sign in or sign up
      </a>
    </div>`;
}

function VideoApp() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [roomName, setRoomName] = useState('legends-community');
  const [conn, setConn] = useState(null);   // { serverUrl, token, room }
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('');
  const [joining, setJoining] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const Auth = window.SomaAuth;
    if (!Auth) { setAuthReady(true); return; }
    // init() may already have run from the page's nav bootstrap, so a late
    // subscriber won't receive INITIAL_SESSION — seed explicitly with getSession().
    Auth.getSession().then((r) => {
      if (!mounted.current) return;
      setSession((r && r.data && r.data.session) || null);
      setAuthReady(true);
    });
    Auth.onAuthStateChange((_event, s) => {
      if (!mounted.current) return;
      setSession(s || null);
      setAuthReady(true);
    });
    return () => { mounted.current = false; };
  }, []);

  const join = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!session || !session.user) return;
    const name = (roomName || '').trim() || 'legends-community';
    setJoining(true);
    setStatus('Requesting access…');
    setStatusType('');
    try {
      const token = await fetchToken(session, name);
      if (!mounted.current) return;
      setConn({ serverUrl: token.url, token: token.token, room: token.room || name });
      setStatus('');
    } catch (err) {
      setStatus(err.message || 'Could not join the video room.', 'error');
      setStatusType('error');
    } finally {
      setJoining(false);
    }
  }, [session, roomName]);

  const leave = useCallback(() => {
    setConn(null);
    setStatus('You left the room.');
    setStatusType('');
  }, []);

  if (!authReady) {
    return html`<div class="community-status">Loading…</div>`;
  }
  if (!session || !session.user) {
    return html`<${SignInPrompt} />`;
  }

  if (conn) {
    return html`
      <div data-lk-theme="default" style=${{ height: '72vh', minHeight: '420px', borderRadius: '10px', overflow: 'hidden' }}>
        <${LiveKitRoom}
          serverUrl=${conn.serverUrl}
          token=${conn.token}
          connect=${true}
          video=${true}
          audio=${true}
          onDisconnected=${leave}
          onError=${(err) => { setStatus(err && err.message ? err.message : 'Video error.'); setStatusType('error'); }}
          style=${{ height: '100%' }}
        >
          <${VideoConference} />
          <${RoomAudioRenderer} />
        <//>
      </div>`;
  }

  return html`
    <form class="video-form" onSubmit=${join}>
      <label htmlFor="video-room-name">Room</label>
      <input id="video-room-name" value=${roomName}
        onChange=${(e) => setRoomName(e.target.value)} autoComplete="off" />
      <button class="btn btn-navy" type="submit" disabled=${joining}>
        ${joining ? 'Joining…' : 'Join'}
      </button>
    </form>
    <div class=${'community-status' + (statusType ? ' ' + statusType : '')}>
      ${status || 'Ready to join. Your browser will ask for camera and microphone access.'}
    </div>
    <p class="video-hint" style=${{ fontSize: '0.82rem', opacity: 0.7, marginTop: '8px' }}>
      Camera blocked? You can still join to talk and listen — use the camera button in the
      control bar to turn it on once you allow access in your browser's address bar.
    </p>`;
}

const mountEl = document.getElementById('video-app');
if (mountEl) {
  createRoot(mountEl).render(html`<${VideoApp} />`);
}
