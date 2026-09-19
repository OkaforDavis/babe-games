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

function scrambleWord(word) {
  const letters = word.split("");
  let attempt = letters.join("");
  let tries = 0;
  // avoid an unscrambled result when possible
  while (attempt.toLowerCase() === word.toLowerCase() && tries < 10) {
    attempt = shuffleArray(letters).join("");
    tries++;
  }
  return attempt;
}

/**
 * Simple countdown timer.
 * onTick(secondsLeft), onEnd() called once when it hits zero.
 */
class CountdownTimer {
  constructor(totalSeconds, onTick, onEnd) {
    this.total = totalSeconds;
    this.secondsLeft = totalSeconds;
    this.onTick = onTick;
    this.onEnd = onEnd;
    this.handle = null;
  }
  start() {
    this.stop();
    this.onTick(this.secondsLeft);
    this.handle = setInterval(() => {
      this.secondsLeft -= 1;
      if (this.secondsLeft <= 0) {
        this.secondsLeft = 0;
        this.onTick(this.secondsLeft);
        this.stop();
        this.onEnd();
      } else {
        this.onTick(this.secondsLeft);
      }
    }, 1000);
  }
  stop() {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }
  addSeconds(n) {
    this.secondsLeft = Math.max(0, this.secondsLeft + n);
    this.onTick(this.secondsLeft);
  }
}

function formatSeconds(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function setTimerClass(el, secondsLeft, total) {
  el.classList.remove("warn", "critical");
  if (secondsLeft <= total * 0.15) el.classList.add("critical");
  else if (secondsLeft <= total * 0.4) el.classList.add("warn");
}
