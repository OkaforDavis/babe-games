// One controller for both local pass-and-play and online play.
//
// The model is host-authoritative: exactly one side (the host online, or
// simply "this device" locally) owns the state and is the only place rules
// ever run. The guest sends intents and renders whatever state comes back.
// That means local and online play share the same rules code and can't
// drift apart, and it's impossible for the two devices to disagree.

const BabeGame = (function () {
  function create(spec) {
    const rules = spec.rules;

    let mode = null; // "local" | "online"
    let isHost = true;
    let mySlot = 0;
    let state = null;
    let timerHandle = null;
    let peerName = null;
    let localName = "Player";
    let wired = false;
    let lastMatchId = null;

    function authority() {
      return mode === "local" || isHost;
    }

    function view() {
      return {
        mode,
        isOnline: mode === "online",
        isHost,
        mySlot,
        peerName,
        names: state ? state.names : [],
        // Locally everyone shares the screen, so any seat can act.
        controls(slot) {
          return mode === "local" || slot === mySlot;
        },
      };
    }

    // A fresh match (first game, or a rematch started by the host) has a new
    // id, which is how the other device knows to leave the lobby/end screen
    // and show the board.
    function noticeMatchChange() {
      if (!state || state.matchId === lastMatchId) return;
      lastMatchId = state.matchId;
      if (spec.onMatchStart) spec.onMatchStart(view());
    }

    function render() {
      if (!state) return;
      noticeMatchChange();
      spec.render(state, view());
      if (rules.isOver(state)) {
        stopTimer();
        if (spec.onOver) spec.onOver(state, view());
      }
    }

    function broadcast() {
      if (mode !== "online" || !isHost) return;
      const payload = rules.redact ? rules.redact(state, 1) : state;
      BabeOnline.send({ t: "state", state: payload });
    }

    function commit(next) {
      state = next;
      broadcast();
      render();
      syncTimer();
    }

    function dispatch(action, slotOverride) {
      if (!state) return false;
      const slot = slotOverride != null
        ? slotOverride
        : mode === "local"
        ? state.turn != null ? state.turn : 0
        : mySlot;

      if (authority()) {
        const next = rules.applyAction(state, action, slot);
        if (!next) {
          if (spec.onReject) spec.onReject(action, slot, state);
          return false;
        }
        commit(next);
        return true;
      }

      BabeOnline.send({ t: "action", action, slot: mySlot });
      return true;
    }

    // ---- timers (authority only; ticks reach the guest as state) ----

    function syncTimer() {
      const wants = authority() && !!rules.tick && !!rules.wantsTimer && rules.wantsTimer(state);
      const hidden = typeof document !== "undefined" && document.hidden;
      if (wants && !hidden && !timerHandle) timerHandle = setInterval(onTick, 1000);
      if (!wants || hidden) stopTimer();
    }

    function stopTimer() {
      if (timerHandle) clearInterval(timerHandle);
      timerHandle = null;
    }

    function onTick() {
      if (!state || !authority()) return stopTimer();
      const next = rules.tick(state);
      if (next) commit(next);
      else syncTimer();
    }

    // Phones suspend a backgrounded tab: intervals stop firing and animation
    // frames never run, which used to leave a game wedged half-finished when
    // you came back. The clock pauses while you're away rather than running
    // down behind your back, and everything is redrawn on return so the
    // board is always live again.
    function handleVisibility() {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        stopTimer();
        if (spec.onHidden) spec.onHidden(view());
        return;
      }
      if (!state) return;
      render();
      syncTimer();
    }

    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("pageshow", handleVisibility);
      window.addEventListener("focus", handleVisibility);
    }

    // ---- local play ----

    let lastMatchIssued = 0;

    function newMatch(config) {
      // Strictly increasing, so two matches started in the same millisecond
      // (a quick rematch) still read as different matches on both devices.
      lastMatchIssued = Math.max(Date.now(), lastMatchIssued + 1);
      return { ...rules.createState(config), matchId: lastMatchIssued };
    }

    function startLocal(config) {
      mode = "local";
      isHost = true;
      mySlot = 0;
      commit(newMatch(config));
    }

    // ---- online play ----

    function wireMessages() {
      if (wired) return;
      wired = true;

      BabeOnline.onData((msg) => {
        if (!msg || typeof msg !== "object") return;

        if (msg.t === "hello") {
          peerName = String(msg.name || "Player").slice(0, 24);
          if (spec.onPeerReady) spec.onPeerReady(peerName, view());
          // Someone joining while a game is already running is a rejoin
          // after a dropped connection — send them the board so they pick
          // up exactly where things were.
          if (isHost && state && !rules.isOver(state)) broadcast();
          return;
        }
        if (msg.t === "state" && !isHost) {
          state = msg.state;
          render();
          return;
        }
        if (msg.t === "action" && isHost && state) {
          const next = rules.applyAction(state, msg.action, msg.slot);
          if (next) commit(next);
        }
      });

      BabeOnline.onState((s) => {
        if (s === "disconnected" && mode === "online") {
          stopTimer();
          if (spec.onPeerLost) spec.onPeerLost(view());
        }
      });
    }

    function startOnline(options = {}) {
      localName = options.myName || localName;
      wireMessages();
      BabeOnlineUI.openLobby({
        autoJoinCode: options.autoJoinCode,
        onConnected: () => {
          mode = "online";
          isHost = BabeOnline.isHost;
          mySlot = isHost ? 0 : 1;
          BabeOnlineUI.close();
          BabeOnline.send({ t: "hello", name: localName });
          if (spec.onConnected) spec.onConnected(view());
        },
        onDisconnected: () => {
          stopTimer();
          if (spec.onPeerLost) spec.onPeerLost(view());
        },
      });
    }

    // Host kicks the match off once both names are known.
    function hostStart(config) {
      if (!authority()) return;
      const names = mode === "online"
        ? [localName, peerName || "Partner"]
        : config.names;
      commit(newMatch({ ...config, names, simultaneous: mode === "online" }));
    }

    return {
      startLocal,
      startOnline,
      hostStart,
      dispatch,
      render,
      stopTimer,
      get state() { return state; },
      get view() { return view(); },
      get mode() { return mode; },
      get isHost() { return isHost; },
      get mySlot() { return mySlot; },
      get peerName() { return peerName; },
      setLocalName(name) { localName = name || "Player"; },
      leave() {
        stopTimer();
        if (mode === "online") BabeOnline.disconnect();
        mode = null;
        state = null;
        peerName = null;
      },
    };
  }

  // Games all share the same "?room=CODE" invite-link behaviour.
  function roomCodeFromLink() {
    try {
      return new URLSearchParams(location.search).get("room");
    } catch {
      return null;
    }
  }

  function myDisplayName(fallbackInput) {
    const active = typeof BabeProfiles !== "undefined" ? BabeProfiles.getActive() : null;
    if (active && active.name) return active.name;
    if (fallbackInput && fallbackInput.value.trim()) return fallbackInput.value.trim();
    return "Player";
  }

  return { create, roomCodeFromLink, myDisplayName };
})();
