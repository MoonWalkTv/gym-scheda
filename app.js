import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, setDoc, deleteDoc, onSnapshot, collection, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, appleSignIn } from "./firebase-config.js";
import { TEMPLATE } from "./template.js";

const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function show(section){
  for (const id of ["loading", "auth", "app", "editor", "programs"]) $(id).hidden = id !== section;
  $("timer").hidden = section !== "app";
}

let toastT = null;
function toast(msg){
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2800);
}

/* ---------------- Firebase ---------------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = "it";
let db;
try { db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})}); }
catch(e) { db = initializeFirestore(app, {}); }

/* ---------------- auth screen ---------------- */
let authMode = "login";
function setAuthMode(m){
  authMode = m;
  $("tabLogin").setAttribute("aria-selected", m === "login");
  $("tabRegister").setAttribute("aria-selected", m === "register");
  $("nameField").hidden = m !== "register";
  $("authSubmit").textContent = m === "login" ? "Accedi" : "Crea l'account";
  $("forgotBtn").hidden = m !== "login";
  $("passInput").autocomplete = m === "login" ? "current-password" : "new-password";
  authMsg("");
}
function authMsg(err, info){
  $("authError").textContent = err || ""; $("authError").hidden = !err;
  $("authInfo").textContent = info || ""; $("authInfo").hidden = !info;
}
function authError(e){
  const c = (e && e.code) || "";
  const map = {
    "auth/invalid-email": "L'email non è valida.",
    "auth/missing-email": "Scrivi la tua email.",
    "auth/missing-password": "Scrivi la password.",
    "auth/weak-password": "La password deve avere almeno 6 caratteri.",
    "auth/email-already-in-use": "Esiste già un account con questa email: usa «Accedi».",
    "auth/invalid-credential": "Email o password sbagliate.",
    "auth/invalid-login-credentials": "Email o password sbagliate.",
    "auth/wrong-password": "Email o password sbagliate.",
    "auth/user-not-found": "Nessun account con questa email: usa «Registrati».",
    "auth/too-many-requests": "Troppi tentativi. Riprova tra qualche minuto.",
    "auth/network-request-failed": "Nessuna connessione a internet.",
    "auth/account-exists-with-different-credential": "Questa email è già registrata con un altro metodo di accesso.",
    "auth/unauthorized-domain": "Questo indirizzo non è ancora autorizzato per l'accesso con Google.",
    "auth/operation-not-allowed": "Questo metodo di accesso non è attivo."
  };
  if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return "";
  return map[c] || "Qualcosa è andato storto (" + (c || "errore") + "). Riprova.";
}

$("tabLogin").onclick = () => setAuthMode("login");
$("tabRegister").onclick = () => setAuthMode("register");
$("authForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const email = $("emailInput").value.trim(), pass = $("passInput").value, name = $("nameInput").value.trim();
  if (authMode === "register" && !name) { authMsg("Scrivi il tuo nome."); return; }
  $("authSubmit").disabled = true; authMsg("");
  try {
    if (authMode === "login") await signInWithEmailAndPassword(auth, email, pass);
    else {
      pendingName = name;
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, {displayName: name});
    }
  } catch(e) { authMsg(authError(e)); }
  $("authSubmit").disabled = false;
});
$("appleBtn").hidden = !appleSignIn;
$("appleBtn").onclick = () => providerSignIn("apple");
$("googleBtn").onclick = () => providerSignIn("google");
async function providerSignIn(kind){
  authMsg("");
  let provider;
  if (kind === "apple") {
    provider = new OAuthProvider("apple.com");
    provider.addScope("email"); provider.addScope("name");
    provider.setCustomParameters({locale: "it"});
  } else {
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({prompt: "select_account"});
  }
  try { await signInWithPopup(auth, provider); }
  catch(e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) {
      try { await signInWithRedirect(auth, provider); } catch(e2) { authMsg(authError(e2)); }
    } else authMsg(authError(e));
  }
}
$("forgotBtn").onclick = async () => {
  const email = $("emailInput").value.trim();
  if (!email) { authMsg("Scrivi la tua email qui sopra, poi premi di nuovo «Password dimenticata?»."); return; }
  try { await sendPasswordResetEmail(auth, email); authMsg("", "Ti abbiamo mandato un'email per scegliere una nuova password."); }
  catch(e) { authMsg(authError(e)); }
};
getRedirectResult(auth).catch(e => { const m = authError(e); if (m) { show("auth"); authMsg(m); } });

/* ---------------- user data ---------------- */
let user = null, userRef = null, sessCol = null;
let unsubUser = null, unsubSess = null;
let pendingName = "";
let programs = [], activeId = null;      // all the sheets of this account, and the one in use
let program = null;                       // active sheet: {id, title, warm:[], days:[{id,name,sub,ex:[{id,n,s,note}]}]}
let prog = {done:{}, kg:{}};              // progress of the current workouts
let updated = 0;
let sessions = [];
let current = null;
let loaded = false, dirty = false, writing = false, saveTimer = null;

