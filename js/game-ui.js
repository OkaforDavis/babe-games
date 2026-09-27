// Shared page furniture: screen switching, the online status bar, the
// "your turn" alerts. Every game wires itself up the same way through this,
// so online play behaves identically everywhere.

const BabeGameUI = (function () {
  function el(id) {
    return document.getElementById(id);
  }

  function showScreen(name) {
    ["setup-screen", "play-screen", "end-screen"].forEach((id) => {
      const node = el(id);
      if (node) node.style.display = id === name ? "block" : "none";
    });
  }

  function setBar(html, tone = "") {
    const bar = el("online-bar");
    if (!bar) return;
    bar.className = "online-bar" + (tone ? " " + tone : "");
    bar.innerHTML = html;
    bar.style.display = html ? "block" : "none";
  }

  // Wires the two start buttons and all the online lifecycle messaging.
  function bind(options) {
    const {
      game,
      getConfig,          // () => config object for the rules
      getLocalNames,      // () => [name, name] for same-device play
      onStarted,          // called once a match actually begins
    } = options;

    const startLocalBtn = el("start-local");
    const startOnlineBtn = el("start-online");

    function localName() {
      const names = getLocalNames ? getLocalNames() : [];
      return BabeGame.myDisplayName({ value: names[0] || "" });
    }

    if (startLocalBtn) {
      startLocalBtn.addEventListener("click", () => {
        const names = getLocalNames ? getLocalNames() : ["Player 1", "Player 2"];
        game.startLocal({ ...getConfig(), names });
        setBar("");
        showScreen("play-screen");
        if (onStarted) onStarted("local");
      });
    }

    if (startOnlineBtn) {
      startOnlineBtn.addEventListener("click", () => {
        game.setLocalName(localName());
        game.startOnline({ myName: localName() });
      });
    }

    // Auto-join when someone opens a shared invite link.
    document.addEventListener("DOMContentLoaded", () => {
      const code = BabeGame.roomCodeFromLink();
      if (!code) return;
      game.setLocalName(localName());
      game.startOnline({ myName: localName(), autoJoinCode: code });
    });

    function renderLobbyBar() {
      const view = game.view;
      if (!view.isOnline) return;
      const peer = view.peerName;
      if (view.isHost) {
        if (!peer) {
          setBar("Connected. Waiting for your partner to say hello&hellip;");
          return;
        }
        setBar(
          `<strong>${escapeHtml(peer)}</strong> is in the room. You're the host &mdash; set the options above, then start.` +
            `<div class="btn-row" style="justify-content:center;"><button class="btn small" id="host-start-btn">Start match</button></div>`,
          "ok"
        );
        const hostStartBtn = el("host-start-btn");
        if (hostStartBtn) {
          hostStartBtn.addEventListener("click", () => {
            game.hostStart(getConfig());
            if (onStarted) onStarted("online");
          });
        }
      } else {
        setBar(
          `Connected to <strong>${escapeHtml(peer || "your partner")}</strong>. Waiting for them to start the match&hellip;`,
          "ok"
        );
      }
    }

    return {
      renderLobbyBar,
      handleConnected() {
        showScreen("setup-screen");
        renderLobbyBar();
      },
      handlePeerReady() {
        renderLobbyBar();
      },
      handlePeerLost() {
        // The game isn't thrown away: the host keeps the board, and whoever
        // dropped can come back in on the same code and carry on.
        const code = BabeOnline.roomCode;
        if (game.isHost && code) {
          setBar(
            `Connection dropped. The game is still here &mdash; they can rejoin with code <strong>${escapeHtml(code)}</strong>.`,
            "bad"
          );
        } else {
          setBar("Connection dropped. Tap Play Online and enter the same code to pick up where you left off.", "bad");
        }
      },
    };
  }

  return { el, showScreen, setBar, bind };
})();
