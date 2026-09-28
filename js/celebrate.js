// How a game ends should feel good either way: a win gets a proper little
// celebration, and losing gets warmth rather than a verdict. Nothing here
// says "you lost" — it names who took it, points out how close it was, and
// invites another round.

const BabeCelebrate = (function () {
  const COLORS = ["#ff7a3d", "#ffd23f", "#35e0a1", "#ff4d97", "#4db5ff", "#f5f0ff"];

  function reduceMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  function confetti(pieces = 70) {
    if (reduceMotion()) return;
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    document.body.appendChild(layer);

    for (let i = 0; i < pieces; i++) {
      const bit = document.createElement("i");
      bit.className = "confetti-bit";
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = COLORS[i % COLORS.length];
      bit.style.animationDelay = `${Math.random() * 0.5}s`;
      bit.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
      bit.style.transform = `rotate(${Math.random() * 360}deg)`;
      if (i % 3 === 0) bit.style.borderRadius = "50%";
      layer.appendChild(bit);
    }
    setTimeout(() => layer.remove(), 4200);
  }

  // outcome: "win" | "close" | "tie" | "done"
  function show({ outcome, title, subtitle, titleEl, subtitleEl }) {
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.className = `result-title ${outcome}`;
      // restart the entrance animation even if the class was already there
      titleEl.style.animation = "none";
      void titleEl.offsetWidth;
      titleEl.style.animation = "";
    }
    if (subtitleEl) {
      subtitleEl.textContent = subtitle || "";
      subtitleEl.className = "result-subtitle";
    }
    if (outcome === "win") confetti();
  }

  // Works out the kindest honest framing from the two scores.
  function describe({ isOnline, mySlot, winner, names, scores, unit = "" }) {
    const tie = winner === -1 || winner == null;
    const gap = scores && scores.length === 2 ? Math.abs(scores[0] - scores[1]) : null;
    const closeness = gap != null && gap > 0 && gap <= 4
      ? `Only ${gap}${unit ? " " + unit : ""} in it.`
      : "";

    if (tie) {
      return { outcome: "tie", title: "Dead level!", subtitle: "Nothing to separate you. Go again?" };
    }

    if (!isOnline) {
      return {
        outcome: "win",
        title: `${names[winner]} takes it!`,
        subtitle: closeness || "Good game. Another round?",
      };
    }

    if (winner === mySlot) {
      return {
        outcome: "win",
        title: "You win!",
        subtitle: closeness ? `${closeness} Well played.` : "Nicely done.",
      };
    }

    return {
      outcome: "close",
      title: `${names[winner]} takes this one`,
      subtitle: closeness ? `${closeness} Your turn to even it up.` : "Good game — go again?",
    };
  }

  return { show, describe, confetti };
})();