function setStatus(state){
  const el = $("status");
  const s = state || (dirty || writing ? "busy" : (navigator.onLine === false ? "warn" : "ok"));
  el.className = "status " + s;
  el.querySelector("span").textContent =
    s === "busy" ? "Salvataggio…" : s === "warn" ? "Offline: salvo appena torna la rete" : "Salvato sul tuo account";
}
window.addEventListener("online", () => setStatus());
window.addEventListener("offline", () => setStatus());

onAuthStateChanged(auth, u => {
  if (unsubUser) { unsubUser(); unsubUser = null; }
  if (unsubSess) { unsubSess(); unsubSess = null; }
  user = u; loaded = false; program = null; programs = []; activeId = null; sessions = [];
  if (!u) { show("auth"); setAuthMode(authMode); return; }
  show("loading");
  userRef = doc(db, "users", u.uid);
  sessCol = collection(userRef, "sessions");

  unsubUser = onSnapshot(userRef, {includeMetadataChanges: false}, snap => {
    if (!snap.exists()) {
      if (snap.metadata.fromCache) return;             // wait for the server before creating
      const p = {...clone(TEMPLATE), id: newId()};
      programs = [p]; activeId = p.id; program = p; prog = {done:{}, kg:{}}; updated = Date.now();
      setDoc(userRef, {programs: clone(programs), activeId, prog, updated, name: u.displayName || pendingName || "", createdAt: new Date().toISOString()}).catch(() => {});
      firstRender(); return;
    }
    const r = snap.data();
    if (!snap.metadata.hasPendingWrites && !dirty && !writing && !progWriting && (r.updated || 0) >= updated) {
      adoptPrograms(r);
      prog = {done: {...(r.prog?.done || {})}, kg: {...(r.prog?.kg || {})}};
      updated = r.updated || 0;
      if (loaded && $("app").hidden) return;           // don't redraw under the editor or the sheets list
      loaded ? safeRender() : firstRender();
    } else if (!loaded) { adoptPrograms(r); firstRender(); }
  }, e => { toast("Impossibile leggere la tua scheda: " + (e.code || "errore")); });

  unsubSess = onSnapshot(query(sessCol, orderBy("date", "desc"), limit(300)), qs => {
    sessions = qs.docs.map(d => ({...d.data(), id: d.id}));
    if (loaded) renderHistory();
  }, () => {});
});

function adoptPrograms(r){
  if (Array.isArray(r.programs) && r.programs.length) programs = clone(r.programs);
  else if (r.program) programs = [{...clone(r.program), id: r.program.id || "main"}];
  else programs = [{...clone(TEMPLATE), id: newId()}];
  activeId = programs.some(p => p.id === r.activeId) ? r.activeId : programs[0].id;
  program = programs.find(p => p.id === activeId);
}
function useProgram(id){
  activeId = id; program = programs.find(p => p.id === id) || programs[0];
  current = (program.days[0] || {}).id || null;
}

function firstRender(){
  loaded = true;
  const name = (user.displayName || pendingName || "").split(" ")[0];
  $("hello").textContent = name ? "Ciao " + name : "Ciao";
  if (!program.days.some(d => d.id === current)) current = (program.days.find(d => "#" + d.id === location.hash) || program.days[0] || {}).id || null;
  show("app"); render();
}

function persist(){
  updated = Date.now();
  dirty = true; setStatus();
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700);
}
async function flush(){
  if (!userRef || writing || !dirty) { setStatus(); return; }
  writing = true; dirty = false; setStatus();
  try { await setDoc(userRef, {prog: clone(prog), updated}, {merge: true}); }
  catch(e) { dirty = true; toast("Non riesco a salvare: " + (e.code || "errore")); }
  writing = false;
  if (dirty) setTimeout(flush, 1500); else setStatus();
}
window.addEventListener("pagehide", () => { if (dirty) flush(); });

/* ---------------- workout view ---------------- */
// progress keys carry the sheet id, so two sheets never share ticks or weights
const key = (d, e, j) => `${program.id}|${d}|${e}|${j}`;
const wkey = (d, e, j) => `${program.id}|${d}|w:${e}|${j}`;
const dayPrefix = d => `${program.id}|${d}|`;
function scheme(s){ return s.length && s.every(x => x === s[0]) ? s.length + " × " + s[0] : s.join("-"); }
function prevKg(d, e, j){ for (let x = j - 1; x >= 0; x--) { const v = prog.kg[key(d, e, x)]; if (v) return v; } return ""; }
const getDay = () => program.days.find(d => d.id === current);

