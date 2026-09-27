// Shared helpers used by every game page.

const Storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable, ignore */
    }
  },
};

function pushHighScore(gameId, entry, keep = 10) {
  const key = `babe-games:${gameId}:scores`;
  const list = Storage.get(key, []);
  list.push({ ...entry, at: Date.now() });
  list.sort((a, b) => b.score - a.score);
  Storage.set(key, list.slice(0, keep));
  return list;
}

function getHighScores(gameId) {
  return Storage.get(`babe-games:${gameId}:scores`, []);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatSeconds(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function setTimerClass(el, secondsLeft, total) {
  if (!el) return;
  el.classList.remove("warn", "critical");
  if (!total) return;
  if (secondsLeft <= total * 0.15) el.classList.add("critical");
  else if (secondsLeft <= total * 0.4) el.classList.add("warn");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}
