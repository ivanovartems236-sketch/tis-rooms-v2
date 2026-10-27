"use strict";
/* © 2026 Артём Иванов. Все права защищены.
   Копирование, изменение и распространение без письменного разрешения автора запрещены (см. LICENSE). */
/* Кабинеты ТИС v3 — «Куда идти?». Всё, что приходит из расписания, выводится только через textContent (helper h) */
const KN = ["", "Лекция", "Практика", "Лаб."];
const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const WDL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const TYPE = { group: "группа", teacher: "преп.", room: "ауд." };

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const wdi = d => (d.getDay() + 6) % 7;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dm = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
const mins = t => { const m = /(\d{1,2})\.(\d{2})-(\d{1,2})\.(\d{2})/.exec(t || ""); return m ? [m[1] * 60 + +m[2], m[3] * 60 + +m[4]] : null; };
const hm = m => `${Math.floor(m / 60)}:${pad(m % 60)}`;
const dur = m => (m >= 60 ? Math.floor(m / 60) + " ч " : "") + (m % 60 ? (m % 60) + " мин" : "");
const splitT = s => s.split("/").map(x => x.trim()).filter(Boolean);
const roomName = r => r === "СЗ" ? "Спортзал" : r;
const roomSort = (a, b) => { const pa = /^([^\d-]*)-?(\d*)/.exec(a), pb = /^([^\d-]*)-?(\d*)/.exec(b); return pa[1] === pb[1] ? (+pa[2] || 0) - (+pb[2] || 0) : pa[1].localeCompare(pb[1], "ru"); };
/* поиск прощает формат: регистр, дефисы, пробелы, ё, латинские двойники; «оист261» найдёт О-ИстТ-261 */
const LAT = { a: "а", b: "в", c: "с", e: "е", h: "н", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у" };
const norm = s => s.toLowerCase().replace(/ё/g, "е").replace(/[a-z]/g, c => LAT[c] || c).replace(/[^0-9a-zа-я]/g, "");
function fuzzy(q, v) {  // меньше — лучше, -1 — не подходит
  const g = norm(v);
  if (!q) return 0; if (g === q) return 0; if (g.startsWith(q)) return 1;
  const i = g.indexOf(q); if (i >= 0) return 2 + i / 100;
  const dq = q.replace(/\D/g, ""); if (dq && !g.replace(/\D/g, "").includes(dq)) return -1;  // цифры — подряд: 261 ≠ 2…6…1
  let last = -1, gaps = 0;
  for (const c of q) { const k = g.indexOf(c, last + 1); if (k < 0) return -1; gaps += k - last - 1; last = k; }
  return 3 + gaps / 10;
}
/* группа = форма-направление[-9/11]-номер: «ист 261» — сначала ИстТ-261 (направление с начала), а не МИСТ-261 */
function groupScore(q, v) {
  const [f, d, ...ns] = v.toLowerCase().replace(/ё/g, "е").split("-"), num = ns.join("");
  const ql = q.replace(/\d/g, ""), qd = q.replace(/\D/g, "");
  if (qd && !num.endsWith(qd)) return -1;
  if (ql.startsWith(f) && d.startsWith(ql.slice(f.length))) return ql === f ? 1 : 0;
  if (d.startsWith(ql)) return 1;
  return fuzzy(q, v) < 0 ? -1 : 3 + fuzzy(q, v) / 10;
}
/* набрал в английской раскладке: «jbcn261» → «оист261» */
const QW = "qwertyuiop[]asdfghjkl;'zxcvbnm,.", YC = "йцукенгшщзхъфывапролджэячсмитьбю";
const relayout = q => q.toLowerCase().replace(/./g, c => { const i = QW.indexOf(c); return i < 0 ? c : YC[i]; });
function search(q, vs, type) {
  const run = n => vs.map(v => [type === "group" ? groupScore(n, v) : fuzzy(n, v), v]).filter(x => x[0] >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], "ru")).map(x => x[1]);
  const res = run(norm(q));
  return res.length || !/[a-z]/i.test(q) ? res : run(norm(relayout(q)));
}
function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

/* демо-время: ?now=2026-10-27T10:20 — чтобы посмотреть «идёт пара» в любой момент */
const NOWP = new URLSearchParams(location.search).get("now");
const msk = d => new Date(d.getTime() + (d.getTimezoneOffset() + 180) * 60000);  // UTC+3 без перехода на летнее
const now = () => NOWP ? new Date(NOWP) : msk(new Date());
const today = () => { const d = now(); d.setHours(0, 0, 0, 0); return d; };
const nowMin = () => { const d = now(); return d.getHours() * 60 + d.getMinutes(); };

/* ---------- данные ---------- */
let L = [], byDate = new Map(), lists = { group: [], teacher: [], room: [] }, CH = [], ICS = {}, UPDATED = "", MAXD = "";
function ingest(data) {
  const S = data.dict;
  L = data.l.map(r => {
    let s = S[r[5]], te = S[r[6]];
    if (te.startsWith("(")) { s += " " + te; te = ""; }  // старые data.json: пояснение попало в преподавателя
    return { d: S[r[0]], p: r[1], t: S[r[2]], g: S[r[3]], k: r[4], s, te, r: S[r[7]], tl: splitT(te) };
  });
  const gs = new Set(), ts = new Set(), rs = new Set();
  byDate = new Map();
  for (const l of L) {
    (byDate.get(l.d) || byDate.set(l.d, []).get(l.d)).push(l);
    gs.add(l.g); l.tl.forEach(t => ts.add(t)); if (l.r) rs.add(l.r);
  }
  lists.group = [...gs].sort((a, b) => a.localeCompare(b, "ru"));
  lists.teacher = [...ts].sort((a, b) => a.localeCompare(b, "ru"));
  lists.room = [...rs].sort(roomSort);
  ICS = data.ics || {}; UPDATED = data.updated || "";
  MAXD = [...byDate.keys()].sort().pop() || "";
}
const match = (l, e) => e.type === "group" ? l.g === e.v : e.type === "teacher" ? l.tl.includes(e.v) : l.r === e.v;
function dayItems(date, e) {
  const agg = new Map();
  for (const l of byDate.get(date) || []) {
    if (!match(l, e)) continue;
    const k = [l.p, l.s, l.te, l.r, l.k].join("|");
    if (!agg.has(k)) agg.set(k, { ...l, gs: [], m: mins(l.t) });
    const a = agg.get(k); if (!a.gs.includes(l.g)) a.gs.push(l.g);
  }
  return [...agg.values()].sort((a, b) => a.p - b.p);
}
const chTouches = (c, e) => c.type === "lesson" && (e.type === "group" ? c.g.includes(e.v)
  : [c.before, c.after].some(x => x && (e.type === "room" ? x.r === e.v : splitT(x.t).includes(e.v))));
function changesFor(date, e) { return CH.filter(c => c.d === date && chTouches(c, e)); }
function pairTimes(date) {
  const cnt = {};
  for (const l of byDate.get(date) || []) (cnt[l.p] ||= {})[l.t] = (cnt[l.p][l.t] || 0) + 1;
  const out = {}; for (const p in cnt) out[p] = Object.entries(cnt[p]).sort((a, b) => b[1] - a[1])[0][0];
  return out;
}

