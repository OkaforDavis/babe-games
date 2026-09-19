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
  const dataListeners = [];
  const stateListeners = [];

  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  const ROOM_PREFIX = "babegames-";

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

  function setupConnection(c) {
    conn = c;
    conn.on("open", () => emitState("connected", { roomCode, isHost }));
    conn.on("data", (data) => emitData(data));
    conn.on("close", () => emitState("disconnected"));
    conn.on("error", (err) => emitState("error", err));
  }

  function createRoom() {
    return new Promise((resolve, reject) => {
      if (typeof Peer === "undefined") return reject(new Error("PeerJS not loaded"));
      roomCode = genCode();
      isHost = true;
      peer = new Peer(ROOM_PREFIX + roomCode);
      peer.on("open", () => {
        emitState("waiting", { code: roomCode });
        resolve(roomCode);
      });
      peer.on("connection", (c) => setupConnection(c));
      peer.on("error", (err) => {
        emitState("error", err);
        reject(err);
      });
      peer.on("disconnected", () => emitState("peer-server-disconnected"));
    });
  }

  function joinRoom(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === "undefined") return reject(new Error("PeerJS not loaded"));
      isHost = false;
      roomCode = code.trim().toUpperCase();
      peer = new Peer();
      peer.on("open", () => {
        const c = peer.connect(ROOM_PREFIX + roomCode, { reliable: true });
        setupConnection(c);
        resolve();
      });
      peer.on("error", (err) => {
        emitState("error", err);
        reject(err);
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
          <p>Share this code with your partner:</p>
          <div class="scramble-word" id="online-code-display" style="font-size:2.2rem; letter-spacing:6px;"></div>
          <p style="color:var(--text-dim); font-size:0.85rem;" id="online-status-text">Waiting for them to join&hellip;</p>
        </div>
        <div id="online-connected" style="display:none; text-align:center;">
          <p class="feedback ok">Connected! \u{1F389}</p>
        </div>
        <div id="online-error" style="display:none;">
          <p class="feedback bad" id="online-error-text"></p>
        </div>
        <div class="btn-row">
          <button class="btn secondary small" id="online-close-btn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#online-close-btn").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    overlay.querySelector("#online-create-btn").addEventListener("click", async () => {
      try {
        const code = await BabeOnline.createRoom();
        document.getElementById("online-idle").style.display = "none";
        document.getElementById("online-waiting").style.display = "block";
        document.getElementById("online-code-display").textContent = code;
      } catch (err) {
        showError(err);
      }
    });

    overlay.querySelector("#online-join-btn").addEventListener("click", async () => {
      const codeInput = document.getElementById("online-join-code");
      const code = codeInput.value.trim();
      if (code.length < 5) {
        codeInput.focus();
        return;
      }
      try {
        document.getElementById("online-idle").style.display = "none";
        document.getElementById("online-waiting").style.display = "block";
        document.getElementById("online-code-display").textContent = code.toUpperCase();
        document.getElementById("online-status-text").textContent = "Connecting…";
        await BabeOnline.joinRoom(code);
      } catch (err) {
        showError(err);
      }
    });

    BabeOnline.onState((state, detail) => {
      if (state === "connected") {
        document.getElementById("online-waiting").style.display = "none";
        document.getElementById("online-connected").style.display = "block";
        if (onConnectedCallback) setTimeout(() => onConnectedCallback(detail), 600);
      } else if (state === "error") {
        showError(detail);
      } else if (state === "disconnected") {
        if (onDisconnectedCallback) onDisconnectedCallback();
      }
    });
  }

  function showError(err) {
    document.getElementById("online-idle").style.display = "none";
    document.getElementById("online-waiting").style.display = "none";
    const errBox = document.getElementById("online-error");
    errBox.style.display = "block";
    document.getElementById("online-error-text").textContent =
      "Couldn't connect. Check the code and your internet connection, then try again.";
  }

  function closeModal() {
    const modal = document.getElementById("online-modal");
    if (modal) modal.style.display = "none";
  }

  let onConnectedCallback = null;
  let onDisconnectedCallback = null;

  function openLobby({ onConnected, onDisconnected } = {}) {
    ensureModal();
    onConnectedCallback = onConnected || null;
    onDisconnectedCallback = onDisconnected || null;
    document.getElementById("online-idle").style.display = "block";
    document.getElementById("online-waiting").style.display = "none";
    document.getElementById("online-connected").style.display = "none";
    document.getElementById("online-error").style.display = "none";
    document.getElementById("online-modal").style.display = "flex";
  }

  function close() {
    closeModal();
  }

  return { openLobby, close };
})();
