import { cmpMap, placeSwipe, setCompare, setCompareYear, swipeX } from "./compare.js";
import { LANGS } from "./constants.js";
import { goCity, hero, layoutHero, renderHero, SHOWCASE, scheduleHero, showEra, startHero, stopHero, syncSpinButton } from "./hero.js";
import { map, retryTint, setToggle, tintBasemap, updatePill } from "./map.js";
import { fitOverlay, overlayItem, overlayMap, removeOverlay, warp } from "./overlay.js";
import {
  cardHTML,
  exportSaved,
  itemIndex,
  refreshMaps,
  renderSaved,
  resetPanelKey,
  showFootprint,
  toggleFav,
  updateFavCount,
  yearOf,
} from "./panel.js";
import { answerChoice, closeQuiz, endClick, highlightByName, nextQuestion, quiz, showAfter, startQuiz } from "./quiz.js";
import { selectedId, setSelectedId } from "./regions.js";
import { searchBox } from "./search.js";
import { fmtYear, notes, state, t, toast } from "./state.js";
import { buildTicks, fitTicks, setYear, startPlay, stopPlay, yearInput } from "./timeline.js";
import { endTour, goStop, renderTourCard, renderTourList, startTour } from "./tours-ui.js";
import { $, $$, clamp, debounce, isPhone, store } from "./util.js";
import { closeViewer, currentItem, loadOsd, openViewer } from "./viewer.js";

// ───────── Modes, panel, sheet, theme, language ─────────
const resizeMaps = () =>
  setTimeout(() => {
    map.resize();
    cmpMap?.resize();
    fitTicks();
    if (state.compare) placeSwipe(swipeX);
  }, 320);

export function setMode(m) {
  if (state.mode === m) return;
  const prev = state.mode;
  state.mode = m;
  document.body.dataset.mode = m;
  if (prev === "landing") stopHero();
  if (m === "landing") {
    closeQuiz();
    endTour();
    startHero();
  }
  $("#panel-reopen").hidden = m !== "maps" || state.panelOpen;
  resizeMaps();
  if (m === "maps") refreshMaps();
  writeHash();
}

export function togglePanel(force) {
  state.panelOpen = force ?? !state.panelOpen;
  document.body.classList.toggle("panel-closed", !state.panelOpen);
  $("#panel-reopen").hidden = state.panelOpen || state.mode !== "maps";
  resizeMaps();
}

export function setSheet(s) {
  state.sheet = s;
  document.body.dataset.sheet = s;
}
export function openSheet() {
  if (isPhone() && state.sheet === "peek") setSheet("half");
}

function setTheme(th) {
  state.theme = th;
  document.documentElement.dataset.theme = th;
  $('meta[name="theme-color"]').content = th === "dark" ? "#1d1914" : "#f6f2ea";
  store.set("theme", th);
  for (const m of [map, cmpMap]) if (m?.getLayer("hist-fill")) tintBasemap(m);
}

export function applyI18n() {
  document.documentElement.lang = state.lang === "uz" ? "uz-Latn" : state.lang;
  $("#lang").value = state.lang;
  $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $$("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  $$("[data-i18n-attr]").forEach((el) =>
    el.dataset.i18nAttr.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":");
      el.setAttribute(attr, t(key));
    }),
  );
  buildTicks();
  renderTourList();
  renderTourCard();
  yearInput.value = fmtYear(state.year);
  $("#swipe-left-label").textContent = fmtYear(state.year);
  $("#swipe-right-label").textContent = fmtYear(state.compareYear);
  $("#compare-year").value = fmtYear(state.compareYear);
  updatePill();
  renderHero();
  updateFavCount();
}

function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  state.lang = lang;
  store.set("lang", lang);
  applyI18n();
  for (const m of [map, cmpMap]) if (m?.getLayer("hist-fill")) tintBasemap(m);
  $("#region-card").hidden = true;
  resetPanelKey();
  if (state.mode === "maps") refreshMaps();
  writeHash();
}

export const syncTabs = () => $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));

// ───────── URL hash (every view is shareable) ─────────
export const writeHash = debounce(() => {
  if (state.mode === "landing") {
    history.replaceState(null, "", location.pathname + location.search);
    return;
  }
  const c = map.getCenter();
  const p = new URLSearchParams();
  p.set("mode", state.mode);
  p.set("year", state.year);
  p.set("pos", `${map.getZoom().toFixed(2)}/${c.lat.toFixed(3)}/${c.lng.toFixed(3)}`);
  p.set("lang", state.lang);
  if (state.query) p.set("q", state.query);
  if (state.compare) p.set("cmp", state.compareYear);
  if (overlayItem) {
    p.set("ov", overlayItem.id.replace(/^am:/, ""));
    p.set("op", $("#ov-opacity").value);
  }
  if ($("#viewer").open && state.openMap) p.set("map", state.openMap);
  history.replaceState(null, "", `#${p.toString()}`);
}, 250);