function exCard(day, e, i){
  const allDone = e.s.length && e.s.every((_, j) => prog.done[key(day.id, e.id, j)]);
  const rows = e.s.map((r, j) => {
    const k = key(day.id, e.id, j), ok = !!prog.done[k];
    return `<div class="setrow${ok ? " ok" : ""}">
      <span class="sl">S${j + 1}</span>
      <span class="reps">${esc(r)}<small> rip</small></span>
      <label class="kg"><input data-kg="${esc(k)}" data-d="${esc(day.id)}" data-e="${esc(e.id)}" data-j="${j}" inputmode="decimal" autocomplete="off" placeholder="${esc(prevKg(day.id, e.id, j) || "—")}" value="${esc(prog.kg[k] || "")}" aria-label="Kg serie ${j + 1}"><span>kg</span></label>
      <button class="chk" data-k="${esc(k)}" data-d="${esc(day.id)}" data-e="${esc(e.id)}" data-j="${j}" aria-pressed="${ok}" aria-label="Serie ${j + 1} fatta">${CHECK}</button>
    </div>`;
  }).join("");
  return `<article class="ex${allDone ? " complete" : ""}">
    <div class="exhead"><div class="num">${i + 1}</div><div class="exname"><h3>${esc(e.n)}</h3>
      <div class="meta"><span class="scheme">${esc(scheme(e.s))}</span>${e.note ? `<span>${esc(e.note)}</span>` : ""}</div></div></div>
    <div class="rows">${rows}</div>
    <div class="extools">
      <button data-addset="${esc(e.id)}" aria-label="Aggiungi una serie a ${esc(e.n)}">+ Serie</button>
      <button data-rmset="${esc(e.id)}" aria-label="Togli l'ultima serie da ${esc(e.n)}" ${e.s.length <= 1 ? "disabled" : ""}>− Serie</button>
      <button data-rmex="${esc(e.id)}" class="rm">Elimina esercizio</button>
    </div></article>`;
}
function warmCard(day, e){
  const pills = e.s.map((r, j) => {
    const k = wkey(day.id, e.id, j);
    return `<button class="set" data-k="${esc(k)}" aria-pressed="${!!prog.done[k]}">${esc(r)}<small>serie ${j + 1}</small></button>`;
  }).join("");
  return `<article class="ex"><div class="exhead"><div class="num">·</div><div class="exname"><h3>${esc(e.n)}</h3>
    <div class="meta"><span class="scheme">${esc(scheme(e.s))}</span>${e.note ? `<span>${esc(e.note)}</span>` : ""}</div></div></div><div class="sets">${pills}</div></article>`;
}

function render(){
  $("progTitle").textContent = program.title || "La mia scheda";
  $("progSwitch").textContent = programs.length > 1 ? `Le mie schede (${programs.length}) ▾` : "Le mie schede ▾";
  $("tabs").innerHTML = program.days.map((d, i) =>
    `<button class="tab" role="tab" data-day="${esc(d.id)}" aria-selected="${d.id === current}"><b>${esc(d.name)}</b><small>Giorno ${i + 1}</small></button>`).join("");
  const d = getDay();
  if (!d) {
    $("day").innerHTML = `<p class="emptyday">La tua scheda non ha ancora giorni. Apri il menu in alto a destra e scegli «Modifica la scheda».</p>`;
    $("hist").innerHTML = ""; return;
  }
  const total = d.ex.reduce((a, e) => a + e.s.length, 0);
  let done = 0;
  d.ex.forEach(e => e.s.forEach((_, j) => { if (prog.done[key(d.id, e.id, j)]) done++; }));
  const warm = program.warm || [];
  const warmEl = document.getElementById("warm-" + d.id);
  const warmOpen = warmEl ? warmEl.open : !warm.every(e => e.s.every((_, j) => prog.done[wkey(d.id, e.id, j)]));

  $("day").innerHTML = `
    <div class="dayhead"><div><h2>${esc(d.name)}</h2>${d.sub ? `<p>${esc(d.sub)}</p>` : ""}</div>
      <div class="dayright"><button class="dayedit" id="dayEdit">Modifica scheda</button><div class="count">${done}/${total} serie</div></div></div>
    <div class="bar"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
    ${warm.length ? `<details class="warm" id="warm-${esc(d.id)}" ${warmOpen ? "open" : ""}>
      <summary><b>Riscaldamento / core</b><span>prima di iniziare</span></summary>
      <div class="list">${warm.map(e => warmCard(d, e)).join("")}</div></details>` : ""}
    <div class="list">${d.ex.map((e, i) => exCard(d, e, i)).join("") || `<p class="emptyday">Nessun esercizio in questo giorno: aggiungine uno qui sotto.</p>`}</div>
    <form class="addex" id="addExForm" autocomplete="off">
      <div class="edrow">
        <label class="edin">Nuovo esercizio<input id="newExName" maxlength="60" placeholder="Es. Panca piana"></label>
        <label class="edin">Serie × rip<input id="newExSch" maxlength="40" value="3x10" placeholder="4x8"></label>
      </div>
      <button class="addbtn" type="submit">+ Aggiungi esercizio a ${esc(d.name)}</button>
    </form>
    <div class="actions">
      <button class="primary" id="saveWorkout">Salva allenamento</button>
      <button class="reset" id="reset">Azzera le spunte di oggi</button>
    </div>`;
  renderHistory();
}

