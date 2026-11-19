import { MIN_YEAR } from "./constants.js";
import { areaKm2, bboxOf } from "./lib/geo.js";
import { firstSentence, maskName, plain } from "./lib/text.js";
import { map, updateMix } from "./map.js";
import { neighboursOf, selectedId, setSelectedId, wikiSummary } from "./regions.js";
import { fmtYear, state, t } from "./state.js";
import { stopPlay } from "./timeline.js";
import { endTour } from "./tours-ui.js";
import { $, $$, esc, isPhone, sleep, store } from "./util.js";

// ───────── Quiz about the selected region ─────────
// Questions come from the data on screen: OpenHistoricalMap dates, snapshot
// geometry (neighbours, size, where it is) and the region's Wikipedia text,
// so any region in any era and language can be quizzed.
export const quiz = { questions: [], i: 0, score: 0, region: null, clickTarget: null, token: 0 };
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const locale = () => ({ en: "en-GB", uz: "uz-Latn-UZ", ru: "ru-RU" })[state.lang];
const fmtKm2 = (n) => new Intl.NumberFormat(locale()).format(n > 1e5 ? Math.round(n / 1e4) * 1e4 : Math.round(n / 100) * 100);

const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => null)]);

async function buildQuiz(r) {
  const snapYear = fmtYear(map._snap);
  const f = r.tint;
  const self = f?.properties.NAME;
  const neigh = f ? neighboursOf(f) : [];
  const neighNames = [...new Set(neigh.map((g) => g.properties.NAME))];
  const out = {};

  // When did it exist? (exact OpenHistoricalMap dates)
  if (r.start != null) {
    const now = new Date().getFullYear();
    const range = (a, b) => `${fmtYear(a)} – ${b == null || b >= now ? t("region.now") : fmtYear(b)}`;
    const span = Math.max(40, (r.end ?? now) - r.start);
    const answer = range(r.start, r.end);
    const opts = new Set([answer]);
    for (const k of shuffle([-1.5, -0.8, 0.8, 1.5, -2.3, 2.3])) {
      if (opts.size >= 4) break;
      const d = Math.round((k * span * 0.6) / 5) * 5 || Math.sign(k) * 10;
      const a = r.start + d;
      const b = r.end == null ? (d > 0 ? null : now + d) : r.end + d;
      if (a >= MIN_YEAR && (b == null || b <= now)) opts.add(range(a, b));
    }
    if (opts.size === 4)
      out.dates = {
        type: "choice",
        q: t("quiz.qDates", { name: r.name }),
        meta: "OpenHistoricalMap",
        options: shuffle([...opts]),
        answer,
        explain: "",
      };
  }

  // Which of these bordered it?
  if (neighNames.length) {
    const answer = pick(neighNames);
    const [w, s, e, n] = bboxOf(f);
    const far = shuffle([
      ...new Set(
        (map._snapData?.features || [])
          .filter((g) => {
            const nm = g.properties.NAME;
            if (!nm || nm === self || neighNames.includes(nm)) return false;
            const [a, b, c, d] = bboxOf(g);
            return Math.hypot((a + c) / 2 - (w + e) / 2, (b + d) / 2 - (s + n) / 2) > 25;
          })
          .map((g) => g.properties.NAME),
      ),
    ]).slice(0, 3);
    if (far.length === 3) {
      out.neighbour = {
        type: "choice",
        q: t("quiz.qNeighbour", { name: r.name, year: snapYear }),
        meta: t("quiz.source", { y: snapYear }),
        options: shuffle([answer, ...far]),
        answer,
        explain: t("quiz.neighbours", { list: neighNames.slice(0, 8).join(", ") }),
      };
    }
  }

  // Which was bigger?
  if (f) {
    const a1 = areaKm2(f);
    const others = neigh.filter((g) => {
      const k = areaKm2(g) / a1;
      return k > 1.5 || k < 0.67;
    });
    if (others.length) {
      const g = pick(others);
      const a2 = areaKm2(g);
      out.bigger = {
        type: "choice",
        q: t("quiz.qBigger", { year: snapYear }),
        meta: t("quiz.source", { y: snapYear }),
        options: shuffle([self, g.properties.NAME]),
        answer: a1 > a2 ? self : g.properties.NAME,
        explain: t("quiz.areaFact", { a: self, x: fmtKm2(a1), b: g.properties.NAME, y: fmtKm2(a2) }),
      };
    }
  }

  // Find a neighbour on the map, with labels hidden.
  if (neighNames.length) {
    const target = pick(neighNames.filter((x) => x !== out.neighbour?.answer)) || pick(neighNames);
    const g = neigh.find((x) => x.properties.NAME === target);
    const [w1, s1, e1, n1] = bboxOf(f),
      [w2, s2, e2, n2] = bboxOf(g);
    out.click = {
      type: "click",
      q: t("quiz.qClick", { target }),
      target,
      fit: [Math.min(w1, w2), Math.min(s1, s2), Math.max(e1, e2), Math.max(n1, n2)],
    };
  }

  // Text questions from Wikipedia, in the UI language.
  const summary = await withTimeout(wikiSummary(r.nameEn, r.nameLocal), 6000);
  const subjectNames = [r.name, r.nameEn, r.nameLocal, summary?.title];
  if (summary?.extract) {
    const cands = plain(summary.extract)
      .split(/(?<=[.!?])\s+/)
      .map((s) => {
        const m = s.match(/(?<![\d.,])(\d{3,4})(?![\d.,])/);
        return m && +m[1] >= 100 && +m[1] <= 2025 ? { s, y: +m[1] } : null;
      })
      .filter(Boolean);
    if (cands.length) {
      const c = pick(cands);
      const opts = new Set([c.y]);
      while (opts.size < 4) {
        const v = c.y + (Math.random() < 0.5 ? -1 : 1) * (8 + Math.floor(Math.random() * 140));
        if (v > 0 && v <= 2025) opts.add(v);
      }
      out.year = {
        type: "choice",
        q: t("quiz.qYear"),
        meta: "Wikipedia",
        quote: maskName(c.s, subjectNames).replace(String(c.y), "____"),
        options: shuffle([...opts].map(String)),
        answer: String(c.y),
        explain: c.s,
      };
    }

    // Which description is about it? Others come from neighbours or labels on screen.
    let others = neighNames.slice();
    if (others.length < 3) {
      others.push(...map.queryRenderedFeatures({ layers: ["ohm-label"] }).map((x) => x.properties.name_en || x.properties.name));
    }
    others = shuffle([...new Set(others)].filter((n) => n && n !== r.nameEn && n !== self)).slice(0, 5);
    const sums = (await Promise.all(others.map((n) => withTimeout(wikiSummary(n), 5000))))
      .filter((s) => s?.extract && s.title !== summary.title)
      .slice(0, 3);
    if (sums.length === 3) {
      const mine = maskName(firstSentence(plain(summary.extract)), subjectNames);
      const opts = sums.map((s) => maskName(firstSentence(plain(s.extract)), [s.title, ...others]));
      out.desc = {
        type: "choice",
        q: t("quiz.qDesc", { name: r.name }),
        meta: "Wikipedia",
        options: shuffle([mine, ...opts]),
        answer: mine,
        explain: "",
      };
    }
  }

  return ["dates", "neighbour", "year", "click", "desc", "bigger"]
    .map((k) => out[k])
    .filter(Boolean)
    .slice(0, 5);
}