// ───────── Event wiring ─────────
export function onAction(action, el) {
  switch (action) {
    case "zoom-in":
      map.zoomIn();
      break;
    case "zoom-out":
      map.zoomOut();
      break;
    case "north":
      map.easeTo({ bearing: 0, pitch: 0 });
      break;
    case "globe":
      state.globe = !state.globe;
      $("#globe-btn").classList.toggle("on", state.globe);
      if (state.globe && overlayItem) removeOverlay(); // warped maps render in Mercator only
      for (const m of [map, cmpMap]) m?.setProjection({ type: state.globe ? "globe" : "mercator" });
      break;
    case "borders":
      setToggle("borders", !state.borders);
      break;
    case "tint":
      setToggle("tint", !state.tint);
      break;
    case "compare":
      setCompare(!state.compare);
      break;
    case "cmp-step":
      setCompareYear(state.compareYear + Number(el.dataset.step));
      break;
    case "step":
      setYear(state.year + Number(el.dataset.step));
      break;
    case "play":
      state.playing ? stopPlay() : startPlay();
      break;
    case "help":
      $("#help-dialog").showModal();
      break;
    case "about":
      $("#about-dialog").showModal();
      break;
    case "tours":
      $("#tours-dialog").showModal();
      break;
    case "dialog-close":
      el.closest("dialog").close();
      break;
    case "theme":
      setTheme(state.theme === "dark" ? "light" : "dark");
      break;
    case "share":
      navigator.clipboard?.writeText(location.href).then(
        () => toast(t("toast.copied")),
        () => toast(location.href),
      );
      break;
    case "saved":
      state.tab = "saved";
      syncTabs();
      setMode("maps");
      if (!state.panelOpen) togglePanel(true);
      openSheet();
      renderSaved();
      break;
    case "panel-toggle":
      if (isPhone()) setSheet(state.sheet === "peek" ? "half" : "peek");
      else togglePanel();
      break;
    case "sheet-cycle":
      setSheet({ peek: "half", half: "full", full: "peek" }[state.sheet]);
      break;
    case "close-region":
      $("#region-card").hidden = true;
      if (selectedId != null) map.setFeatureState({ source: "hist", id: selectedId }, { sel: false });
      setSelectedId(null);
      break;
    case "region-maps":
      state.query = $("#region-card").dataset.name;
      state.tab = "all";
      syncTabs();
      setMode("maps");
      if (!state.panelOpen) togglePanel(true);
      openSheet();
      refreshMaps();
      break;
    case "retry-borders":
      retryTint();
      break;
    case "retry":
      resetPanelKey();
      refreshMaps();
      break;
    case "viewer-close":
      closeViewer();
      break;
    case "ov-fit":
      fitOverlay();
      break;
    case "ov-remove":
      removeOverlay();
      break;
    case "tour-next":
      goStop(state.tourStop + 1);
      break;
    case "tour-prev":
      goStop(state.tourStop - 1);
      break;
    case "tour-end":
      endTour();
      break;
    case "hero-spin":
      hero.paused = !hero.paused;
      syncSpinButton();
      if (!hero.paused) showEra((hero.idx + 1) % SHOWCASE.length, true);
      scheduleHero();
      break;
    case "quiz-start":
      startQuiz();
      break;
    case "quiz-close":
      closeQuiz();
      break;
    case "quiz-next":
      nextQuestion();
      break;
    case "quiz-skip": {
      const q = quiz.questions[quiz.i];
      endClick();
      highlightByName(q.target);
      $("#quiz-ask")?.remove();
      showAfter(false, q.target, "");
      break;
    }
  }
}