function fmtDate(iso){
  try { return new Date(iso).toLocaleDateString("it-IT", {weekday:"short", day:"numeric", month:"short", year:"numeric"}); }
  catch(e) { return iso; }
}
function renderHistory(){
  const d = getDay(); const el = $("hist");
  if (!d) { el.innerHTML = ""; return; }
  const list = sessions.filter(s => s.programId === program.id && s.dayId === d.id).slice(0, 10);
  if (!list.length) {
    el.innerHTML = `<h2>Storico ${esc(d.name)}</h2><p class="empty">Ancora nessun allenamento salvato. Quando finisci, premi «Salva allenamento» e lo ritrovi qui con tutti i pesi.</p>`;
    return;
  }
  el.innerHTML = `<h2>Storico ${esc(d.name)}</h2>` + list.map(s => {
    const rows = (s.ex || []).filter(x => (x.kg || []).some(v => v)).map(x =>
      `<div class="hrow"><span>${esc(x.n)}</span><span>${x.kg.map(v => v ? esc(v) : "–").join(" · ")} kg</span></div>`).join("")
      || `<div class="hrow"><span>Nessun peso segnato</span><span></span></div>`;
    return `<details><summary><b>${esc(fmtDate(s.date))}</b><span>${s.doneSets || 0}/${s.totalSets || 0} serie</span></summary>
      <div class="body">${rows}<button class="del" data-del="${esc(s.id)}">Elimina dallo storico</button></div></details>`;
  }).join("");
}

let needRender = false;
function safeRender(){
  const a = document.activeElement;
  if (a && a.matches && a.matches("input[data-kg]")) { needRender = true; return; }
  const y = window.scrollY; render(); window.scrollTo(0, y);
}
document.addEventListener("focusout", () => setTimeout(() => {
  const a = document.activeElement;
  if (needRender && !(a && a.matches && a.matches("input[data-kg]"))) { needRender = false; safeRender(); }
}, 0));

async function saveWorkout(){
  const d = getDay(); if (!d) return;
  let doneSets = 0, totalSets = 0;
  const ex = d.ex.map(e => {
    const kg = e.s.map((_, j) => prog.kg[key(d.id, e.id, j)] || "");
    const dn = e.s.map((_, j) => !!prog.done[key(d.id, e.id, j)]);
    totalSets += e.s.length; doneSets += dn.filter(Boolean).length;
    return {n: e.n, reps: e.s, kg, done: dn};
  });
  if (!doneSets) { toast("Spunta almeno una serie prima di salvare"); return; }
  const entry = {programId: program.id, programTitle: program.title || "", dayId: d.id, dayName: d.name, date: new Date().toISOString(), doneSets, totalSets, ex};
  Object.keys(prog.done).forEach(k => { if (k.startsWith(dayPrefix(d.id))) delete prog.done[k]; });
  persist();
  const y = window.scrollY; render(); window.scrollTo(0, y);
  toast("Allenamento salvato nello storico");
  try { await setDoc(doc(sessCol, newId()), entry); } catch(e) { toast("Non riesco a salvare lo storico: " + (e.code || "errore")); }
}

/* ---------------- editor ---------------- */
let draft = null;
function parseScheme(txt){
  const t = String(txt || "").trim().replace(/\s+/g, " ");
  if (!t) return [];
  const m = t.match(/^(\d{1,2})\s*[x×X*]\s*(.+)$/);
  if (m) { const n = Math.min(+m[1], 12); return Array.from({length: n}, () => m[2].trim()); }
  return t.split(/[,;\/ ]+|-(?=\d)/).map(x => x.trim()).filter(Boolean).slice(0, 12);
}
function schemeText(s){ return s.length && s.every(x => x === s[0]) ? s.length + "x" + s[0] : s.join("-"); }