export async function startQuiz() {
  const r = state.region;
  if (!r) return;
  endTour();
  stopPlay();
  endClick();
  const token = ++quiz.token;
  $("#quiz-card").hidden = false;
  if (isPhone()) $("#region-card").hidden = true;
  $("#quiz-name").textContent = t("quiz.title", { name: r.name });
  $("#quiz-bar").style.width = "0%";
  $("#quiz-body").innerHTML =
    `<p class="quiz-meta">${esc(t("quiz.preparing"))}</p><span class="skeleton"></span><span class="skeleton" style="width:70%"></span>`;
  let qs = [];
  try {
    qs = await buildQuiz(r);
  } catch (e) {
    console.warn(e);
  }
  if (token !== quiz.token) return;
  if (qs.length < 3) {
    $("#quiz-body").innerHTML =
      `<p>${esc(t("quiz.notEnough"))}</p><div class="quiz-actions"><button class="btn btn-ghost btn-sm" data-action="quiz-close">${esc(t("quiz.close"))}</button></div>`;
    return;
  }
  Object.assign(quiz, { questions: qs, i: 0, score: 0, region: r });
  renderQuestion();
}

function renderQuestion() {
  const q = quiz.questions[quiz.i];
  const n = quiz.questions.length;
  $("#quiz-bar").style.width = `${(quiz.i / n) * 100}%`;
  let html = `<p class="quiz-meta">${esc(t("quiz.qOf", { i: quiz.i + 1, n }))}${q.meta ? ` · ${esc(q.meta)}` : ""}</p><p class="quiz-q">${esc(q.q)}</p>`;
  if (q.quote) html += `<p class="quiz-quote">${esc(q.quote)}</p>`;
  if (q.type === "click") {
    html += `<div id="quiz-ask"><p class="quiz-hint">${esc(t("quiz.qClickHint"))}</p><div class="quiz-actions"><button class="btn btn-ghost btn-sm" data-action="quiz-skip">${esc(t("quiz.skip"))}</button></div></div>`;
  } else {
    html += `<div class="quiz-opts">${q.options.map((o, k) => `<button class="q-opt" data-opt="${k}">${esc(o)}</button>`).join("")}</div>`;
  }
  $("#quiz-body").innerHTML = `${html}<div id="quiz-after"></div>`;
  if (q.type === "click") beginClick(q);
}

