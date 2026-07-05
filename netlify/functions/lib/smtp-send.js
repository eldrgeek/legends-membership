// Minimal dependency-free SMTP client — STARTTLS + AUTH LOGIN + single
// plain-text message send. Built instead of pulling in nodemailer so this
// function has no extra runtime dependency. Ported logic-for-logic from the
// canonical soma-feedback reference backend
// (SOMA/standards/soma-feedback + playmaker/netlify/functions/lib/smtp-send.ts).
// Keep any real fix upstream in the canonical copy too.
//
// Verified against smtp.gmail.com:587 (Gmail app-password auth) — the same
// transport claude-email-daemon uses server-side
// (second-brain/Resources/email-config.md). Only ever called from Netlify
// Function (server) context — credentials never reach the browser.

const tls = require('node:tls');
const net = require('node:net');

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

// Reads one or more CRLF-terminated SMTP response lines (multi-line replies
// use "250-" continuation, final line uses "250 "). Resolves once a final
// line for the expected code family is seen.
function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1];
      // Final line format: "NNN <text>" (space, not dash) or exactly one line.
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: parseInt(last.slice(0, 3), 10), text: buf });
      }
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    function cleanup() {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
    }
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

function writeLine(socket, line) {
  socket.write(line + '\r\n');
}

/**
 * sendMail({ host, port, user, pass, from, to, subject, text }) -> Promise<void>
 * STARTTLS flow (port 587). Throws on any non-2xx/3xx SMTP response.
 */
async function sendMail({ host, port = 587, user, pass, from, to, subject, text }) {
  const socket = net.connect(port, host);
  await new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('error', reject);
  });

  let resp = await readResponse(socket); // 220 greeting
  assertCode(resp, 220, 'greeting');

  writeLine(socket, `EHLO soma-feedback`);
  resp = await readResponse(socket);
  assertCode(resp, 250, 'EHLO');

  writeLine(socket, 'STARTTLS');
  resp = await readResponse(socket);
  assertCode(resp, 220, 'STARTTLS');

  const secureSocket = await new Promise((resolve, reject) => {
    const s = tls.connect({ socket, servername: host }, () => resolve(s));
    s.once('error', reject);
  });

  writeLine(secureSocket, `EHLO soma-feedback`);
  resp = await readResponse(secureSocket);
  assertCode(resp, 250, 'EHLO (TLS)');

  writeLine(secureSocket, 'AUTH LOGIN');
  resp = await readResponse(secureSocket);
  assertCode(resp, 334, 'AUTH LOGIN prompt');

  writeLine(secureSocket, b64(user));
  resp = await readResponse(secureSocket);
  assertCode(resp, 334, 'username prompt');

  writeLine(secureSocket, b64(pass));
  resp = await readResponse(secureSocket);
  assertCode(resp, 235, 'auth result');

  writeLine(secureSocket, `MAIL FROM:<${from}>`);
  resp = await readResponse(secureSocket);
  assertCode(resp, 250, 'MAIL FROM');

  writeLine(secureSocket, `RCPT TO:<${to}>`);
  resp = await readResponse(secureSocket);
  assertCode(resp, 250, 'RCPT TO');

  writeLine(secureSocket, 'DATA');
  resp = await readResponse(secureSocket);
  assertCode(resp, 354, 'DATA');

  // Subjects/bodies here routinely carry non-ASCII (em dashes, curly quotes
  // from pasted feedback text). RFC 2047-encode the Subject header, base64-
  // encode the body with an explicit Content-Transfer-Encoding so the
  // claude-email-daemon Python `email` parser decodes it cleanly. Base64 also
  // sidesteps SMTP dot-stuffing (no body line can start with a literal ".").
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const bodyB64 = Buffer.from(text, 'utf8').toString('base64');
  const wrappedB64 = bodyB64.replace(/(.{76})/g, '$1\r\n');

  const headers = [
    `From: SOMA Feedback <${from}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    '',
  ].join('\r\n');
  writeLine(secureSocket, headers + wrappedB64 + '\r\n.');
  resp = await readResponse(secureSocket);
  assertCode(resp, 250, 'message accepted');

  writeLine(secureSocket, 'QUIT');
  try {
    await readResponse(secureSocket);
  } catch (_) {
    /* server may close immediately after QUIT ack — ignore */
  }
  secureSocket.end();
}

function assertCode(resp, expected, step) {
  if (!resp || Math.floor(resp.code / 100) !== Math.floor(expected / 100)) {
    throw new Error(`SMTP ${step} failed: ${resp && resp.text}`);
  }
}

module.exports = { sendMail };
