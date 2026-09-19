// Lightweight local "login": no password, no server — just a picked name
// remembered on this device via localStorage. Meant for two people sharing
// one device/browser (e.g. you + your partner), not public accounts.

const BabeProfiles = (function () {
  const PROFILES_KEY = "babe-games:profiles";
  const ACTIVE_KEY = "babe-games:activeProfileId";
  const EMOJIS = ["\u{1F60E}", "\u{1F60D}", "\u{1F451}", "\u{1F3AE}", "✨", "\u{1F525}", "\u{1F337}", "⚡"];
  const listeners = [];

  function getProfiles() {
    return Storage.get(PROFILES_KEY, []);
  }

  function saveProfiles(list) {
    Storage.set(PROFILES_KEY, list);
  }

  function getActive() {
    const id = Storage.get(ACTIVE_KEY, null);
    if (!id) return null;
    return getProfiles().find((p) => p.id === id) || null;
  }

  function setActive(id) {
    Storage.set(ACTIVE_KEY, id);
    notify();
  }

  function logout() {
    Storage.set(ACTIVE_KEY, null);
    notify();
  }

  function createProfile(name, emoji) {
    const profiles = getProfiles();
    const profile = {
      id: `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: name.trim() || "Player",
      emoji: emoji || pickRandom(EMOJIS),
      createdAt: Date.now(),
    };
    profiles.push(profile);
    saveProfiles(profiles);
    setActive(profile.id);
    return profile;
  }

  function deleteProfile(id) {
    saveProfiles(getProfiles().filter((p) => p.id !== id));
    if (getActive() === null) notify();
  }

  function onChange(cb) {
    listeners.push(cb);
  }

  function notify() {
    listeners.forEach((cb) => cb(getActive()));
    renderWidget();
  }

  // ---- UI ----

  function ensureModal() {
    if (document.getElementById("profile-modal")) return;
    const overlay = document.createElement("div");
    overlay.id = "profile-modal";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3 style="margin-top:0;">Who's playing?</h3>
        <div id="profile-list" class="profile-list"></div>
        <div class="rules" style="margin-top:16px;">
          <div class="field" style="margin-bottom:10px;">
            <label for="new-profile-name">Add a new player</label>
            <input type="text" id="new-profile-name" placeholder="Name" />
          </div>
          <div class="emoji-picker" id="emoji-picker"></div>
          <div class="btn-row">
            <button class="btn small" id="create-profile-btn">Create</button>
            <button class="btn secondary small" id="close-profile-modal">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const emojiPicker = overlay.querySelector("#emoji-picker");
    let chosenEmoji = EMOJIS[0];
    EMOJIS.forEach((e) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "letter-btn emoji-btn";
      btn.textContent = e;
      btn.addEventListener("click", () => {
        chosenEmoji = e;
        [...emojiPicker.children].forEach((c) => c.classList.remove("chosen"));
        btn.classList.add("chosen");
      });
      emojiPicker.appendChild(btn);
    });
    emojiPicker.firstChild.classList.add("chosen");

    overlay.querySelector("#create-profile-btn").addEventListener("click", () => {
      const input = overlay.querySelector("#new-profile-name");
      if (!input.value.trim()) {
        input.focus();
        return;
      }
      createProfile(input.value, chosenEmoji);
      input.value = "";
      closeModal();
    });

    overlay.querySelector("#close-profile-modal").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  function renderProfileList() {
    const list = document.getElementById("profile-list");
    if (!list) return;
    const profiles = getProfiles();
    const active = getActive();
    list.innerHTML = "";
    if (profiles.length === 0) {
      list.innerHTML = `<p style="color:var(--text-dim); font-size:0.9rem;">No players yet — add one below.</p>`;
      return;
    }
    profiles.forEach((p) => {
      const row = document.createElement("div");
      row.className = "profile-row" + (active && active.id === p.id ? " active" : "");
      row.innerHTML = `
        <span class="profile-emoji">${p.emoji}</span>
        <span class="profile-name">${p.name}</span>
        <button type="button" class="btn small" data-select>${active && active.id === p.id ? "Selected" : "Select"}</button>
        <button type="button" class="btn secondary small" data-delete title="Remove">&times;</button>
      `;
      row.querySelector("[data-select]").addEventListener("click", () => {
        setActive(p.id);
        closeModal();
      });
      row.querySelector("[data-delete]").addEventListener("click", () => {
        deleteProfile(p.id);
        renderProfileList();
      });
      list.appendChild(row);
    });
  }

  function openModal() {
    ensureModal();
    renderProfileList();
    document.getElementById("profile-modal").style.display = "flex";
  }

  function closeModal() {
    const modal = document.getElementById("profile-modal");
    if (modal) modal.style.display = "none";
  }

  function renderWidget() {
    const widget = document.getElementById("profile-widget");
    if (!widget) return;
    const active = getActive();
    if (active) {
      widget.innerHTML = `
        <button type="button" class="profile-chip" id="profile-chip-btn">
          <span class="profile-emoji">${active.emoji}</span> ${active.name}
        </button>
      `;
    } else {
      widget.innerHTML = `<button type="button" class="btn small" id="profile-chip-btn">Login</button>`;
    }
    document.getElementById("profile-chip-btn").addEventListener("click", openModal);
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureModal();
    renderWidget();
    if (!getActive()) {
      // gentle first-visit nudge, not forced
      setTimeout(openModal, 400);
    }
  });

  return { getProfiles, getActive, setActive, logout, createProfile, deleteProfile, onChange, openModal };
})();