export function wireUI() {
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) {
      e.preventDefault();
      if (go.dataset.go === "maps") {
        state.tab = "all";
        syncTabs();
      }
      setMode(go.dataset.go);
      return;
    }
    const tour = e.target.closest("[data-tour]");
    if (tour) {
      e.preventDefault();
      startTour(tour.dataset.tour);
      return;
    }
    const city = e.target.closest("[data-city]");
    if (city) {
      e.preventDefault();
      goCity(city.dataset.city);
      return;
    }
    const opt = e.target.closest("#quiz-body [data-opt]");
    if (opt) {
      e.preventDefault();
      answerChoice(+opt.dataset.opt);
      return;
    }
    const act = e.target.closest("[data-action]");
    if (act) {
      e.preventDefault();
      onAction(act.dataset.action, act);
    }
  });

  const cards = $("#cards");
  cards.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      e.stopPropagation();
      toggleFav(fav.dataset.fav);
      return;
    }
    const ov = e.target.closest("[data-overlay]");
    if (ov) {
      e.stopPropagation();
      overlayMap(itemIndex[ov.dataset.overlay]);
      if (isPhone()) setSheet("peek");
      return;
    }
    const card = e.target.closest(".card[data-id]");
    if (card) openViewer(itemIndex[card.dataset.id]);
  });
  cards.addEventListener("keydown", (e) => {
    const card = e.target.closest(".card[data-id]");
    if (card && e.key === "Enter") openViewer(itemIndex[card.dataset.id]);
  });
  cards.addEventListener("mouseover", (e) => {
    const card = e.target.closest(".card[data-id]");
    showFootprint(card && card.dataset.id !== overlayItem?.id ? itemIndex[card.dataset.id] : null);
    if (card) loadOsd().catch(() => {});
  });
  cards.addEventListener("mouseleave", () => showFootprint(null));

  $("#export-saved").addEventListener("click", exportSaved);
  $("#query-chip").addEventListener("click", () => {
    state.query = null;
    refreshMaps();
    writeHash();
  });
  $$(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      syncTabs();
      resetPanelKey();
      refreshMaps();
    }),
  );
  $("#window").addEventListener("change", (e) => {
    state.windowYrs = +e.target.value;
    refreshMaps();
  });
  $("#source").addEventListener("change", (e) => {
    state.source = e.target.value;
    refreshMaps();
  });
  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    refreshMaps();
  });
  $("#lang").addEventListener("change", (e) => setLang(e.target.value));
  $("#ov-opacity").addEventListener("input", (e) => {
    warp?.setOpacity(+e.target.value);
    writeHash();
  });

  // Viewer
  $("#v-fav").addEventListener("click", () => toggleFav(currentItem.id));
  $("#v-overlay").addEventListener("click", () => overlayMap(currentItem));
  $("#v-jump").addEventListener("click", () => {
    setYear(yearOf(currentItem));
    closeViewer();
    toast(t("toast.timeline", { y: currentItem.date }));
  });
  const saveNote = debounce((id, v) => {
    if (v.trim()) notes[id] = v;
    else delete notes[id];
    store.set("notes", notes);
  }, 400);
  $("#v-notes").addEventListener("input", (e) => saveNote(currentItem.id, e.target.value));
  $("#v-notes").addEventListener("keydown", (e) => e.stopPropagation());
  $("#viewer").addEventListener("close", () => {
    state.openMap = null;
    writeHash();
    if (currentItem) $$(`.card[data-id="${CSS.escape(currentItem.id)}"]`).forEach((c) => (c.outerHTML = cardHTML(currentItem)));
  });
  $$("dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close();
    }),
  );

  // Swipe the bottom sheet on phones.
  const grip = $(".sheet-grip");
  let startY = null;
  grip.addEventListener("touchstart", (e) => (startY = e.touches[0].clientY), { passive: true });
  grip.addEventListener("touchend", (e) => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    startY = null;
    if (Math.abs(dy) < 30) return;
    const order = ["peek", "half", "full"];
    const i = order.indexOf(state.sheet) + (dy < 0 ? 1 : -1);
    setSheet(order[clamp(i, 0, 2)]);
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($$("dialog[open]").length) return; // dialogs handle Esc themselves
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight":
        if (state.mode === "landing") return;
        e.preventDefault();
        setYear(state.year + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1));
        break;
      case " ":
        if (state.mode === "landing") return;
        e.preventDefault();
        state.playing ? stopPlay() : startPlay();
        break;
      case "/":
        e.preventDefault();
        searchBox.focus();
        break;
      case "b":
      case "B":
        setToggle("borders", !state.borders);
        break;
      case "t":
      case "T":
        setToggle("tint", !state.tint);
        break;
      case "c":
      case "C":
        setCompare(!state.compare);
        break;
      case "m":
      case "M":
        setMode("maps");
        break;
      case "h":
      case "H":
        setMode("history");
        break;
      case "?":
        $("#help-dialog").showModal();
        break;
      case "Escape":
        if (!$("#quiz-card").hidden) closeQuiz();
        else if (state.compare) setCompare(false);
        else if (!$("#region-card").hidden) onAction("close-region");
        else if (overlayItem) removeOverlay();
        else if (state.tour) endTour();
        break;
    }
  });

  addEventListener(
    "resize",
    debounce(() => {
      fitTicks();
      if (state.compare) placeSwipe(swipeX);
      if (state.mode === "landing") layoutHero();
    }, 100),
  );
  for (const ev of ["mousedown", "touchstart", "wheel"])
    map.on(ev, () => {
      if (state.mode === "landing") hero.touched = Date.now();
    });
}