/* ---------- состояние ---------- */
/* профиль — не аккаунт: выбранные группы/аудитории/преподаватели хранятся только в этом браузере */
function migrate() {  // избранное со старого интерфейса (v2) становится профилями
  const favs = ls("tis2-favs");
  return Array.isArray(favs) ? favs.filter(f => f && ["group", "room", "teacher"].includes(f.m)).map(f => ({ type: f.m, v: f.v })) : [];
}
const st = {
  profiles: ls("tis3-profiles") || migrate(),
  cur: ls("tis3-cur") || 0,
  tab: "today", view: null, date: today(), onb: null, q: "", freePair: null, stack: [], showFree: false, menu: false, form: "О", gridSel: null,
};
const me = () => st.view || st.profiles[st.cur] || null;
function saveProfiles() { ls("tis3-profiles", st.profiles); ls("tis3-cur", st.cur); }
function addProfile(e, makeCur = true) {
  let i = st.profiles.findIndex(p => p.type === e.type && p.v === e.v);
  if (i < 0) { st.profiles.push(e); i = st.profiles.length - 1; }
  if (makeCur) st.cur = i;
  st.view = null; saveProfiles();
}
/* убрали все профили — назад к первому экрану: чистим и открытое чужое расписание, и стек «назад» */
function restart() {
  Object.assign(st, { profiles: [], cur: 0, view: null, stack: [], tab: "today", date: today(), onb: null, q: "", freePair: null, showFree: false, menu: false });
  saveProfiles(); ls("tis3-skip", null);
  history.replaceState(null, "", location.pathname + location.search);
  render(); scrollTo(0, 0);
}
const go = (tab, extra) => { st.stack = []; Object.assign(st, { tab, menu: false, freePair: null }, extra || {}); render(); scrollTo(0, 0); };
const TAB_NAME = { today: "Сегодня", week: "Неделя", find: "Найти", more: "Ещё", grid: "Шахматка" };
function drill(tab, extra) {
  st.stack.push({ tab: st.tab, date: st.date, view: st.view, q: st.q, y: scrollY });
  history.pushState({ proto: st.stack.length }, "");
  Object.assign(st, { tab, menu: false }, extra || {}); render(); scrollTo(0, 0);
}
addEventListener("popstate", () => {
  const prev = st.stack.pop(); if (!prev) return;
  const y = prev.y; delete prev.y;
  Object.assign(st, prev, { menu: false }); render(); scrollTo(0, y);
});
const backBtn = () => st.stack.length ? h("button", { class: "back", onclick: () => history.back() }, "‹ " + TAB_NAME[st.stack[st.stack.length - 1].tab]) : null;
/* свободные аудитории и аналитика — для преподавателей и «просто посмотреть», студенту не нужны */
const forStaff = () => { const p = st.profiles[st.cur]; return st.showFree || !p || p.type !== "group"; };

/* ---------- онбординг ---------- */
const FORMS = [["О", "Очная"], ["ОЗ", "Очно-заочная"], ["З", "Заочная"]];
function viewOnboarding() {
  if (!st.onb) return [h("div", { class: "onb" },
    h("div", { class: "brand" }, "Кабинеты ТИС"),
    h("h1", {}, "Куда идти?"),
    h("p", {}, "Твоя пара, кабинет и замены — за 2 тапа. Без регистрации, выбор хранится только на этом телефоне."),
    h("button", { class: "big primary", onclick: () => { st.onb = "group"; render(); } }, h("span", { class: "ic" }, "🎓"), h("div", {}, h("b", {}, "Я студент"), h("span", {}, "Расписание моей группы"))),
    h("button", { class: "big", onclick: () => { st.onb = "teacher"; render(); } }, h("span", { class: "ic" }, "👩‍🏫"), h("div", {}, h("b", {}, "Я преподаватель"), h("span", {}, "Мои пары и окна"))),
    h("button", { class: "big", onclick: () => { st.onb = "skip"; ls("tis3-skip", 1); go("find"); } }, h("span", { class: "ic" }, "🔍"), h("div", {}, h("b", {}, "Просто посмотреть"), h("span", {}, "Аудитории, свободные кабинеты, любая группа"))),
    h("p", { class: "foot" }, "Неофициальный сервис. Данные — stis.su/schedule. © 2026 Артём Иванов."))];
  const type = st.onb, q = st.q.trim();
  const choose = v => { addProfile({ type, v }); st.onb = null; st.q = ""; go("today", { date: today() }); };
  const input = h("input", { placeholder: type === "group" ? "Например: ист 261" : "Начни вводить фамилию", value: st.q, autocomplete: "off", spellcheck: "false",
    oninput: e => { st.q = e.target.value; renderKeepFocus(); } });
  let body;
  if (type === "teacher") {
    /* список всех ФИО не показываем — только совпадения с введённой фамилией */
    const found = norm(q).length >= 2 ? search(q, lists.teacher, "teacher").slice(0, 8) : [];
    body = norm(q).length < 2 ? h("p", { class: "muted", style: "font-size:.9rem" }, "Введи хотя бы две буквы фамилии — покажем совпадения.")
      : found.length ? h("div", { class: "res" }, found.map(v => h("button", { onclick: () => choose(v) }, h("b", {}, v), h("small", {}, TYPE.teacher))))
      : h("div", { class: "empty" }, "Такой фамилии нет в текущем расписании");
  } else if (q) {
    const found = search(q, lists.group, "group").slice(0, 24);
    body = found.length ? h("div", { class: "tiles full" }, found.map(v => h("button", { onclick: () => choose(v) }, v)))
      : h("div", { class: "empty" }, "Ничего не нашлось. Пиши как в расписании: форма, направление, номер — например, о ист 261");
  } else {
    /* без поиска — все группы плитками, по формам обучения; номер без префикса формы, чтобы плитки были короткими */
    const forms = FORMS.filter(([f]) => lists.group.some(g => g.startsWith(f + "-")));
    const cur = forms.some(([f]) => f === st.form) ? st.form : forms[0]?.[0];
    body = [h("div", { class: "seg", role: "tablist" }, forms.map(([f, t]) => h("button", { role: "tab", "aria-selected": f === cur ? "true" : "false",
      onclick: () => { st.form = f; render(); } }, t))),
      h("div", { class: "tiles" }, lists.group.filter(g => g.startsWith(cur + "-")).map(v => h("button", { "aria-label": v, onclick: () => choose(v) }, v.slice(cur.length + 1))))];
  }
  return [h("div", { style: "padding-top:24px" },
    h("button", { class: "link", onclick: () => { st.onb = null; st.q = ""; render(); } }, "← назад"),
    h("h2", { style: "margin-top:12px" }, type === "group" ? "Найди свою группу" : "Найди себя"),
    h("div", { class: "search" }, input), body)];
}