function openEditor(pid){
  draft = clone(programs.find(p => p.id === pid) || program);
  draft.warm = draft.warm || [];
  for (const list of [draft.warm, ...draft.days.map(d => d.ex)]) for (const e of list) e.sch = schemeText(e.s);
  closeMenu();
  show("editor"); renderEditor(); window.scrollTo(0, 0);
}
function exEditor(path, e, i, len){
  return `<div class="edex">
    <div class="exline">
      <label class="edin">Esercizio<input data-path="${path}.${i}.n" value="${esc(e.n)}" maxlength="60" placeholder="Es. Panca piana"></label>
      <label class="edin">Serie × rip<input data-path="${path}.${i}.sch" value="${esc(e.sch)}" maxlength="40" placeholder="4x8"></label>
    </div>
    <label class="edin">Nota (facoltativa)<input data-path="${path}.${i}.note" value="${esc(e.note || "")}" maxlength="60" placeholder="Es. per gamba, recupero 2'"></label>
    <div class="edtools">
      <button data-act="up" data-list="${path}" data-i="${i}" ${i === 0 ? "disabled" : ""}>↑ Su</button>
      <button data-act="down" data-list="${path}" data-i="${i}" ${i === len - 1 ? "disabled" : ""}>↓ Giù</button>
      <button class="rm" data-act="rmex" data-list="${path}" data-i="${i}">Elimina</button>
    </div>
  </div>`;
}
function renderEditor(){
  const days = draft.days.map((d, di) => `<div class="edday">
      <div class="edhead"><b>Giorno ${di + 1}</b>
        <div class="edtools">
          <button data-act="dup" data-i="${di}" ${di === 0 ? "disabled" : ""}>↑</button>
          <button data-act="ddown" data-i="${di}" ${di === draft.days.length - 1 ? "disabled" : ""}>↓</button>
          <button class="rm" data-act="rmday" data-i="${di}">Elimina giorno</button>
        </div></div>
      <div class="edrow">
        <label class="edin big">Nome<input data-path="days.${di}.name" value="${esc(d.name)}" maxlength="16" placeholder="Es. Push"></label>
        <label class="edin">Descrizione<input data-path="days.${di}.sub" value="${esc(d.sub || "")}" maxlength="40" placeholder="Es. Petto e spalle"></label>
      </div>
      ${d.ex.map((e, i) => exEditor(`days.${di}.ex`, e, i, d.ex.length)).join("")}
      <button class="addbtn" data-act="addex" data-list="days.${di}.ex">+ Aggiungi esercizio</button>
    </div>`).join("");
  $("edBody").innerHTML = `
    <label class="edin big" style="margin-top:6px">Nome della scheda<input data-path="title" value="${esc(draft.title || "")}" maxlength="30" placeholder="La mia scheda"></label>
    <p class="hint">Serie × rip: scrivi <b>4x8</b> (4 serie da 8), <b>10-10-8-8</b> (una serie per numero) oppure <b>3x15-30</b>.</p>
    <div class="edday warmed">
      <div class="edhead"><b>Riscaldamento (in tutti i giorni)</b></div>
      ${draft.warm.map((e, i) => exEditor("warm", e, i, draft.warm.length)).join("") || `<p class="hint" style="margin:0">Nessun esercizio di riscaldamento.</p>`}
      <button class="addbtn" data-act="addex" data-list="warm">+ Aggiungi esercizio di riscaldamento</button>
    </div>
    ${days}
    <button class="addbtn" data-act="addday" style="margin-top:12px">+ Aggiungi un giorno</button>`;
}
function atPath(path){
  const parts = path.split("."); let o = draft;
  for (const p of parts) o = o[isNaN(p) ? p : +p];
  return o;
}
function setPath(path, value){
  const parts = path.split("."); const last = parts.pop(); let o = draft;
  for (const p of parts) o = o[isNaN(p) ? p : +p];
  o[last] = value;
}
$("edBody").addEventListener("input", ev => { const p = ev.target.dataset.path; if (p) setPath(p, ev.target.value); });
$("edBody").addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, i = +b.dataset.i;
  const list = b.dataset.list ? atPath(b.dataset.list) : null;
  if (a === "addex") list.push({id: newId(), n: "", sch: "3x10", note: "", s: []});
  else if (a === "rmex") list.splice(i, 1);
  else if (a === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
  else if (a === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
  else if (a === "addday") draft.days.push({id: newId(), name: "Giorno " + (draft.days.length + 1), sub: "", ex: []});
  else if (a === "rmday") {
    if (!b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = "Tocca ancora"; setTimeout(() => { b.classList.remove("arm"); b.textContent = "Elimina giorno"; }, 3000); return; }
    draft.days.splice(i, 1);
  }
  else if (a === "dup" && i > 0) [draft.days[i - 1], draft.days[i]] = [draft.days[i], draft.days[i - 1]];
  else if (a === "ddown" && i < draft.days.length - 1) [draft.days[i + 1], draft.days[i]] = [draft.days[i], draft.days[i + 1]];
  const y = window.scrollY; renderEditor(); window.scrollTo(0, y);
  if (a === "addex" || a === "addday") {
    const inputs = $("edBody").querySelectorAll(a === "addday" ? ".edday:last-of-type input" : `input[data-path^="${b.dataset.list}."]`);
    const target = a === "addday" ? inputs[0] : inputs[inputs.length - 3];
    if (target) { target.focus(); target.select && target.select(); }
  }
});
$("edCancel").onclick = () => { draft = null; show("app"); render(); };
$("edTemplate").onclick = ev => {
  const b = ev.currentTarget;
  if (!b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = "Tocca ancora: la scheda torna quella di esempio"; setTimeout(() => { b.classList.remove("arm"); b.textContent = "Ricomincia dalla scheda di esempio"; }, 3500); return; }
  b.classList.remove("arm"); b.textContent = "Ricomincia dalla scheda di esempio";
  draft = {...clone(TEMPLATE), id: draft.id, title: draft.title || TEMPLATE.title};
  for (const list of [draft.warm, ...draft.days.map(d => d.ex)]) for (const e of list) e.sch = schemeText(e.s);
  renderEditor(); toast("Scheda di esempio caricata: premi «Salva la scheda» per tenerla");
};
$("edSave").onclick = async () => {
  const out = {id: draft.id || newId(), title: (draft.title || "").trim() || "La mia scheda", warm: [], days: []};
  const conv = (e, where) => {
    const n = (e.n || "").trim(); const s = parseScheme(e.sch);
    if (!n && !e.sch) return null;
    if (!n) throw "Manca il nome di un esercizio in «" + where + "».";
    if (!s.length) throw "Scrivi serie e ripetizioni per «" + n + "» (es. 4x8).";
    const o = {id: e.id || newId(), n, s};
    if ((e.note || "").trim()) o.note = e.note.trim();
    return o;
  };
  try {
    out.warm = draft.warm.map(e => conv(e, "Riscaldamento")).filter(Boolean);
    out.days = draft.days.map((d, i) => {
      const name = (d.name || "").trim() || "Giorno " + (i + 1);
      return {id: d.id || newId(), name, sub: (d.sub || "").trim(), ex: d.ex.map(e => conv(e, name)).filter(Boolean)};
    });
  } catch(msg) { toast(String(msg)); return; }
  const i = programs.findIndex(p => p.id === out.id);
  if (i >= 0) programs[i] = out; else programs.push(out);
  if (out.id === activeId) program = out;
  if (!program.days.some(d => d.id === current)) current = program.days[0]?.id || null;
  saveProgram(); toast("Scheda «" + out.title + "» salvata");
  draft = null; show("app"); render(); window.scrollTo(0, 0);
};