export function showAfter(ok, answer, explain) {
  const last = quiz.i === quiz.questions.length - 1;
  $("#quiz-after").innerHTML = `<p class="quiz-feedback"><b class="${ok ? "ok" : "no"}">${esc(t(ok ? "quiz.correct" : "quiz.wrong"))}</b>
    ${ok ? "" : esc(t("quiz.answerWas", { a: answer.length > 90 ? `${answer.slice(0, 90)}…` : answer }))}
    ${explain ? `<br><span class="muted">${esc(explain)}</span>` : ""}</p>
    <div class="quiz-actions"><button class="btn btn-red btn-sm" data-action="quiz-next">${esc(t(last ? "quiz.finish" : "quiz.next"))}</button></div>`;
  $("#quiz-after [data-action]").focus();
}

export function answerChoice(k) {
  const q = quiz.questions[quiz.i];
  const ok = q.options[k] === q.answer;
  if (ok) quiz.score++;
  $$("#quiz-body .q-opt").forEach((b, j) => {
    b.disabled = true;
    if (q.options[j] === q.answer) b.classList.add("right");
    else if (j === k) b.classList.add("wrong");
  });
  showAfter(ok, q.answer, q.explain);
}

function beginClick(q) {
  quiz.clickTarget = q.target;
  document.body.classList.add("quiz-clicking");
  for (const id of ["hist-label", "ohm-label", "ohm-label-4"]) map.setLayoutProperty(id, "visibility", "none");
  map.setLayoutProperty("hist-fill", "visibility", "visible");
  const [w, s, e, n] = q.fit;
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: isPhone() ? 40 : 90, duration: 1200, maxZoom: 7 },
  );
}

export function endClick() {
  if (!quiz.clickTarget) return;
  quiz.clickTarget = null;
  document.body.classList.remove("quiz-clicking");
  updateMix(map);
}

export function highlightByName(name) {
  const f = map.querySourceFeatures("hist", { filter: ["==", ["get", "NAME"], name] })[0];
  if (f?.id == null) return;
  if (selectedId != null) map.setFeatureState({ source: "hist", id: selectedId }, { sel: false });
  setSelectedId(f.id);
  map.setFeatureState({ source: "hist", id: f.id }, { sel: true });
}

export function quizMapClick(e) {
  const q = quiz.questions[quiz.i];
  const got = map.queryRenderedFeatures(e.point, { layers: ["hist-fill"] })[0]?.properties?.NAME;
  const ok = got === q.target;
  if (ok) quiz.score++;
  endClick();
  highlightByName(q.target);
  $("#quiz-ask")?.remove();
  showAfter(ok, q.target, ok ? "" : got ? t("quiz.clickedWrong", { got }) : t("quiz.clickedNothing"));
}

export function nextQuestion() {
  quiz.i++;
  if (quiz.i < quiz.questions.length) return renderQuestion();
  const n = quiz.questions.length,
    s = quiz.score;
  const best = store.get("quizBest", {});
  const key = quiz.region.nameEn;
  best[key] = Math.max(best[key] || 0, s);
  store.set("quizBest", best);
  $("#quiz-bar").style.width = "100%";
  const msg = t(s / n >= 0.8 ? "quiz.great" : s / n >= 0.5 ? "quiz.good" : "quiz.low");
  $("#quiz-body").innerHTML =
    `<div class="quiz-score"><div class="big">${s}/${n}</div><p>${esc(msg)}</p><p class="muted">${esc(t("quiz.best", { b: best[key], n }))}</p></div>
    <div class="quiz-actions"><button class="btn btn-ghost btn-sm" data-action="quiz-close">${esc(t("quiz.close"))}</button><button class="btn btn-red btn-sm" data-action="quiz-start">${esc(t("quiz.again"))}</button></div>`;
}

export function closeQuiz() {
  quiz.token++;
  endClick();
  $("#quiz-card").hidden = true;
}
