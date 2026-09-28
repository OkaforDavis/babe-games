// Connecting the two players.
//
// This used to be WebRTC peer-to-peer only, which turns out to be the wrong
// tool here: two phones on mobile data are usually behind carrier-grade NAT,
// which blocks a direct connection, and the free relay servers that would
// rescue it are unreliable. So the primary transport is now a plain outbound
// secure WebSocket to a public message broker — the same kind of connection
// as loading a web page, which carriers don't interfere with. Peer-to-peer
// is kept as a fallback for when no broker can be reached.
//
// Either way this is not public matchmaking: you share a short room code
// with the one person you want to play with.

const BabeOnline = (function () {
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  const TOPIC_PREFIX = "babegames/v1";

  // Tried in order; a blocked port on one network is usually open on another.
  const BROKERS = [
    "wss://broker.hivemq.com:8884/mqtt",
    "wss://broker.emqx.io:8084/mqtt",
    "wss://test.mosquitto.org:8081/mqtt",
  ];

  const BROKER_CONNECT_MS = 9000;
  const GUEST_WAIT_MS = 15000;
  const P2P_CONNECT_MS = 20000;

  let transport = null;
  let isHost = false;
  let roomCode = null;
  let transportName = null;
  let lastStatus = "";
  const dataListeners = [];
  const stateListeners = [];

  function genCode() {
    let code = "";
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return code;
  }

  function emitState(state, detail) {
    stateListeners.forEach((cb) => cb(state, detail));
  }

  function emitData(data) {
    dataListeners.forEach((cb) => cb(data));
  }

  function setStatus(text) {
    lastStatus = text;
    emitState("status", text);
  }

  // ---------------------------------------------------------------- relay

  // Both players subscribe to one topic named after the room code and talk
  // over it. Presence is announced explicitly so each side knows the other
  // has actually arrived.
  function createRelayTransport(brokerUrl) {
    const myId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let client = null;
    let opened = false;
    let greeted = false;
    let stopped = false;
    let handlers = {};
    const topic = `${TOPIC_PREFIX}/${roomCode}/bus`;

    function publish(payload) {
      if (!client || stopped) return;
      try {
        client.publish(topic, JSON.stringify({ from: myId, ...payload }), { qos: 0 });
      } catch {
        /* a dropped publish just means the peer retries */
      }
    }

    function handleEnvelope(envelope) {
      if (!envelope || envelope.from === myId) return; // our own echo
      if (envelope.hello) {
        // Answer once so the other side knows we're here too.
        if (!greeted) {
          greeted = true;
          publish({ hello: true });
        }
        if (!opened) {
          opened = true;
          handlers.onOpen();
        }
        return;
      }
      if (envelope.bye) {
        handlers.onClose();
        return;
      }
      if (envelope.data !== undefined) handlers.onData(envelope.data);
    }

    return {
      name: "relay",
      start(opts) {
        handlers = opts;
        if (typeof mqtt === "undefined") {
          handlers.onFail("the messaging library didn't load");
          return;
        }

        const timer = setTimeout(() => {
          if (!client || !client.connected) {
            this.stop();
            handlers.onFail("couldn't reach the connection service");
          }
        }, BROKER_CONNECT_MS);

        try {
          client = mqtt.connect(brokerUrl, {
            clientId: `bg_${myId}`,
            connectTimeout: BROKER_CONNECT_MS,
            reconnectPeriod: 3000,
            clean: true,
          });
        } catch (err) {
          clearTimeout(timer);
          handlers.onFail("couldn't reach the connection service");
          return;
        }

        client.on("connect", () => {
          clearTimeout(timer);
          if (stopped) return;
          client.subscribe(topic, { qos: 0 }, (err) => {
            if (err) {
              handlers.onFail("couldn't join the room channel");
              return;
            }
            handlers.onReady();
            publish({ hello: true });
          });
        });

        client.on("message", (_topic, payload) => {
          if (stopped) return;
          try {
            handleEnvelope(JSON.parse(payload.toString()));
          } catch {
            /* not ours, ignore */
          }
        });

        client.on("error", () => {
          if (!opened && !stopped) {
            clearTimeout(timer);
            this.stop();
            handlers.onFail("the connection service refused the connection");
          }
        });
      },
      send(message) {
        publish({ data: message });
      },
      isOpen() {
        return opened;
      },
      stop() {
        stopped = true;
        try {
          if (client) {
            if (opened) publish({ bye: true });
            client.end(true);
          }
        } catch {
          /* already gone */
        }
        client = null;
      },
    };
  }

  // ------------------------------------------------------------------ p2p

  function createPeerTransport() {
    let peer = null;
    let conn = null;
    let stopped = false;
    let handlers = {};
    let timer = null;

    const iceConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    };

    function attach(connection) {
      conn = connection;
      conn.on("open", () => {
        clearTimeout(timer);
        if (!stopped) handlers.onOpen();
      });
      conn.on("data", (data) => {
        if (!stopped) handlers.onData(data);
      });
      conn.on("close", () => {
        if (!stopped) handlers.onClose();
      });
    }

    return {
      name: "p2p",
      start(opts) {
        handlers = opts;
        if (typeof Peer === "undefined") {
          handlers.onFail("the peer-to-peer library didn't load");
          return;
        }
        const id = `babegames-${roomCode}`;
        peer = isHost ? new Peer(id, { config: iceConfig }) : new Peer({ config: iceConfig });

        peer.on("open", () => {
          if (stopped) return;
          handlers.onReady();
          if (!isHost) attach(peer.connect(id, { reliable: true }));
        });
        if (isHost) peer.on("connection", (c) => !stopped && attach(c));
        peer.on("error", () => {
          if (!stopped && (!conn || !conn.open)) {
            this.stop();
            handlers.onFail("couldn't open a direct connection");
          }
        });

        timer = setTimeout(() => {
          if (!conn || !conn.open) {
            this.stop();
            handlers.onFail("the direct connection timed out");
          }
        }, P2P_CONNECT_MS);
      },
      send(message) {
        if (conn && conn.open) conn.send(message);
      },
      isOpen() {
        return !!(conn && conn.open);
      },
      stop() {
        stopped = true;
        clearTimeout(timer);
        try {
          if (conn) conn.close();
          if (peer) peer.destroy();
        } catch {
          /* already gone */
        }
        conn = null;
        peer = null;
      },
    };
  }

  // -------------------------------------------------------- orchestration

  // Both sides walk the same list in the same order, so they converge on the
  // same transport without having to negotiate one.
  function buildAttempts() {
    return BROKERS.map((url) => () => createRelayTransport(url)).concat([() => createPeerTransport()]);
  }

  function connect() {
    return new Promise((resolve, reject) => {
      const attempts = buildAttempts();
      let index = 0;
      let waitTimer = null;

      function tryNext(reason) {
        clearTimeout(waitTimer);
        if (transport) {
          transport.stop();
          transport = null;
        }
        if (index >= attempts.length) {
          emitState("failed", reason || "couldn't connect");
          reject(new Error(reason || "couldn't connect"));
          return;
        }

        const candidate = attempts[index++]();
        transport = candidate;
        transportName = candidate.name;
        const label = candidate.name === "relay" ? `route ${index} of ${attempts.length}` : "direct connection";
        setStatus(`Trying ${label}…`);

        candidate.start({
          onReady() {
            // We're on the network; now wait for the other player.
            setStatus(isHost ? "Room is open — waiting for them to join…" : "Room found — saying hello…");
            if (!isHost) {
              waitTimer = setTimeout(() => {
                if (!candidate.isOpen()) tryNext("no answer from the room");
              }, GUEST_WAIT_MS);
            }
          },
          onOpen() {
            clearTimeout(waitTimer);
            setStatus("Connected");
            emitState("connected", { roomCode, isHost, via: candidate.name });
            resolve(candidate.name);
          },
          onData(data) {
            emitData(data);
          },
          onClose() {
            emitState("disconnected");
          },
          onFail(reason) {
            if (candidate.isOpen()) return; // already playing, ignore late noise
            tryNext(reason);
          },
        });
      }

      tryNext(null);
    });
  }

  function createRoom() {
    disconnect();
    isHost = true;
    // Set before connecting, so the code can be shared while we're still
    // finding a route.
    roomCode = genCode();
    return connect().then(() => roomCode);
  }

  function joinRoom(code) {
    disconnect();
    isHost = false;
    roomCode = String(code || "").trim().toUpperCase();
    return connect();
  }

  function send(message) {
    if (transport && transport.isOpen()) transport.send(message);
  }

  function onData(cb) { dataListeners.push(cb); }
  function onState(cb) { stateListeners.push(cb); }

  function disconnect() {
    if (transport) {
      transport.stop();
      transport = null;
    }
    transportName = null;
    roomCode = null;
  }

  return {
    createRoom,
    joinRoom,
    send,
    onData,
    onState,
    disconnect,
    genCode,
    get isHost() { return isHost; },
    get roomCode() { return roomCode; },
    get connected() { return !!(transport && transport.isOpen()); },
    get via() { return transportName; },
    get status() { return lastStatus; },
  };
})();