/* ---------------- app events ---------------- */
function twoTap(btn, label, armedLabel){
  if (!btn.classList.contains("arm")) {
    btn.classList.add("arm"); btn.textContent = armedLabel;
    setTimeout(() => { btn.classList.remove("arm"); btn.textContent = label; }, 3000);
    return false;
  }
  return true;
}
$("menuBtn").onclick = ev => {
  ev.stopPropagation();
  const m = $("menu"); m.hidden = !m.hidden; $("menuBtn").setAttribute("aria-expanded", String(!m.hidden));
};
document.addEventListener("click", ev => { if (!ev.target.closest(".menuwrap")) { $("menu").hidden = true; $("menuBtn").setAttribute("aria-expanded", "false"); } });
$("editBtn").onclick = () => openEditor();
$("progsBtn").onclick = () => openPrograms();
$("progSwitch").onclick = () => openPrograms();

/* ---------------- my sheets ---------------- */
function closeMenu(){ $("menu").hidden = true; $("menuBtn").setAttribute("aria-expanded", "false"); }
function openPrograms(){ closeMenu(); show("programs"); renderPrograms(); window.scrollTo(0, 0); }
function renderPrograms(){
  $("progList").innerHTML = programs.map(p => {
    const nEx = p.days.reduce((a, d) => a + d.ex.length, 0), active = p.id === activeId;
    const last = sessions.find(s => s.programId === p.id);
    return `<article class="pcard${active ? " active" : ""}">
      <div class="phead"><div class="ptxt"><h3>${esc(p.title || "Scheda")}</h3>
        <p>${p.days.length} ${p.days.length === 1 ? "giorno" : "giorni"} · ${nEx} esercizi${p.days.length ? " · " + esc(p.days.map(d => d.name).join(" / ")) : ""}</p>
        ${last ? `<p>Ultimo allenamento: ${esc(fmtDate(last.date))}</p>` : ""}</div>
        ${active ? `<span class="badge">In uso</span>` : ""}</div>
      <div class="extools">
        ${active ? "" : `<button class="use" data-puse="${esc(p.id)}">Usa questa scheda</button>`}
        <button data-pedit="${esc(p.id)}">Modifica</button>
        <button data-pdup="${esc(p.id)}">Duplica</button>
        ${programs.length > 1 ? `<button class="rm" data-pdel="${esc(p.id)}">Elimina</button>` : ""}
      </div></article>`;
  }).join("");
}
$("programs").addEventListener("click", ev => {
  const b = ev.target.closest("button"); if (!b) return;
  const id = b.dataset.puse || b.dataset.pedit || b.dataset.pdup || b.dataset.pdel;
  if (b.dataset.puse) {
    useProgram(id); saveProgram();
    show("app"); render(); window.scrollTo(0, 0);
    toast("Ora usi «" + (program.title || "Scheda") + "»");
  } else if (b.dataset.pedit) openEditor(id);
  else if (b.dataset.pdup) {
    const src = programs.find(p => p.id === id); if (!src) return;
    const copy = {...clone(src), id: newId(), title: ((src.title || "Scheda") + " (copia)").slice(0, 30)};
    programs.splice(programs.indexOf(src) + 1, 0, copy);
    saveProgram(); renderPrograms(); toast("Scheda duplicata");
  } else if (b.dataset.pdel) {
    if (!twoTap(b, "Elimina", "Tocca ancora")) return;
    programs = programs.filter(p => p.id !== id);
    for (const m of [prog.done, prog.kg]) Object.keys(m).forEach(k => { if (k.startsWith(id + "|")) delete m[k]; });
    if (id === activeId) useProgram(programs[0].id);
    saveProgram(); renderPrograms(); toast("Scheda eliminata");
  } else if (b.id === "progBack") { show("app"); render(); window.scrollTo(0, 0); }
  else if (b.id === "newEmpty" || b.id === "newTemplate") {
    const name = $("newProgName").value.trim();
    const p = b.id === "newEmpty"
      ? {id: newId(), title: name || "Nuova scheda", warm: [], days: [{id: newId(), name: "Giorno 1", sub: "", ex: []}]}
      : {...clone(TEMPLATE), id: newId(), title: name || TEMPLATE.title};
    programs.push(p); useProgram(p.id); saveProgram();
    $("newProgName").value = "";
    toast("Scheda «" + p.title + "» creata");
    if (b.id === "newEmpty") openEditor(p.id); else { show("app"); render(); window.scrollTo(0, 0); }
  }
});
$("logoutBtn").onclick = async () => { if (dirty) await flush(); stopTimer(); signOut(auth); };

