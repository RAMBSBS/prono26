// frontend/app.js — mode statique 100% gratuit : lit predictions.json (servi par GitHub Pages)
const SOURCE = "predictions.json";
const PICK_LABEL = { p1: "1", pn: "N", p2: "2" };
const $ = (id) => document.getElementById(id);
let DATA = [], cur = null;

async function load() {
  try { DATA = await (await fetch(SOURCE, { cache: "no-store" })).json(); }
  catch { DATA = []; }
  render();
  $("upd").textContent = "MAJ · " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function bars(p1, pn, p2, cls = "") {
  const seg = (w, c, l) => `<div class="seg ${c}" style="width:${w}%">${w > 11 ? l : ""}</div>`;
  return `<div class="track ${cls}">${seg(p1, "s1", p1)}${seg(pn, "sN", pn)}${seg(p2, "s2", p2)}</div>`;
}

function render() {
  const days = [...new Set(DATA.map((m) => m.match_date))].sort();
  if (!cur || !days.includes(cur)) cur = days[0];
  $("tabs").innerHTML = days.map((d) =>
    `<div class="tab ${d === cur ? "on" : ""}" data-d="${d}">${fmtDay(d)}</div>`).join("");
  $("list").innerHTML = DATA.filter((m) => m.match_date === cur).map(card).join("") || empty();
  $("tabs").querySelectorAll(".tab").forEach((t) => t.onclick = () => { cur = t.dataset.d; render(); });
}

function card(m) {
  const hasMkt = m.p1_mkt != null;
  const marketRow = hasMkt ? `<div class="brow"><span class="blab">Marché</span>${bars(m.p1_mkt, m.pn_mkt, m.p2_mkt, "mkt")}</div>` : "";
  // En mode gratuit : pas de marché -> on affiche l'Elo à la place de la "value"
  const right = hasMkt
    ? `<span class="val ${m.value > .02 ? "up" : m.value < -.02 ? "down" : "flat"}">${m.value > .02 ? "▲ value" : m.value < -.02 ? "▼ value" : "■ neutre"}</span>`
    : `<span class="val flat">Elo ${m.elo_h ?? "—"}–${m.elo_a ?? "—"}</span>`;
  return `<div class="card">
    <div class="ctop"><span>${m.grp ? "Groupe <span class='grp'>" + m.grp + "</span>" : "CDM 2026"}</span>
      <span class="stat ${m.status}">${({ soon: "À venir", live: "● Live", done: "Terminé" })[m.status] ?? "À venir"}</span></div>
    <div class="teams">
      <div class="team"><span class="nm">${m.home}</span></div>
      <div class="score">${(m.score_pred || "–").replace("-", "–")}<small>SCORE PRÉDIT</small></div>
      <div class="team"><span class="nm">${m.away}</span></div>
    </div>
    <div class="pick"><span class="pickbox">${PICK_LABEL[m.pick]} ${m.pick === "p1" ? m.home : m.pick === "p2" ? m.away : "Nul"}</span>
      <span class="conf">Confiance · <b>${m.confidence ?? "—"}</b></span></div>
    <div class="bars"><div class="brow"><span class="blab">Modèle</span>${bars(m.p1, m.pn, m.p2)}</div>${marketRow}</div>
    <div class="meta"><span class="xg">xG proj. <b>${m.xg_h}</b> – <b>${m.xg_a}</b>${m.altitude ? " · altitude" : ""}</span>${right}</div>
  </div>`;
}

const fmtDay = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }).toUpperCase();
const empty = () => `<div class="card" style="text-align:center;color:var(--mut)">Aucune donnée. Le cron a-t-il tourné ?</div>`;

$("rf").onclick = load;          // recharge le JSON (le RECALCUL réel est fait par GitHub Actions)
$("cd").textContent = "cron horaire";
load();
setInterval(load, 300000);       // recharge l'affichage toutes les 5 min