// ---- Reusable lobby UI (room create / join modal) ----

const BabeOnlineUI = (function () {
  let onConnectedCallback = null;
  let onDisconnectedCallback = null;
  let pendingCode = null;

  function ensureModal() {
    if (document.getElementById("online-modal")) return;
    const overlay = document.createElement("div");
    overlay.id = "online-modal";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3 style="margin-top:0;">Play Online</h3>
        <p style="color:var(--text-dim); font-size:0.9rem;">Just the two of you &mdash; share the code with your partner.</p>
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
          <div class="btn-row" style="justify-content:center;">
            <button class="btn secondary small" id="online-copy-link-btn">Copy invite link</button>
          </div>
          <div class="connect-status" id="online-status-text">Starting&hellip;</div>
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
    overlay.querySelector("#online-retry-btn").addEventListener("click", () => {
      BabeOnline.disconnect();
      showIdle();
    });

    overlay.querySelector("#online-copy-link-btn").addEventListener("click", () => {
      const code = BabeOnline.roomCode || pendingCode;
      if (!code) return;
      const url = new URL(location.href);
      url.searchParams.set("room", code);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url.toString()).catch(() => {});
      }
      const btn = document.getElementById("online-copy-link-btn");
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = original), 1500);
    });

    BabeOnline.onState((state, detail) => {
      if (state === "status") {
        const el = document.getElementById("online-status-text");
        if (el) el.textContent = detail;
      } else if (state === "connected") {
        document.getElementById("online-waiting").style.display = "none";
        document.getElementById("online-connected").style.display = "block";
        if (onConnectedCallback) setTimeout(() => onConnectedCallback(detail), 600);
      } else if (state === "failed") {
        showError(
          `Couldn't connect (${detail}). Check you're both online, make sure the code is fresh, ` +
          `and open the link in your normal browser rather than inside WhatsApp or Instagram.`
        );
      } else if (state === "disconnected") {
        if (onDisconnectedCallback) onDisconnectedCallback();
      }
    });
  }

  async function startCreate() {
    showWaiting();
    try {
      // The code exists as soon as this is called, so it can be shared
      // while we're still finding a route.
      const connecting = BabeOnline.createRoom();
      pendingCode = BabeOnline.roomCode;
      document.getElementById("online-code-display").textContent = pendingCode;
      await connecting;
    } catch {
      /* the state listener already reported it */
    }
  }

  async function startJoin(code) {
    showWaiting();
    document.getElementById("online-code-display").textContent = code.toUpperCase();
    document.getElementById("online-copy-link-btn").style.display = "none";
    try {
      await BabeOnline.joinRoom(code);
    } catch {
      /* the state listener already reported it */
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
    document.getElementById("online-error-text").textContent = message;
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

  return { openLobby, close: closeModal };
})();