$("app").addEventListener("click", ev => {
  const tab = ev.target.closest("[data-day]");
  if (tab) { current = tab.dataset.day; history.replaceState(null, "", "#" + current); render(); window.scrollTo({top: 0}); return; }
  const tgl = ev.target.closest("[data-k]");
  if (tgl) {
    const k = tgl.dataset.k;
    if (prog.done[k]) delete prog.done[k];
    else {
      prog.done[k] = true;
      if (tgl.dataset.e && !prog.kg[k]) { const p = prevKg(tgl.dataset.d, tgl.dataset.e, +tgl.dataset.j); if (p) prog.kg[k] = p; }
    }
    persist(); keepAwake();
    const y = window.scrollY; render(); window.scrollTo(0, y);
    return;
  }
  if (ev.target.closest("#saveWorkout")) { saveWorkout(); return; }
  if (ev.target.closest("#dayEdit")) { openEditor(); return; }
  const addSet = ev.target.closest("[data-addset]"), rmSet = ev.target.closest("[data-rmset]"), rmEx = ev.target.closest("[data-rmex]");
  if (addSet || rmSet || rmEx) {
    const d = getDay(), id = (addSet || rmSet || rmEx).dataset[addSet ? "addset" : rmSet ? "rmset" : "rmex"];
    const e = d && d.ex.find(x => x.id === id); if (!e) return;
    if (addSet) { if (e.s.length >= 12) { toast("Massimo 12 serie"); return; } e.s.push(e.s[e.s.length - 1] || "10"); }
    else if (rmSet) {
      if (e.s.length <= 1) return;
      const j = e.s.length - 1; e.s.pop();
      delete prog.done[key(d.id, e.id, j)]; delete prog.kg[key(d.id, e.id, j)];
    } else {
      if (!twoTap(rmEx, "Elimina esercizio", "Tocca ancora per eliminare")) return;
      d.ex = d.ex.filter(x => x.id !== id);
      Object.keys(prog.done).forEach(k => { if (k.startsWith(`${dayPrefix(d.id)}${id}|`)) delete prog.done[k]; });
      toast("Esercizio eliminato");
    }
    saveProgram();
    const y = window.scrollY; render(); window.scrollTo(0, y);
    return;
  }
  const reset = ev.target.closest("#reset");
  if (reset) {
    if (!twoTap(reset, "Azzera le spunte di oggi", "Tocca ancora per azzerare")) return;
    Object.keys(prog.done).forEach(k => { if (k.startsWith(dayPrefix(current))) delete prog.done[k]; });
    persist(); render(); return;
  }
  const del = ev.target.closest("[data-del]");
  if (del) {
    if (!twoTap(del, "Elimina dallo storico", "Tocca ancora per eliminare")) return;
    const id = del.dataset.del;
    sessions = sessions.filter(s => s.id !== id); renderHistory();
    deleteDoc(doc(sessCol, id)).catch(() => toast("Non riesco a eliminare"));
  }
});
$("app").addEventListener("input", ev => {
  const t = ev.target; const k = t.dataset && t.dataset.kg; if (!k) return;
  const v = t.value.replace(/[^\d.,]/g, "").slice(0, 6);
  if (v !== t.value) t.value = v;
  if (v) prog.kg[k] = v; else delete prog.kg[k];
  const d = program.days.find(x => x.id === t.dataset.d), e = d && d.ex.find(x => x.id === t.dataset.e);
  if (e) for (let j = +t.dataset.j + 1; j < e.s.length; j++) {
    const inp = $("app").querySelector(`input[data-kg="${CSS.escape(key(d.id, e.id, j))}"]`);
    if (inp) inp.placeholder = prevKg(d.id, e.id, j) || "—";
  }
  persist();
});