/* ---------- шапка: текущий профиль со стрелкой, по тапу — меню профилей ---------- */
const TYPE_FULL = { group: "группа", teacher: "преподаватель", room: "аудитория" };
function profileBar() {
  const e = me();
  const toggle = () => { st.menu = !st.menu; render(); };
  return h("div", { class: "top" }, backBtn(),
    h("button", { class: "who-btn", "aria-haspopup": "menu", "aria-expanded": st.menu ? "true" : "false", onclick: toggle },
      h("span", { class: "nm" }, h("b", {}, e ? roomName(e.v) : "Выбери профиль"), h("span", { class: "caret", "aria-hidden": "true" }, "▾")),
      h("small", {}, st.view ? "смотришь · не сохранено" : e ? TYPE_FULL[e.type] : "группа, аудитория или преподаватель")),
    st.view ? [
      h("button", { class: "btn primary", onclick: () => { addProfile(st.view); toast("Сохранено — переключайся по стрелке ▾"); render(); } }, "★ Сохранить"),
      h("button", { class: "btn", "aria-label": "Закрыть", onclick: () => { st.view = null; render(); } }, "✕")] : null,
    st.menu ? profileMenu() : null);
}
function profileMenu() {
  const pick = fn => () => { st.menu = false; fn(); };
  return [h("div", { class: "scrim", onclick: pick(render) }),
    h("div", { class: "menu", role: "menu" },
      st.profiles.map((p, i) => h("button", { role: "menuitemradio", "aria-checked": !st.view && i === st.cur ? "true" : "false",
        onclick: pick(() => { st.cur = i; st.view = null; saveProfiles(); render(); }) }, h("b", {}, roomName(p.v)), h("small", {}, TYPE[p.type]))),
      h("button", { class: "add", onclick: pick(() => go("find")) }, "+ добавить группу, аудиторию, преподавателя"),
      st.profiles.length ? h("button", { class: "add", onclick: pick(() => go("more")) }, "Изменить список") : null)];
}

/* ---------- Сегодня ---------- */
function nextSchoolDay(from, e) {
  for (let d = addDays(from, 1), i = 0; i < 14; i++, d = addDays(d, 1)) { const it = dayItems(iso(d), e); if (it.length) return [d, it]; }
  return [null, []];
}
function hero(e) {
  const t = iso(today()), items = dayItems(t, e), m = nowMin();
  const cur = items.find(i => i.m && m >= i.m[0] && m < i.m[1]);
  const next = items.find(i => i.m && i.m[0] > m);
  /* у аудитории в карточке крупно группы (их может быть несколько — шрифт меньше), у группы и преподавателя — кабинет */
  const isRoom = e.type === "room", roomCls = isRoom ? "room sm" : "room";
  const place = i => isRoom ? (i.gs.length > 2 ? i.gs.length + " групп" : i.gs.join(", ").replace(/-/g, "‑")) : roomName(i.r || "без ауд.");
  const who = i => e.type === "teacher" ? i.gs.join(", ") : i.te;
  const sub = i => [i.s, who(i)].filter(Boolean).join(" · ");
  if (cur) {
    const left = cur.m[1] - m, pct = 100 * (m - cur.m[0]) / (cur.m[1] - cur.m[0]);
    return h("div", { class: "hero now" }, h("div", { class: "lbl" }, `${isRoom ? "Идёт" : "Ты на"} ${cur.p} ${isRoom ? "пара" : "паре"} · ещё ${dur(left)}`),
      h("div", { class: roomCls }, place(cur)), h("div", { class: "subj" }, cur.s),
      h("div", { class: "meta" }, who(cur) + (next ? ` · потом ${place(next)} в ${hm(next.m[0])}` : isRoom ? " · последняя, потом свободна" : " · последняя, потом свобода")),
      h("div", { class: "bar" }, h("i", { style: `width:${pct.toFixed(0)}%` })));
  }
  if (next) {
    const left = next.m[0] - m;
    return h("div", { class: "hero" }, h("div", { class: "lbl" }, `${isRoom ? "Следующая" : "Куда идти"} · ${next.p} пара ${left <= 15 ? "уже через " + dur(left) + (isRoom ? "" : " 🏃") : "через " + dur(left)}`),
      h("div", { class: roomCls }, place(next)), h("div", { class: "subj" }, next.s),
      h("div", { class: "meta" }, `${hm(next.m[0])}–${hm(next.m[1])} · ${who(next)}`));
  }
  const [nd, nit] = nextSchoolDay(today(), e), unknown = !items.length && t > MAXD && wdi(today()) < 6;
  const head = unknown ? "Расписание на сегодня ещё не выложено"
    : isRoom ? (items.length ? "На сегодня занятия закончились" : "Сегодня свободна весь день")
    : items.length ? "Всё, на сегодня свобода 🎉" : wdi(today()) === 6 ? "Сегодня выходной 😴" : "Сегодня пар нет 🙌";
  if (!nd) return h("div", { class: "hero calm" }, h("div", { class: "lbl" }, head), h("div", { class: "subj", style: "margin-top:6px" },
    unknown ? `Пока есть только до ${dm(fromIso(MAXD))} — следи за stis.su.` : `Дальше расписание ещё не выложено (есть до ${dm(fromIso(MAXD))}) — следи за stis.su.`));
  const f = nit[0], when = iso(nd) === iso(addDays(today(), 1)) ? "Завтра" : `${WDL[wdi(nd)]}, ${dm(nd)}`;
  return h("div", { class: "hero calm" }, h("div", { class: "lbl muted" }, head),
    h("div", { class: "subj", style: "margin-top:8px" }, `${when} к ${f.m ? hm(f.m[0]) : f.p + " паре"} — ${isRoom ? "первые придут" : "сюда"}:`),
    h("div", { class: roomCls, style: isRoom ? null : "font-size:2rem" }, place(f)),
    h("div", { class: "meta muted" }, sub(f) + ` · всего ${nit.length} ${nit.length === 1 ? "пара" : nit.length < 5 ? "пары" : "пар"}`));
}
function dayStrip(onPick) {
  const mon = addDays(st.date, -wdi(st.date)), e = me(), t = iso(today());
  return h("div", { class: "days sticky" },
    h("button", { class: "arr", "aria-label": "Прошлая неделя", onclick: () => { st.date = addDays(st.date, -7); render(); } }, "‹"),
    Array.from({ length: 6 }, (_, i) => { const d = addDays(mon, i), k = iso(d);
      return h("button", { class: (k === t ? "today " : "") + (e && dayItems(k, e).length ? "has" : ""), "aria-pressed": k === iso(st.date) ? "true" : "false",
        onclick: () => { st.date = d; onPick ? onPick() : render(); } }, h("span", { class: "w" }, WD[i]), h("span", { class: "n" }, d.getDate())); }),
    h("button", { class: "arr", "aria-label": "Следующая неделя", onclick: () => { st.date = addDays(st.date, 7); render(); } }, "›"));
}
function lessonList(date, e) {
  const items = dayItems(date, e), chs = changesFor(date, e), isToday = date === iso(today()), m = nowMin();
  const cancelled = chs.filter(c => c.before && !c.after).map(c => ({ p: c.p, s: c.before.s, r: c.before.r, te: c.before.t, k: c.before.k, gs: c.g, m: mins(pairTimes(date)[c.p]), cancel: true }));
  const all = [...items, ...cancelled].sort((a, b) => a.p - b.p);
  if (!all.length) {
    const d = fromIso(date);
    return [h("div", { class: "empty" }, wdi(d) === 6 ? "Воскресенье — отдыхаем." : date > MAXD ? `Расписание на эти дни ещё не выложено (есть до ${dm(fromIso(MAXD))}).` : e.type === "room" ? "Аудитория свободна весь день." : "Пар нет.")];
  }
  /* студенту — таймлайн: линия слева заполняется по времени, видно, скоро ли конец пары.
     Преподавателю и аудитории — просто список. Справа у всех колонка «куда»: кабинет (у аудитории — группы) */
  const tl = e.type === "group", live = tl && isToday;
  const real = all.filter(i => !i.cancel && i.m);
  const out = []; let prevEnd = null;
  for (const i of all) {
    const gapMin = prevEnd != null && i.m && !i.cancel ? i.m[0] - prevEnd : 0;
    if (gapMin >= 20) out.push(h("div", { class: "gap" + (live && m >= i.m[0] ? " done" : "") }, (e.type === "room" ? "свободно " : "окно ") + dur(gapMin)));
    const changed = !i.cancel && chs.some(c => c.p === i.p && c.after && c.after.s === i.s);
    const isCur = isToday && i.m && !i.cancel && m >= i.m[0] && m < i.m[1], isPast = isToday && i.m && m >= i.m[1];
    const cls = "lesson" + (i.cancel ? " cancel" : "") + (isCur ? " cur" : "") + (isPast ? " past" : "");
    const right = e.type === "room" ? (i.gs.length > 1 ? null : i.gs[0]) : i.r ? roomName(i.r) : "—";
    const groups = e.type !== "group" && (e.type === "teacher" || i.gs.length > 1) ? h("div", { class: "gs" }, i.gs.map(g => h("span", {}, g))) : null;
    const who = e.type === "teacher" || !i.te ? `${i.p} пара` : `${i.p} пара · ${i.te}`;
    let rail = null;
    if (tl) {
      // заполнение — от начала пары до начала следующей (последняя — до звонка)
      const nx = i.m && real.find(x => x.m[0] > i.m[0]), end = i.m ? (nx ? nx.m[0] : i.m[1]) : 0;
      const pct = live && i.m && !i.cancel ? Math.max(0, Math.min(100, 100 * (m - i.m[0]) / (end - i.m[0]))) : 0;
      rail = h("div", { class: "rail" + (pct > 0 ? " on" : "") + (isCur ? " now" : "") }, h("i", { style: `height:${pct.toFixed(1)}%` }));
    }
    out.push(h("div", { class: cls },
      h("div", { class: "t" }, h("b", {}, i.m ? hm(i.m[0]) : i.p + " п."), i.m ? hm(i.m[1]) : "",
        live && isCur ? h("span", { class: "left" }, "ещё " + dur(i.m[1] - m)) : null),
      rail,
      h("div", { class: "card" },
        h("div", { class: "main" },
          h("div", { class: "s" }, i.cancel ? h("span", { class: "chip nw" }, "отменено") : changed ? h("span", { class: "chip chg" }, "изменено") : null,
            !i.cancel && i.k ? h("span", { class: "chip k" + i.k }, KN[i.k]) : null, i.s),
          h("div", { class: "who" }, who), groups),
        right ? h("div", { class: "rt" + (e.type === "room" ? " sm" : "") }, right) : null)));
    if (!i.cancel && i.m) prevEnd = i.m[1];
  }
  return tl ? [h("div", { class: "tl" }, out)] : out;
}
function viewToday() {
  const e = me();
  if (!e) return [staleBanner(), h("div", { class: "empty", style: "margin-top:40px" }, "Профиль не выбран. ", h("button", { class: "link", onclick: () => { st.onb = null; ls("tis3-skip", null); render(); } }, "Выбрать группу"))];
  const sel = iso(st.date), isToday = sel === iso(today());
  return [staleBanner(), installHint(), profileBar(),
    dayStrip(),
    isToday ? hero(e) : null,
    h("div", { class: "hrow" }, h("h2", {}, isToday ? "Сегодня" : `${WDL[wdi(st.date)]}, ${dm(st.date)}`), dayItems(sel, e).length ? shareBtn("day") : null),
    lessonList(sel, e)];
}

