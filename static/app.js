"use strict";

const $ = (sel) => document.querySelector(sel);
const NAME_KEY = "chips_name";

let me = localStorage.getItem(NAME_KEY) || "";
let tab = "rate";
let state = { chips: [], revealed: false, you: "" };
let pollTimer = null;
let typing = false; // pause le polling pendant qu'on bouge un slider / tape

// --------------------------------------------------------------------------
// Démarrage
// --------------------------------------------------------------------------
function boot() {
  if (me) {
    startApp();
  } else {
    $("#login").classList.remove("hidden");
    $("#name-input").focus();
  }
}

$("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#name-input").value.replace(/\s+/g, " ").trim();
  if (!v) return;
  me = v;
  localStorage.setItem(NAME_KEY, me);
  $("#login").classList.add("hidden");
  startApp();
});

function startApp() {
  $("#app").classList.remove("hidden");
  $("#who").textContent = "👋 " + me;
  refresh();
  pollTimer = setInterval(() => { if (!typing) refresh(); }, 4000);
}

// Changer de prénom
$("#who").addEventListener("click", () => {
  const v = prompt("Ton prénom :", me);
  if (v && v.replace(/\s+/g, " ").trim()) {
    me = v.replace(/\s+/g, " ").trim();
    localStorage.setItem(NAME_KEY, me);
    $("#who").textContent = "👋 " + me;
    refresh();
  }
});

// --------------------------------------------------------------------------
// Réseau
// --------------------------------------------------------------------------
async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
}

async function refresh() {
  try {
    const data = await api(`/api/state?name=${encodeURIComponent(me)}`);
    if (data && Array.isArray(data.chips)) {
      state = data;
      render();
    }
  } catch (_) { /* silencieux */ }
}

// --------------------------------------------------------------------------
// Navigation
// --------------------------------------------------------------------------
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    tab = btn.dataset.tab;
    document.querySelectorAll(".nav-btn").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    $("#tab-rate").classList.toggle("hidden", tab !== "rate");
    $("#tab-mine").classList.toggle("hidden", tab !== "mine");
    $("#tab-rank").classList.toggle("hidden", tab !== "rank");
    render();
  });
});

// --------------------------------------------------------------------------
// Rendu
// --------------------------------------------------------------------------
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function avgBadge(c) {
  if (c.avg == null) {
    return `<div class="avg empty"><div class="avg-num">–</div><div class="avg-votes">0 vote</div></div>`;
  }
  return `<div class="avg"><div class="avg-num">${c.avg}<small>/10</small></div>` +
    `<div class="avg-votes">${c.count} vote${c.count > 1 ? "s" : ""}</div></div>`;
}

function render() {
  if (tab === "rate") renderRate();
  else if (tab === "mine") renderMine();
  else renderRank();
  updateRevealUI();
}

// ---- Onglet Noter ----
function renderRate() {
  const list = $("#rate-list");
  const toRate = state.chips.filter((c) => !c.mine);
  if (toRate.length === 0) {
    list.innerHTML = emptyMsg("🍟", "Aucune chips à noter pour l'instant.<br>Reviens quand les copains auront ajouté leurs paquets&nbsp;!");
    return;
  }
  list.innerHTML = toRate.map((c) => {
    const has = c.myScore != null;
    const val = has ? c.myScore : 5;
    const fill = (val / 10) * 100;
    return `
    <div class="card" data-id="${c.id}">
      <div class="card-head">
        <div>
          <div class="card-name">${esc(c.name)}</div>
          <div class="card-by">ramenées par ${esc(c.broughtBy)}</div>
        </div>
        ${avgBadge(c)}
      </div>
      <div class="rate-row">
        <div class="rate-top">
          <span class="rate-label">Ta note</span>
          <span class="rate-value ${has ? "" : "unset"}">${has ? c.myScore + " /10" : "pas encore notée"}</span>
        </div>
        <input type="range" min="0" max="10" step="0.5" value="${val}" style="--fill:${fill}%" />
        <div class="scale"><span>0</span><span>5</span><span>10</span></div>
      </div>
    </div>`;
  }).join("");

  // brancher les sliders
  list.querySelectorAll(".card").forEach((card) => {
    const id = card.dataset.id;
    const range = card.querySelector("input[type=range]");
    const valEl = card.querySelector(".rate-value");
    range.addEventListener("input", () => {
      typing = true;
      const v = parseFloat(range.value);
      range.style.setProperty("--fill", (v / 10) * 100 + "%");
      valEl.textContent = v + " /10";
      valEl.classList.remove("unset");
    });
    const commit = () => {
      const v = parseFloat(range.value);
      saveRating(id, v);
      setTimeout(() => { typing = false; }, 600);
    };
    range.addEventListener("change", commit);
    range.addEventListener("pointerup", commit);
  });
}

let saveTimers = {};
async function saveRating(chipId, score) {
  clearTimeout(saveTimers[chipId]);
  saveTimers[chipId] = setTimeout(async () => {
    const r = await api("/api/rate", { chipId, voter: me, score });
    if (r && r.ok) {
      toast("Noté ✓ " + score + "/10");
      // maj locale optimiste
      const c = state.chips.find((x) => x.id === chipId);
      if (c) c.myScore = score;
    } else if (r && r.error) {
      toast(r.error, true);
    }
  }, 250);
}

