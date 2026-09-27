// Peer-to-peer connection layer for playing with one other specific person
// on a different device. Uses PeerJS's free public broker only to introduce
// the two browsers to each other (signaling); actual game data then flows
// directly device-to-device over WebRTC, not through any server we run.
//
// This is NOT public matchmaking — you share a short room code (or link)
// with the one person you want to play with.

const BabeOnline = (function () {
  let peer = null;
  let conn = null;
  let isHost = false;
  let roomCode = null;
  let connectTimeout = null;
  const dataListeners = [];
  const stateListeners = [];

  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  const ROOM_PREFIX = "babegames-";
  const CONNECT_TIMEOUT_MS = 20000;

  // Plain STUN alone only works when both sides have "easy" NATs. Phones on
  // mobile data or behind strict/carrier-grade NAT often can't punch a
  // direct hole, so the handshake just hangs forever on "Connecting...".
  // These TURN servers relay traffic instead, so a connection still forms
  // even when a direct path isn't possible. (Open Relay Project's free,
  // publicly documented test credentials.)
  const ICE_CONFIG = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:openrelay.metered.ca:80" },
      { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    ],
  };

  function genCode() {
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  function emitState(state, detail) {
    stateListeners.forEach((cb) => cb(state, detail));
  }

  function emitData(data) {
    dataListeners.forEach((cb) => cb(data));
  }

  function clearConnectTimeout() {
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }
  }

  function armConnectTimeout() {
    clearConnectTimeout();
    connectTimeout = setTimeout(() => {
      if (!conn || !conn.open) {
        emitState("timeout");
        disconnect();
      }
    }, CONNECT_TIMEOUT_MS);
  }

  function setupConnection(c) {
    conn = c;
    conn.on("open", () => {
      clearConnectTimeout();
      emitState("connected", { roomCode, isHost });
    });
    conn.on("data", (data) => emitData(data));
    conn.on("close", () => emitState("disconnected"));
    conn.on("error", (err) => emitState("error", err));
  }

  function friendlyPeerError(err) {
    const type = err && err.type;
    if (type === "peer-unavailable") {
      return "That room code isn't open right now — ask your partner for a fresh code (codes only work while the host's page is open).";
    }
    if (type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed") {
      return "Couldn't reach the connection service. Check your internet connection and try again.";
    }
    if (type === "unavailable-id") {
      return "That room code is already taken — try creating a new room.";
    }
    return "Something went wrong connecting. Please try again.";
  }

  function createRoom() {
    return new Promise((resolve, reject) => {
      if (typeof Peer === "undefined") return reject(new Error("PeerJS not loaded"));
      roomCode = genCode();
      isHost = true;
      peer = new Peer(ROOM_PREFIX + roomCode, { config: ICE_CONFIG });
      peer.on("open", () => {
        emitState("waiting", { code: roomCode });
        resolve(roomCode);
      });
      peer.on("connection", (c) => {
        armConnectTimeout();
        setupConnection(c);
      });
      peer.on("error", (err) => {
        emitState("error", friendlyPeerError(err));
        reject(err);
      });
      peer.on("disconnected", () => {
        emitState("peer-server-disconnected");
        if (peer && !peer.destroyed) peer.reconnect();
      });
    });
  }

  function joinRoom(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === "undefined") return reject(new Error("PeerJS not loaded"));
      isHost = false;
      roomCode = code.trim().toUpperCase();
      peer = new Peer({ config: ICE_CONFIG });
      peer.on("open", () => {
        const c = peer.connect(ROOM_PREFIX + roomCode, { reliable: true });
        armConnectTimeout();
        setupConnection(c);
        resolve();
      });
      peer.on("error", (err) => {
        clearConnectTimeout();
        emitState("error", friendlyPeerError(err));
        reject(err);
      });
      peer.on("disconnected", () => {
        emitState("peer-server-disconnected");
        if (peer && !peer.destroyed) peer.reconnect();
      });
    });
  }

  function send(data) {
    if (conn && conn.open) conn.send(data);
  }

  function onData(cb) {
    dataListeners.push(cb);
  }

  function onState(cb) {
    stateListeners.push(cb);
  }

  function disconnect() {
    clearConnectTimeout();
    try {
      if (conn) conn.close();
      if (peer) peer.destroy();
    } catch {
      /* already closed */
    }
    conn = null;
    peer = null;
    roomCode = null;
  }

  return {
    createRoom,
    joinRoom,
    send,
    onData,
    onState,
    disconnect,
    get isHost() {
      return isHost;
    },
    get roomCode() {
      return roomCode;
    },
    get connected() {
      return !!(conn && conn.open);
    },
  };
})();

// ---- Reusable lobby UI (room create / join modal) ----