/* ---------- Неделя ---------- */
function viewWeek() {
  const e = me(); if (!e) return viewToday();
  const mon = addDays(st.date, -wdi(st.date)), t = iso(today());
  return [profileBar(),
    h("div", { class: "days", style: "grid-template-columns:28px 1fr 28px" },
      h("button", { class: "arr", onclick: () => { st.date = addDays(st.date, -7); render(); } }, "‹"),
      h("b", { style: "text-align:center" }, `Неделя ${dm(mon)} – ${dm(addDays(mon, 5))}`),
      h("button", { class: "arr", onclick: () => { st.date = addDays(st.date, 7); render(); } }, "›")),
    h("div", { class: "hrow", style: "justify-content:flex-end;margin-bottom:8px" }, shareBtn("week")),
    Array.from({ length: 6 }, (_, i) => {
      const d = addDays(mon, i), k = iso(d), items = dayItems(k, e);
      return h("div", { class: "wday" + (k === t ? " today" : "") },
        h("button", { class: "hd", onclick: () => drill("today", { date: d }) }, WDL[i], h("span", {}, dm(d) + (items.length ? ` · ${items.length} ${items.length === 1 ? "пара" : items.length < 5 ? "пары" : "пар"}` : ""))),
        items.length ? items.map(x => h("div", { class: "wrow" }, h("span", { class: "p" }, x.p), h("span", { class: "tm" }, x.m ? hm(x.m[0]) : ""),
          h("span", { class: "sj" }, x.s), h("span", { class: "rm" }, e.type === "room" ? (x.gs.length > 1 ? x.gs.length + " гр." : x.gs[0]) : roomName(x.r || "—"))))
          : h("div", { class: "muted", style: "font-size:.85rem" }, k > MAXD ? "ещё не выложено" : "нет пар"));
    })];
}