// ---- Onglet Mes chips ----
$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chip-input");
  const name = input.value.replace(/\s+/g, " ").trim();
  if (!name) return;
  input.value = "";
  const r = await api("/api/chips", { name, broughtBy: me });
  if (r && r.ok) { toast("Ajouté 🧺"); refresh(); }
  else toast("Erreur", true);
});

function renderMine() {
  const list = $("#mine-list");
  const mine = state.chips.filter((c) => c.mine);
  if (mine.length === 0) {
    list.innerHTML = emptyMsg("🧺", "Tu n'as pas encore ajouté de chips.<br>Ajoute tes paquets ci-dessus&nbsp;!");
    return;
  }
  list.innerHTML = mine.map((c) => `
    <div class="card mine-card" data-id="${c.id}">
      <div>
        <div class="card-name">${esc(c.name)}</div>
        <div class="card-by">${c.count} vote${c.count > 1 ? "s" : ""} reçu${c.count > 1 ? "s" : ""}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        ${avgBadge(c)}
        <button class="del-btn" title="Supprimer">🗑</button>
      </div>
    </div>`).join("");

  list.querySelectorAll(".mine-card").forEach((card) => {
    card.querySelector(".del-btn").addEventListener("click", async () => {
      if (!confirm("Supprimer ce paquet et ses notes ?")) return;
      const r = await api("/api/chips/delete", { id: card.dataset.id, name: me });
      if (r && r.ok) { toast("Supprimé"); refresh(); }
      else toast(r.error || "Erreur", true);
    });
  });
}

// ---- Onglet Classement ----
function renderRank() {
  const list = $("#rank-list");
  const ranked = state.chips
    .filter((c) => c.count > 0)
    .sort((a, b) => b.avg - a.avg || b.count - a.count);
  const noVotes = state.chips.filter((c) => c.count === 0);

  if (ranked.length === 0) {
    list.innerHTML = emptyMsg("🏆", "Pas encore de notes.<br>Le classement apparaîtra ici&nbsp;!");
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  let html = ranked.map((c, i) => {
    const pos = medals[i] || (i + 1);
    const notesHtml = state.revealed && c.notes
      ? `<div class="notes">${c.notes.map((n) =>
          `<span class="note-chip"><b>${esc(n.voter)}</b> ${n.score}</span>`).join("")}</div>`
      : "";
    return `
    <div class="card rank-${i + 1}">
      <div class="rank-card">
        <div class="rank-pos">${pos}</div>
        <div class="rank-body">
          <div class="rank-name">${esc(c.name)}</div>
          <div class="rank-meta">par ${esc(c.broughtBy)} · ${c.count} vote${c.count > 1 ? "s" : ""}</div>
        </div>
        <div class="rank-avg">${c.avg}<small>/10</small></div>
      </div>
      ${notesHtml}
    </div>`;
  }).join("");

  if (noVotes.length) {
    html += `<div class="rank-meta" style="margin:14px 2px 4px;color:var(--muted)">En attente de votes :</div>`;
    html += noVotes.map((c) => `
      <div class="card" style="opacity:.6">
        <div class="rank-card">
          <div class="rank-pos">–</div>
          <div class="rank-body">
            <div class="rank-name">${esc(c.name)}</div>
            <div class="rank-meta">par ${esc(c.broughtBy)}</div>
          </div>
        </div>
      </div>`).join("");
  }
  list.innerHTML = html;
}

function updateRevealUI() {
  const stateEl = $("#reveal-state");
  const revealBtn = $("#reveal-btn");
  const hideBtn = $("#hide-btn");
  if (state.revealed) {
    revealBtn.classList.add("hidden");
    hideBtn.classList.remove("hidden");
    stateEl.textContent = "✅ Notes révélées — visibles dans le classement.";
  } else {
    revealBtn.classList.remove("hidden");
    hideBtn.classList.add("hidden");
    stateEl.textContent = "";
  }
}

$("#reveal-btn").addEventListener("click", async () => {
  const code = prompt("Code organisateur pour révéler les notes :");
  if (!code) return;
  const r = await api("/api/reveal", { code: code.trim(), value: true });
  if (r && r.ok) { toast("Notes révélées 🔓"); refresh(); }
  else toast(r.error || "Code incorrect", true);
});

$("#hide-btn").addEventListener("click", async () => {
  const code = prompt("Code organisateur pour re-cacher :");
  if (!code) return;
  const r = await api("/api/reveal", { code: code.trim(), value: false });
  if (r && r.ok) { toast("Notes re-cachées 🙈"); refresh(); }
  else toast(r.error || "Code incorrect", true);
});

$("#reset-btn").addEventListener("click", async () => {
  if (!confirm("⚠️ Supprimer TOUTES les chips et TOUTES les notes ? Irréversible.")) return;
  const code = prompt("Code organisateur pour tout réinitialiser :");
  if (!code) return;
  const r = await api("/api/reset", { code: code.trim() });
  if (r && r.ok) { toast("Tout réinitialisé ♻️"); refresh(); }
  else toast(r.error || "Code incorrect", true);
});

// --------------------------------------------------------------------------
// Utilitaires
// --------------------------------------------------------------------------
function emptyMsg(emoji, html) {
  return `<div class="empty-msg"><span class="big">${emoji}</span>${html}</div>`;
}

let toastTimer = null;
function toast(msg, isErr = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("err", isErr);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

boot();