const BabeOnlineUI = (function () {
  let onConnectedCallback = null;
  let onDisconnectedCallback = null;

  function ensureModal() {
    if (document.getElementById("online-modal")) return;
    const overlay = document.createElement("div");
    overlay.id = "online-modal";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3 style="margin-top:0;">Play Online</h3>
        <p style="color:var(--text-dim); font-size:0.9rem;">Connects you directly with one other person &mdash; not public matchmaking.</p>
        <div id="online-idle">
          <div class="btn-row">
            <button class="btn small" id="online-create-btn">Create a room</button>
          </div>
          <div class="field" style="margin-top:16px;">
            <label for="online-join-code">Got a code from your partner?</label>
            <input type="text" id="online-join-code" placeholder="e.g. AB3XZ" maxlength="5" style="text-transform:uppercase;" />
          </div>
          <div class="btn-row">
            <button class="btn secondary small" id="online-join-btn">Join</button>
          </div>
        </div>
        <div id="online-waiting" style="display:none; text-align:center;">
          <p>Share this code or link with your partner:</p>
          <div class="scramble-word" id="online-code-display" style="font-size:2.2rem; letter-spacing:6px;"></div>
          <div class="btn-row" style="justify-content:center;">
            <button class="btn secondary small" id="online-copy-link-btn">Copy invite link</button>
          </div>
          <p style="color:var(--text-dim); font-size:0.85rem;" id="online-status-text">Waiting for them to join&hellip; keep this tab open.</p>
          <div class="btn-row" style="justify-content:center;">
            <button class="btn secondary small" id="online-cancel-btn">Cancel</button>
          </div>
        </div>
        <div id="online-connected" style="display:none; text-align:center;">
          <p class="feedback ok">Connected! \u{1F389}</p>
        </div>
        <div id="online-error" style="display:none; text-align:center;">
          <p class="feedback bad" id="online-error-text"></p>
          <div class="btn-row" style="justify-content:center;">
            <button class="btn small" id="online-retry-btn">Try again</button>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn secondary small" id="online-close-btn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#online-close-btn").addEventListener("click", () => {
      BabeOnline.disconnect();
      closeModal();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        BabeOnline.disconnect();
        closeModal();
      }
    });

    overlay.querySelector("#online-create-btn").addEventListener("click", startCreate);
    overlay.querySelector("#online-join-btn").addEventListener("click", () => {
      const codeInput = document.getElementById("online-join-code");
      const code = codeInput.value.trim();
      if (code.length < 5) {
        codeInput.focus();
        return;
      }
      startJoin(code);
    });
    overlay.querySelector("#online-cancel-btn").addEventListener("click", () => {
      BabeOnline.disconnect();
      showIdle();
    });
    overlay.querySelector("#online-retry-btn").addEventListener("click", showIdle);

    overlay.querySelector("#online-copy-link-btn").addEventListener("click", () => {
      const code = BabeOnline.roomCode;
      if (!code) return;
      const url = new URL(location.href);
      url.searchParams.set("room", code);
      const text = url.toString();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      const btn = document.getElementById("online-copy-link-btn");
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = original), 1500);
    });

    BabeOnline.onState((state, detail) => {
      if (state === "connected") {
        document.getElementById("online-waiting").style.display = "none";
        document.getElementById("online-connected").style.display = "block";
        if (onConnectedCallback) setTimeout(() => onConnectedCallback(detail), 600);
      } else if (state === "error") {
        showError(detail);
      } else if (state === "timeout") {
        showError("Couldn't connect — make sure you're both online and the room code is fresh, then try again.");
      } else if (state === "disconnected") {
        if (onDisconnectedCallback) onDisconnectedCallback();
      }
    });
  }

  async function startCreate() {
    showWaiting();
    document.getElementById("online-status-text").textContent = "Setting up your room…";
    try {
      const code = await BabeOnline.createRoom();
      document.getElementById("online-code-display").textContent = code;
      document.getElementById("online-status-text").textContent = "Waiting for them to join… keep this tab open.";
    } catch (err) {
      showError(typeof err === "string" ? err : "Couldn't create a room. Try again.");
    }
  }

  async function startJoin(code) {
    showWaiting();
    document.getElementById("online-code-display").textContent = code.toUpperCase();
    document.getElementById("online-status-text").textContent = "Connecting…";
    document.getElementById("online-copy-link-btn").style.display = "none";
    try {
      await BabeOnline.joinRoom(code);
    } catch (err) {
      showError(typeof err === "string" ? err : "Couldn't join that room. Check the code and try again.");
    }
  }

  function showIdle() {
    document.getElementById("online-idle").style.display = "block";
    document.getElementById("online-waiting").style.display = "none";
    document.getElementById("online-connected").style.display = "none";
    document.getElementById("online-error").style.display = "none";
    document.getElementById("online-copy-link-btn").style.display = "inline-block";
  }

  function showWaiting() {
    document.getElementById("online-idle").style.display = "none";
    document.getElementById("online-waiting").style.display = "block";
    document.getElementById("online-connected").style.display = "none";
    document.getElementById("online-error").style.display = "none";
  }

  function showError(message) {
    document.getElementById("online-idle").style.display = "none";
    document.getElementById("online-waiting").style.display = "none";
    document.getElementById("online-connected").style.display = "none";
    const errBox = document.getElementById("online-error");
    errBox.style.display = "block";
    document.getElementById("online-error-text").textContent =
      typeof message === "string" ? message : "Couldn't connect. Check your internet connection, then try again.";
  }

  function closeModal() {
    const modal = document.getElementById("online-modal");
    if (modal) modal.style.display = "none";
  }

  function openLobby({ onConnected, onDisconnected, autoJoinCode } = {}) {
    ensureModal();
    onConnectedCallback = onConnected || null;
    onDisconnectedCallback = onDisconnected || null;
    showIdle();
    document.getElementById("online-modal").style.display = "flex";
    if (autoJoinCode) {
      document.getElementById("online-join-code").value = autoJoinCode;
      startJoin(autoJoinCode);
    }
  }

  function close() {
    closeModal();
  }

  return { openLobby, close };
})();