/* ---------- Найти ---------- */
function viewFind() {
  const q = st.q.trim().toLowerCase(), view = [];
  const input = h("input", { placeholder: "Группа, аудитория или фамилия", value: st.q, autocomplete: "off", spellcheck: "false",
    oninput: ev => { st.q = ev.target.value; renderKeepFocus(); } });
  view.push(st.profiles.length ? profileBar() : null, h("h2", { style: "margin:8px 0 2px" }, "Чьё расписание открыть"),
    h("p", { class: "muted", style: "margin:0 0 10px;font-size:.88rem" }, "Любая группа, аудитория или преподаватель."), h("div", { class: "search" }, input));
  if (q) {
    const res = [];
    for (const type of ["group", "room", "teacher"]) for (const v of search(q, lists[type], type)) res.push({ type, v });
    if (lists.room.includes("СЗ") && "спортзал".includes(norm(q)) && !res.some(x => x.v === "СЗ")) res.push({ type: "room", v: "СЗ" });
    view.push(h("div", { class: "res" }, res.slice(0, 30).map(e => h("button", { onclick: () => drill("today", { view: e, date: today() }) }, h("b", {}, roomName(e.v)), h("small", {}, TYPE[e.type])))),
      res.length ? null : h("div", { class: "empty" }, "Ничего не нашлось"));
    return view;
  }
  if (!forStaff()) {
    view.push(h("p", { class: "muted", style: "font-size:.9rem" }, "Найди любую группу, аудиторию или преподавателя — и сохрани ★, чтобы переключаться в один тап."));
    return view;
  }
  /* свободные аудитории: отвечаем на «куда пойти и до скольки» — группы по времени, когда аудиторию займут */
  const dday = byDate.has(iso(today())) ? iso(today()) : [...byDate.keys()].sort().find(k => k > iso(today())) || iso(today());
  const isToday = dday === iso(today());
  const times = pairTimes(dday), ps = Object.keys(times).map(Number).sort((a, b) => a - b), m = nowMin();
  const tm = p => mins(times[p]);
  view.push(h("h2", { style: "margin:18px 0 2px" }, "Пустые аудитории"),
    h("p", { class: "muted", style: "margin:0 0 10px;font-size:.88rem" }, "Выбери пару — покажу, где в это время нет занятий и до скольки там можно остаться."));
  if (!ps.length) { view.push(h("div", { class: "empty" }, "Нет данных на ближайшие дни.")); return view; }
  const curP = isToday ? (ps.find(p => tm(p) && m < tm(p)[1]) || ps[ps.length - 1]) : ps[0];
  if (st.freePair == null || !ps.includes(st.freePair)) st.freePair = curP;
  if (!isToday) view.push(h("p", { class: "muted", style: "margin:0 0 8px;font-size:.85rem" }, `Сегодня занятий нет — показываю ${WDL[wdi(fromIso(dday))].toLowerCase()}, ${dm(fromIso(dday))}.`));
  view.push(h("div", { class: "lbl-sm" }, "Когда нужна аудитория"),
    h("div", { class: "pairs" }, ps.map(p => h("button", { class: isToday && tm(p) && m >= tm(p)[1] ? "past" : null, "aria-pressed": p === st.freePair ? "true" : "false", onclick: () => { st.freePair = p; render(); } },
      p === curP && isToday ? `Сейчас · ${p} пара` : `${p} пара`, h("small", {}, times[p].replace(/\./g, ":").replace("-", "–"))))));
  const busy = p => new Set((byDate.get(dday) || []).filter(l => l.p === p && l.r).map(l => l.r));
  const busyBy = Object.fromEntries(ps.map(p => [p, busy(p)]));
  const rest = ps.filter(p => p >= st.freePair);
  const free = lists.room.filter(r => !busyBy[st.freePair].has(r));
  // для каждой свободной — первая пара, на которой её займут (или null — до конца дня)
  const byUntil = new Map();
  for (const r of free) { const bp = rest.find(p => busyBy[p].has(r)) ?? null; (byUntil.get(bp) || byUntil.set(bp, []).get(bp)).push(r); }
  const pairs = n => `${n} ${n === 1 ? "пара" : n < 5 ? "пары" : "пар"}`;
  view.push(h("p", { class: "muted", style: "margin:2px 0 8px;font-size:.85rem" }, free.length ? `Пусто ${free.length} из ${lists.room.length}` : "На эту пару всё занято."));
  if (free.length) view.push(h("div", { class: "legend" }, "Полоска — пары дня:", h("i", { class: "f" }), "пусто", h("i", { class: "b" }), "занято"));
  // дольше всех свободные — сверху
  const rows = free.map(r => { const bp = rest.find(p => busyBy[p].has(r)) ?? null; return { r, bp, n: bp == null ? 99 : rest.indexOf(bp) }; })
    .sort((x, y) => y.n - x.n || roomSort(x.r, y.r));
  view.push(h("div", { class: "frows" }, rows.map(({ r, bp, n }) => {
    const at = bp == null ? "" : tm(bp) ? hm(tm(bp)[0]) : bp + " пары";
    const [cls, text] = bp == null ? ["ok", "свободна до конца дня"] : n === 1 ? ["warn", `только эта пара · в ${at} занятие`] : ["", `свободна до ${at} · ${pairs(n)}`];
    return h("button", { class: "frow", onclick: () => drill("today", { view: { type: "room", v: r }, date: fromIso(dday) }) },
      h("b", {}, roomName(r)), h("span", { class: "st " + cls }, text),
      h("span", { class: "strip", "aria-hidden": "true" }, ps.map(p => h("i", { class: (busyBy[p].has(r) ? "b" : "f") + (p === st.freePair ? " sel" : p < st.freePair ? " old" : "") }, p))));
  })));
  return view;
}

/* ---------- Ещё ---------- */
function viewMore() {
  const e = st.profiles[st.cur], view = [h("h2", { style: "margin-top:8px" }, "Ещё")];
  const mine = e ? CH.filter(c => chTouches(c, e)) : [];
  view.push(h("h3", {}, e ? `Изменения: ${e.v}` : "Изменения"));
  const list = (e ? mine : CH).slice(0, 20);
  if (!list.length) view.push(h("div", { class: "empty" }, e ? "Замен для твоего профиля пока не было." : "Изменений пока не было."));
  for (const c of list) {
    if (c.type === "week") { view.push(h("div", { class: "chg" }, h("div", { class: "w" }, c.at), `📅 Выложено расписание: ${dm(fromIso(c.d))} – ${dm(fromIso(c.to))}`)); continue; }
    const b = c.before, a = c.after, d = fromIso(c.d);
    const body = b && a ? [a.s, b.r !== a.r ? [" · ауд. ", h("del", {}, b.r || "—"), " → ", h("ins", {}, a.r || "—")] : null, b.s !== a.s ? [" · было: ", h("del", {}, b.s)] : null]
      : a ? ["➕ ", a.s, ` · ${a.r || "без ауд."}`] : ["➖ отменено: ", b.s];
    view.push(h("div", { class: "chg" }, h("div", { class: "w" }, `${WD[wdi(d)]} ${dm(d)} · ${c.p} пара · ${c.g.join(", ")}`), body));
  }
  view.push(h("h3", {}, "Календарь"));
  const key = e && { group: "g", teacher: "t", room: "r" }[e.type] + "|" + e.v;
  if (e && ICS[key]) {
    const url = new URL("ics/" + ICS[key], location.href);
    view.push(h("a", { class: "big", href: "webcal://" + url.host + url.pathname, style: "text-decoration:none;color:inherit" }, h("span", { class: "ic" }, "📆"),
      h("div", {}, h("b", {}, "Подписаться в «Календаре»"), h("span", {}, `${e.v} — пары появятся в телефоне и будут обновляться`))),
      h("button", { class: "btn", onclick: async () => {
        try { await navigator.clipboard.writeText(url.href); toast("Ссылка на календарь скопирована"); } catch (err) { prompt("Скопируй ссылку:", url.href); }
      } }, "Скопировать ссылку (Google Календарь)"));
  } else view.push(h("div", { class: "empty" }, "Выбери профиль, чтобы подписаться."));
  if (forStaff()) view.push(h("h3", {}, "Для преподавателей"),
    h("button", { class: "big", onclick: () => drill("grid", { date: today() }) }, h("span", { class: "ic" }, "▦"), h("div", {}, h("b", {}, "Шахматка"), h("span", {}, "Все аудитории × пары за день"))));
  view.push(h("h3", {}, "Профили"),
    st.profiles.length ? h("div", { class: "res" }, st.profiles.map((p, i) => h("button", { onclick: () => { if (confirm(`Убрать «${p.v}»?`)) { st.profiles.splice(i, 1); if (!st.profiles.length) return restart(); if (st.cur > i || st.cur >= st.profiles.length) st.cur = Math.max(0, st.cur - 1); saveProfiles(); render(); } } }, h("b", {}, roomName(p.v)), h("small", {}, TYPE[p.type] + " · убрать ✕")))) : null,
    h("button", { class: "btn", style: "margin-top:8px", onclick: restart }, "Начать заново (показать первый экран)"));
  view.push(h("p", { class: "foot" }, `Обновлено ${UPDATED}, данные — только с публичной страницы stis.su/schedule. Профиль хранится только на этом устройстве, без регистрации и cookie.`));
  return view;
}