$("app").addEventListener("submit", ev => {
  if (ev.target.id !== "addExForm") return;
  ev.preventDefault();
  const d = getDay(); if (!d) return;
  const n = $("newExName").value.trim(), s = parseScheme($("newExSch").value);
  if (!n) { toast("Scrivi il nome dell'esercizio"); $("newExName").focus(); return; }
  if (!s.length) { toast("Scrivi serie e ripetizioni, es. 4x8"); $("newExSch").focus(); return; }
  d.ex.push({id: newId(), n, s});
  saveProgram();
  const y = window.scrollY; render(); window.scrollTo(0, y);
  toast("«" + n + "» aggiunto a " + d.name);
});

let progWriting = false, progAgain = false;
async function saveProgram(){
  updated = Date.now();
  if (progWriting) { progAgain = true; return; }
  progWriting = true; setStatus("busy");
  try { await setDoc(userRef, {programs: clone(programs), activeId, prog: clone(prog), updated}, {merge: true}); }
  catch(e) { toast("Non riesco a salvare la scheda: " + (e.code || "errore")); }
  progWriting = false;
  if (progAgain) { progAgain = false; saveProgram(); } else setStatus();
}

/* ---------------- rest timer ---------------- */
const timerEl = $("timer"), clockEl = $("clock");
let tick = null, endAt = 0, actx = null;
const fmt = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
function showClock(s, label){ clockEl.innerHTML = fmt(s) + `<small>${label}</small>`; }
function buttonsIdle(){ document.querySelectorAll(".tbtn").forEach(b => { b.classList.remove("stop"); b.textContent = b.dataset.sec == 120 ? "2'" : b.dataset.sec + '"'; }); }
function beep(){
  try {
    if (!actx) return;
    [0, .25, .5].forEach(t => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(.25, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + t + .2);
      o.start(actx.currentTime + t); o.stop(actx.currentTime + t + .22);
    });
  } catch(e) {}
}
function startTimer(sec){
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch(e) {}
  keepAwake();
  clearInterval(tick); endAt = Date.now() + sec * 1000;
  timerEl.classList.remove("end"); timerEl.classList.add("run");
  buttonsIdle();
  const btn = document.querySelector(`.tbtn[data-sec="${sec}"]`); btn.classList.add("stop"); btn.textContent = "Stop";
  const step = () => {
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    showClock(left, "Recupero in corso");
    if (left <= 0) {
      clearInterval(tick); timerEl.classList.remove("run"); timerEl.classList.add("end");
      showClock(0, "Recupero finito: vai!"); buttonsIdle(); beep();
      try { navigator.vibrate && navigator.vibrate([250, 120, 250]); } catch(e) {}
      setTimeout(() => { if (!timerEl.classList.contains("run")) { timerEl.classList.remove("end"); showClock(0, "Timer recupero"); } }, 4000);
    }
  };
  step(); tick = setInterval(step, 250);
}
function stopTimer(){ clearInterval(tick); timerEl.classList.remove("run", "end"); buttonsIdle(); showClock(0, "Timer recupero"); }
timerEl.addEventListener("click", ev => {
  const tb = ev.target.closest(".tbtn"); if (!tb) return;
  tb.classList.contains("stop") ? stopTimer() : startTimer(+tb.dataset.sec);
});

let lock = null;
async function keepAwake(){
  try { if ("wakeLock" in navigator && !lock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); } } catch(e) { lock = null; }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !lock && timerEl.classList.contains("run")) keepAwake(); });
