(function (global) {
  'use strict';

  var room = null;
  var session = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message, type) {
    var el = byId('video-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'community-status' + (type ? ' ' + type : '');
  }

  function setConnected(connected) {
    var join = byId('video-join');
    var leave = byId('video-leave');
    if (join) join.disabled = connected;
    if (leave) leave.disabled = !connected;
  }

  function attachTrack(track, participant) {
    if (!track || !track.attach) return;
    var grid = byId('video-grid');
    if (!grid) return;
    var tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.dataset.participant = participant && participant.identity ? participant.identity : 'local';
    var media = track.attach();
    media.autoplay = true;
    media.playsInline = true;
    tile.appendChild(media);
    var label = document.createElement('span');
    label.textContent = tile.dataset.participant;
    tile.appendChild(label);
    grid.appendChild(tile);
  }

  function clearGrid() {
    var grid = byId('video-grid');
    if (grid) grid.innerHTML = '<div class="empty-state">Join the room to start video.</div>';
  }

  async function fetchToken(roomName) {
    var response = await fetch('/.netlify/functions/livekit-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ room: roomName })
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(body.error || 'Could not create video token.');
    return body;
  }

  async function joinRoom(event) {
    if (event) event.preventDefault();
    if (!session || !session.user) return;
    if (!global.LivekitClient) {
      setStatus('LiveKit client did not load. Please refresh and try again.', 'error');
      return;
    }

    var roomInput = byId('video-room-name');
    var roomName = roomInput && roomInput.value.trim() ? roomInput.value.trim() : 'legends-community';
    setStatus('Joining room...', '');
    setConnected(true);

    try {
      var token = await fetchToken(roomName);
      var LiveKit = global.LivekitClient;
      room = new LiveKit.Room({ adaptiveStream: true, dynacast: true });
      room
        .on(LiveKit.RoomEvent.TrackSubscribed, attachTrack)
        .on(LiveKit.RoomEvent.Disconnected, function () {
          setConnected(false);
          setStatus('You left the room.', '');
          clearGrid();
        });

      await room.connect(token.url, token.token);
      clearGrid();
      var tracks = await LiveKit.createLocalTracks({ audio: true, video: true });
      byId('video-grid').innerHTML = '';
      for (var i = 0; i < tracks.length; i++) {
        await room.localParticipant.publishTrack(tracks[i]);
        if (tracks[i].kind === 'video') attachTrack(tracks[i], { identity: 'You' });
      }
      setStatus('Connected to ' + roomName + '.', 'success');
    } catch (error) {
      setConnected(false);
      setStatus(error.message || 'Could not join video room.', 'error');
      if (room) room.disconnect();
    }
  }

  function leaveRoom() {
    if (room) room.disconnect();
    room = null;
    setConnected(false);
  }

  function initWithSession(currentSession) {
    session = currentSession;
    if (!session || !session.user) {
      window.location.href = '/login.html?redirect=' + encodeURIComponent('/community-video.html');
      return;
    }
    var form = byId('video-form');
    var leave = byId('video-leave');
    if (form) form.addEventListener('submit', joinRoom);
    if (leave) leave.addEventListener('click', leaveRoom);
    setConnected(false);
    setStatus('Ready to join.', 'success');
  }

  global.LegendsCommunityVideo = {
    initWithSession: initWithSession
  };
})(window);