/* ---------- поделиться картинкой ----------
   Рисуем на canvas прямо в браузере. На картинке всегда время обновления и ссылка на живое расписание:
   отфотошопленную «замену» легко проверить. */
const SITE = "https://ivanovartems236-sketch.github.io/tis-rooms-v2/";
const linkFor = e => SITE + "#" + e.type + "/" + encodeURIComponent(e.v);
function fitText(ctx, text, w) {
  if (ctx.measureText(text).width <= w) return text;
  while (text.length > 1 && ctx.measureText(text + "…").width > w) text = text.slice(0, -1);
  return text.trimEnd() + "…";
}
function wrap(ctx, text, w, maxLines) {
  const words = text.split(" "), lines = [];
  let cur = "";
  for (const wd of words) {
    const t = cur ? cur + " " + wd : wd;
    if (ctx.measureText(t).width <= w || !cur) cur = t; else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = fitText(ctx, lines[maxLines - 1] + " …", w); }
  return lines;
}
function drawShare(ctx, e, days, draw) {
  const W = 1080, P = 60, F = "Golos Text, system-ui, sans-serif", M = "IBM Plex Mono, ui-monospace, monospace";
  const C = { bg: "#f3f5f7", card: "#ffffff", fg: "#17202b", mu: "#5f6b78", ac: "#1d5fa8", line: "#dde3ea", chg: "#a16207" };
  const week = days.length > 1;
  let y = P;
  const text = (t, x, yy, font, color, align) => { if (!draw) return; ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.fillText(t, x, yy); };
  if (draw) { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, ctx.canvas.height); }
  text("КАБИНЕТЫ ТИС · КУДА ИДТИ?", P, y + 26, `700 26px ${F}`, C.ac); y += 64;
  text(e.type === "room" ? roomName(e.v) : e.v, P, y + 52, `700 60px ${F}`, C.fg); y += 78;
  const span = week ? `Неделя ${dm(days[0])} – ${dm(days[days.length - 1])}` : `${WDL[wdi(days[0])]}, ${dm(days[0])}`;
  text(span, P, y + 34, `500 34px ${F}`, C.mu); y += 70;
  for (const d of days) {
    const k = iso(d), items = dayItems(k, e), chs = changesFor(k, e);
    if (week) { text(`${WDL[wdi(d)]}, ${dm(d)}`, P, y + 34, `700 32px ${F}`, C.fg); y += 52; }
    if (!items.length) {
      text(k > MAXD ? "расписание ещё не выложено" : "пар нет", P + 4, y + 30, `400 28px ${F}`, C.mu); y += 56; continue;
    }
    for (const i of items) {
      const right = e.type === "room" ? (i.gs.length > 1 ? i.gs.length + " гр." : i.gs[0]) : roomName(i.r || "—");
      const who = e.type === "group" ? i.te : e.type === "teacher" ? i.gs.join(", ") : i.te;
      const changed = chs.some(c => c.p === i.p && c.after && c.after.s === i.s);
      ctx.font = `600 ${week ? 30 : 34}px ${F}`;
      const sw = W - 2 * P - 150 - 220;
      const lines = week ? [fitText(ctx, i.s, sw)] : wrap(ctx, i.s, sw, 2);
      const lh = week ? 38 : 42, hgt = 28 + lines.length * lh + (week ? 0 : 38) + 18;
      if (draw) {
        ctx.fillStyle = C.card; ctx.strokeStyle = changed ? C.chg : C.line; ctx.lineWidth = changed ? 4 : 2;
        ctx.beginPath(); ctx.roundRect(P, y, W - 2 * P, hgt, 22); ctx.fill(); ctx.stroke();
      }
      text(i.m ? hm(i.m[0]) : i.p + " п.", P + 26, y + 26 + lh - 8, `600 32px ${M}`, C.fg);
      if (!week && i.m) text(hm(i.m[1]), P + 26, y + 26 + lh + 30, `400 26px ${M}`, C.mu);
      lines.forEach((ln, n) => text(ln, P + 150, y + 26 + lh * (n + 1) - 8, `600 ${week ? 30 : 34}px ${F}`, C.fg));
      if (!week) { ctx.font = `400 26px ${F}`; text(fitText(ctx, (changed ? "⚠ изменено · " : "") + (KN[i.k] ? KN[i.k] + " · " : "") + who, sw), P + 150, y + 26 + lh * lines.length + 26, `400 26px ${F}`, changed ? C.chg : C.mu); }
      text(right, W - P - 26, y + 26 + lh - 8, `600 ${week ? 34 : 44}px ${M}`, C.ac, "right");
      y += hgt + 12;
    }
    y += week ? 18 : 0;
  }
  y += 20;
  ctx.font = `400 24px ${F}`;
  for (const ln of wrap(ctx, `Обновлено ${UPDATED} по stis.su/schedule. Неофициальный сервис — актуальное расписание по ссылке:`, W - 2 * P, 3)) { text(ln, P, y + 26, `400 24px ${F}`, C.mu); y += 34; }
  ctx.font = `500 22px ${M}`;
  text(fitText(ctx, (SITE + "#" + e.type + "/" + e.v).replace("https://", ""), W - 2 * P), P, y + 30, `500 22px ${M}`, C.ac); y += 44;
  return y + P - 20;
}
async function share(kind) {
  const e = me(); if (!e) return;
  const mon = addDays(st.date, -wdi(st.date));
  const days = kind === "week" ? Array.from({ length: 6 }, (_, i) => addDays(mon, i)) : [st.date];
  try { await document.fonts.ready; } catch (err) {}
  const c = document.createElement("canvas"); c.width = 1080; c.height = 100;
  c.height = drawShare(c.getContext("2d"), e, days, false);
  drawShare(c.getContext("2d"), e, days, true);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const name = `${e.v}-${kind === "week" ? "nedelya-" + dm(mon) : dm(st.date)}.png`.replace(/[^\wА-Яа-яЁё.-]+/g, "_");
  const file = new File([blob], name, { type: "image/png" });
  const text = `${e.type === "room" ? roomName(e.v) : e.v} — ${kind === "week" ? "расписание на неделю" : "пары на " + dm(st.date)}\n${linkFor(e)}`;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
  } catch (err) { if (err.name === "AbortError") return; }
  const a = h("a", { href: URL.createObjectURL(blob), download: name }); a.click();
  try { await navigator.clipboard.writeText(text); toast("Картинка сохранена, ссылка скопирована"); } catch (err) { toast("Картинка сохранена"); }
}
function toast(msg) { const t = $toast; t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2400); }
const shareBtn = kind => h("button", { class: "btn share", onclick: () => share(kind) }, "Поделиться ↗");

