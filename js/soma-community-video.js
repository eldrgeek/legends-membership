(function (global) {
  'use strict';

  var room = null;
  var session = null;
  var connectionId = getConnectionId();

  function byId(id) {
    return document.getElementById(id);
  }

  function getConnectionId() {
    var key = 'legends-video-connection-id';
    try {
      var existing = sessionStorage.getItem(key);
      if (existing) return existing;
      var created = (global.crypto && global.crypto.randomUUID)
        ? global.crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      sessionStorage.setItem(key, created);
      return created;
    } catch (error) {
      return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    }
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

  function audioSink() {
    var sink = byId('video-audio-sink');
    if (sink) return sink;
    sink = document.createElement('div');
    sink.id = 'video-audio-sink';
    sink.hidden = true;
    document.body.appendChild(sink);
    return sink;
  }

  function participantLabel(participant) {
    if (!participant) return 'You';
    return participant.name || participant.identity || 'Member';
  }

  function tileId(track, participant) {
    var participantId = participant && participant.identity ? participant.identity : 'local';
    var trackId = track && (track.sid || track.mediaStreamTrack && track.mediaStreamTrack.id || track.kind) || 'track';
    return participantId + ':' + trackId;
  }

  function attachTrack(track, participant) {
    if (!track || !track.attach) return;
    if (track.kind && track.kind !== 'video') {
      var audio = track.attach();
      audio.autoplay = true;
      audioSink().appendChild(audio);
      return;
    }
    var grid = byId('video-grid');
    if (!grid) return;
    var id = tileId(track, participant);
    var existing = grid.querySelector('[data-track-id="' + id + '"]');
    if (existing) return;
    var tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.dataset.participant = participantLabel(participant);
    tile.dataset.trackId = id;
    var media = track.attach();
    media.autoplay = true;
    media.playsInline = true;
    media.muted = participant && participant.isLocal;
    tile.appendChild(media);
    var label = document.createElement('span');
    label.textContent = tile.dataset.participant;
    tile.appendChild(label);
    grid.appendChild(tile);
  }

  function detachTrack(track, participant) {
    if (!track) return;
    if (track.kind && track.kind !== 'video') {
      if (track.detach) {
        track.detach().forEach(function (el) { el.remove(); });
      }
      return;
    }
    var grid = byId('video-grid');
    if (!grid) return;
    var tile = grid.querySelector('[data-track-id="' + tileId(track, participant) + '"]');
    if (tile) tile.remove();
    if (track.detach) {
      track.detach().forEach(function (el) { el.remove(); });
    }
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
      body: JSON.stringify({ room: roomName, connectionId: connectionId })
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
        .on(LiveKit.RoomEvent.TrackUnsubscribed, detachTrack)
        .on(LiveKit.RoomEvent.ParticipantDisconnected, function (participant) {
          var grid = byId('video-grid');
          if (!grid) return;
          Array.from(grid.querySelectorAll('[data-track-id^="' + participant.identity + ':"]'))
            .forEach(function (tile) { tile.remove(); });
        })
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
        if (tracks[i].kind === 'video') attachTrack(tracks[i], { identity: 'local', name: 'You', isLocal: true });
      }
      room.remoteParticipants.forEach(function (participant) {
        participant.trackPublications.forEach(function (publication) {
          if (publication.track) attachTrack(publication.track, participant);
        });
      });
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

  var api = {
    initWithSession: initWithSession
  };

  global.SomaCommunityVideo = api;
  global.LegendsCommunityVideo = api;
})(window);
