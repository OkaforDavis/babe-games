// Notifications + sound, the same way an installed website behaves on
// Android: a permission prompt, a system notification with our own sound
// cue, using the service worker so it also works once installed as a PWA.
// This only fires while the app/tab is open or running in the background
// after being installed — true "closed app" push needs a paid backend
// trigger, which this project intentionally does not use.

const BabeNotify = (function () {
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function beep(freq = 880, duration = 140, delay = 0, volume = 0.15) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const startAt = ctx.currentTime + delay;
    osc.start(startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration / 1000);
    osc.stop(startAt + duration / 1000 + 0.02);
  }

  const SOUNDS = {
    turn: () => beep(660, 120),
    tick: () => beep(440, 80, 0, 0.08),
    success: () => {
      beep(523, 100, 0);
      beep(784, 140, 0.1);
    },
    fail: () => beep(200, 220, 0, 0.18),
    win: () => {
      beep(523, 100, 0);
      beep(659, 100, 0.12);
      beep(784, 200, 0.24);
    },
  };

  function playSound(name) {
    const fn = SOUNDS[name] || SOUNDS.turn;
    try {
      fn();
    } catch {
      /* audio unavailable, ignore */
    }
  }

  function registerServiceWorker(basePath = "./") {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(`${basePath}service-worker.js`, { scope: basePath })
      .catch(() => {});
  }

  function permissionState() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  }

  async function requestPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "default") {
      return Notification.requestPermission();
    }
    return Notification.permission;
  }

  async function notify(title, body, { sound = "turn", basePath = "./" } = {}) {
    playSound(sound);
    if (permissionState() !== "granted") return;
    const options = {
      body,
      icon: `${basePath}icons/icon-192.png`,
      badge: `${basePath}icons/icon-192.png`,
      silent: true, // we play our own cue via playSound instead of the OS default
      tag: "babe-games",
    };
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
    } catch {
      /* notifications unavailable, sound cue already played */
    }
  }

  function renderWidget(basePath = "./") {
    const widget = document.getElementById("notify-widget");
    if (!widget) return;

    function draw() {
      const state = permissionState();
      let label = "\u{1F514} Enable alerts";
      if (state === "granted") label = "\u{1F514} Alerts on";
      if (state === "denied") label = "\u{1F515} Alerts blocked";
      widget.innerHTML = `<button type="button" class="btn secondary small" id="notify-btn" ${state === "denied" ? "disabled" : ""}>${label}</button>`;
      const btn = document.getElementById("notify-btn");
      if (btn) {
        btn.addEventListener("click", async () => {
          await requestPermission();
          draw();
          if (permissionState() === "granted") {
            notify("Babe Games", "Nice — you'll get a ping for your turn and results.", { sound: "success", basePath });
          }
        });
      }
    }
    draw();
  }

  function init(basePath = "./") {
    registerServiceWorker(basePath);
    document.addEventListener("DOMContentLoaded", () => renderWidget(basePath));
  }

  return { init, notify, playSound, requestPermission, permissionState };
})();