/* ---------- шахматка (для преподавателей) ----------
   Таблица прокручивается внутри себя: шапка с парами, колонка аудиторий и легенда всегда на виду.
   В клетке — группа с формой обучения (О/ОЗ/З), подробности — по нажатию, снизу. */
const roomZone = r => { const m = /^([А-ЯA-Z]+)-(\d)/.exec(r); return m ? `Корпус ${m[1]} · ${m[2]} этаж` : "Другое"; };
function viewGrid() {
  const date = iso(st.date), all = byDate.get(date) || [], times = pairTimes(date), m = nowMin(), isToday = date === iso(today());
  const ps = Object.keys(times).map(Number).sort((a, b) => a - b), span = p => mins(times[p]);
  const curP = isToday ? ps.find(p => { const t = span(p); return t && m >= t[0] && m < t[1]; }) : null;
  const isPast = p => isToday && span(p) && m >= span(p)[1];
  const view = [h("div", { class: "top" }, backBtn()), dayStrip(() => { st.gridSel = null; render(); }), h("h2", {}, `Шахматка · ${WD[wdi(st.date)]} ${dm(st.date)}`)];
  if (!all.length) { view.push(h("div", { class: "empty" }, wdi(st.date) === 6 ? "Воскресенье — занятий нет." : date > MAXD ? `Расписание на этот день ещё не выложено (есть до ${dm(fromIso(MAXD))}).` : "На этот день занятий в расписании нет.")); return view; }
  /* клетка = все занятия аудитории в эту пару; разные предметы в одной клетке не склеиваем — покажем все */
  const cell = {};
  for (const l of all) {
    if (!l.r) continue;
    const c = (cell[l.r + "|" + l.p] ||= []), key = [l.s, l.te, l.k].join("|");
    const x = c.find(x => x.key === key) || (c.push({ key, s: l.s, te: l.te, k: l.k, gs: [] }), c[c.length - 1]);
    if (!x.gs.includes(l.g)) x.gs.push(l.g);
  }
  const changed = new Set(CH.filter(c => c.type === "lesson" && c.d === date && c.after && c.after.r).map(c => c.after.r + "|" + c.p));
  const busyRooms = lists.room.filter(r => ps.some(p => cell[r + "|" + p])), freeRooms = lists.room.filter(r => !busyRooms.includes(r));
  const kinds = new Set(Object.values(cell).flat().map(x => x.k));
  const counter = curP ? `сейчас занято ${busyRooms.filter(r => cell[r + "|" + curP]).length} из ${lists.room.length}` : `за день занято ${busyRooms.length} из ${lists.room.length}`;
  view.push(h("div", { class: "legend gl" }, [1, 2, 3, 0].filter(k => kinds.has(k)).map(k => h("span", {}, h("i", { class: "k" + k }), ["другое", "лекция", "практика", "лабораторная"][k])),
    h("span", { class: "cnt" }, counter)));
  const thead = h("thead", {}, h("tr", {}, h("th", { class: "corner" }, "ауд."), ps.map(p => h("th", { class: (p === curP ? "nowcol" : isPast(p) ? "past" : "") || null },
    h("b", {}, p), h("small", {}, span(p) ? hm(span(p)[0]) : "")))));
  const rows = []; let zone = null;
  for (const r of busyRooms) {
    if (roomZone(r) !== zone) { zone = roomZone(r); rows.push(h("tr", { class: "zone" }, h("th", { colspan: ps.length + 1 }, h("span", {}, zone)))); }
    rows.push(h("tr", {}, h("th", {}, roomName(r)), ps.map(p => {
      const key = r + "|" + p, c = cell[key], sel = st.gridSel === key;
      // несколько разных занятий в клетке — цвет того, где больше групп; все они видны в подробностях
      const cls = [c ? "busy k" + c.reduce((a, b) => b.gs.length > a.gs.length ? b : a).k : "", p === curP ? "nowcol" : "", isPast(p) ? "past" : "", sel ? "sel" : ""].filter(Boolean).join(" ");
      const gs = c ? [...new Set(c.flatMap(x => x.gs))] : [];
      return h("td", { class: cls || null },
        h("button", { "aria-label": c ? `${r}, ${p} пара: ${c.map(x => x.s).join("; ")}, ${gs.join(", ")}` : `${r}, ${p} пара — свободно`,
          onclick: () => { st.gridSel = sel || !c ? null : key; render(); } },
          c ? [h("span", { class: "g" }, gs[0]), gs.length > 1 ? h("span", { class: "more" }, `+${gs.length - 1} гр.`) : null, changed.has(key) ? h("i", { class: "chg", title: "изменено" }) : null] : ""));
    })));
  }
  /* перерисовка (нажатие на клетку, ежеминутное обновление) не сбрасывает прокрутку; первый раз — сразу к текущей паре */
  const old = document.querySelector(".tablewrap"), keep = old && old.dataset.d === date ? [old.scrollLeft, old.scrollTop] : null;
  const wrap = h("div", { class: "tablewrap", "data-d": date }, h("table", { class: "grid" }, thead, h("tbody", {}, rows)));
  requestAnimationFrame(() => {
    if (keep) [wrap.scrollLeft, wrap.scrollTop] = keep;
    else { const c = wrap.querySelector("thead th.nowcol"), f = wrap.querySelector("thead th.corner"); if (c && f) wrap.scrollLeft += c.getBoundingClientRect().left - f.getBoundingClientRect().right; }
  });
  view.push(wrap);
  if (freeRooms.length) view.push(h("div", { class: "freeall" }, h("b", {}, "Свободны весь день"),
    h("div", { class: "rooms" }, freeRooms.map(r => h("button", { onclick: () => drill("today", { view: { type: "room", v: r } }) }, roomName(r))))));
  view.push(h("p", { class: "note" }, "Нажми на занятую клетку — покажем предмет, преподавателя и все группы."));
  /* подробности клетки — панель снизу, таблица остаётся на месте */
  const sel = st.gridSel && cell[st.gridSel];
  if (sel) {
    const [r, p] = st.gridSel.split("|"), t = span(p);
    view.push(h("div", { class: "sheet", role: "dialog", "aria-label": `${r}, ${p} пара` },
      h("div", { class: "sh-top" }, h("b", {}, `${roomName(r)} · ${p} пара`), h("span", { class: "muted" }, t ? ` ${hm(t[0])}–${hm(t[1])}` : ""),
        h("button", { class: "x", "aria-label": "Закрыть", onclick: () => { st.gridSel = null; render(); } }, "✕")),
      changed.has(st.gridSel) ? h("div", { class: "chip chg", style: "margin:2px 0 6px" }, "изменено в расписании") : null,
      sel.map(x => h("div", { class: "sh-item" },
        h("div", { class: "s" }, x.k ? h("span", { class: "chip k" + x.k }, KN[x.k]) : null, x.s),
        x.te ? h("div", { class: "muted", style: "font-size:.85rem;margin-top:2px" }, x.te) : null,
        h("div", { class: "gs" }, x.gs.map(g => h("button", { onclick: () => { st.gridSel = null; drill("today", { view: { type: "group", v: g } }); } }, g))))),
      h("button", { class: "btn", style: "width:100%;margin-top:8px", onclick: () => { st.gridSel = null; drill("today", { view: { type: "room", v: r } }); } }, `Весь день ${roomName(r)} →`)));
  }
  return view;
}

/* ---------- сторож и подсказка установки ---------- */
function staleBanner() {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(UPDATED);
  let msg = "";
  if (m && now() - new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5]) > 2 * 864e5) msg = `Данные не обновлялись с ${m[1]}.${m[2]} — расписание могло устареть.`;
  else if (MAXD && iso(today()) > MAXD && wdi(today()) < 6) msg = "Расписания на эту неделю здесь ещё нет.";
  return msg ? h("div", { class: "stale", role: "status" }, msg + " Проверь ", h("a", { href: "https://stis.su/schedule", target: "_blank", rel: "noopener" }, "stis.su/schedule"), ".") : null;
}
function installHint() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  if (!ios || standalone || ls("tis3-installHidden")) return null;
  return h("div", { class: "install" }, h("span", {}, "Добавь на экран «Домой»: ", h("b", {}, "Поделиться"), " → ", h("b", {}, "На экран «Домой»")),
    h("button", { "aria-label": "Скрыть подсказку", onclick: () => { ls("tis3-installHidden", 1); render(); } }, "✕"));
}

/* ---------- адрес: #today, #week, #find, #more, #grid, #group/…, #room/…, #teacher/… ---------- */
const TABS_ALL = ["today", "week", "find", "more", "grid"];
let lastHash = "";
function readHash() {
  const m = /^#([a-z]+)(?:\/(.+))?$/.exec(location.hash);
  if (!m) return;
  let v = null; try { v = m[2] ? decodeURIComponent(m[2]) : null; } catch (e) {}
  if (["group", "room", "teacher"].includes(m[1]) && v) {
    if (!lists[m[1]].includes(v)) { toast(`«${v}» нет в текущем расписании`); return; }
    const i = st.profiles.findIndex(p => p.type === m[1] && p.v === v);
    if (i >= 0) { st.cur = i; st.view = null; saveProfiles(); } else st.view = { type: m[1], v };
    st.tab = "today"; st.date = today();
  } else if (m[1] === "free") { st.tab = "find"; st.showFree = true; }
  else if (m[1] === "changes") st.tab = "more";
  else if (TABS_ALL.includes(m[1])) st.tab = m[1];
}
function writeHash() {
  const hash = st.view && (st.tab === "today" || st.tab === "week") ? `#${st.view.type}/${encodeURIComponent(st.view.v)}` : "#" + st.tab;
  if (hash !== location.hash) history.replaceState(history.state, "", hash);
  lastHash = location.hash;
}
addEventListener("hashchange", () => { if (location.hash !== lastHash) { readHash(); render(); } });

/* ---------- отрисовка ---------- */
const TABS = [["today", "◉", "Сегодня"], ["week", "☷", "Неделя"], ["find", "⌕", "Найти"], ["more", "≡", "Ещё"]];
const onboarding = () => !st.profiles.length && !st.view && !ls("tis3-skip");
function render() {
  if (!L.length) return;
  const onb = onboarding();
  const v = onb ? viewOnboarding() : { today: viewToday, week: viewWeek, find: viewFind, more: viewMore, grid: viewGrid }[st.tab]();
  // горизонтальная лента пар не должна прыгать в начало после перерисовки
  const sx = $app.querySelector(".pairs")?.scrollLeft;
  $app.replaceChildren(...[NOWP ? h("div", { class: "demo" }, `демо-время: ${NOWP.replace("T", " ")}`) : null, v,
    onb ? null : h("p", { class: "foot" }, "Неофициальный сервис — при расхождениях верь ", h("a", { href: "https://stis.su/schedule", target: "_blank", rel: "noopener" }, "stis.su/schedule"), ".", h("br"), "© 2026 Артём Иванов")]
    .flat(Infinity).filter(x => x != null && x !== false));
  const px = $app.querySelector(".pairs"); if (px && sx) px.scrollLeft = sx;
  $bar.hidden = onb;
  if (onb && st.onb && document.activeElement === document.body) $app.querySelector("input")?.focus();
  if (!onb) writeHash();
  const e = st.profiles[st.cur], mine = e ? CH.filter(c => chTouches(c, e) && c.d >= iso(today())).length : 0;
  const active = st.tab === "grid" ? "more" : st.tab;
  $tabs.replaceChildren(...TABS.map(([id, i, t]) => h("button", { "aria-current": active === id ? "page" : null,
    onclick: () => go(id, { showFree: false }) },
    h("span", { class: "i", "aria-hidden": "true" }, i), t, id === "more" && mine ? h("span", { class: "dot" }, mine) : null)));
}
function renderKeepFocus() {
  const pos = document.activeElement?.selectionStart; render();
  const inp = $app.querySelector("input"); if (inp) { inp.focus(); if (pos != null) inp.setSelectionRange(pos, pos); }
}
const $toast = document.getElementById("toast"), $app = document.getElementById("app"), $bar = document.getElementById("tabbar"), $tabs = document.getElementById("tabs");

/* ---------- загрузка ---------- */
let lastLoad = 0, first = true;
async function load() {
  lastLoad = Date.now();
  try {
    const [d, c] = await Promise.all([
      fetch("data.json", { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("changes.json", { cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    ingest(d); CH = Array.isArray(c) ? c : [];
  } catch (e) {
    if (!L.length) { $app.replaceChildren(h("div", { class: "empty", style: "margin-top:40px" }, "Расписание не загрузилось. Проверь интернет.", h("br"),
      h("button", { class: "btn", style: "margin-top:12px", onclick: load }, "Повторить"))); return; }
    toast("Нет связи — показываю сохранённое");
  }
  if (first) { first = false; readHash(); }
  render();
}
load();
setInterval(() => { if (!document.hidden && !NOWP && !document.activeElement?.matches("input")) render(); }, 60000);
addEventListener("online", () => { if (!L.length) load(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (Date.now() - lastLoad > 5 * 60000) load(); else render(); } });
if ("serviceWorker" in navigator && location.protocol === "https:") {
  /* новая версия встала — перезагружаемся сразу, а не «со второго открытия»; при первой установке контроллера нет — не нужно */
  let reloading = false;
  if (navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register("sw.js").then(reg => {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });  // свёрнутое приложение тоже проверяет обновления
  }).catch(() => {});
}
