import { map } from "./map.js";
import { nominatim, refreshMaps } from "./panel.js";
import { state, t } from "./state.js";
import { openSheet, setMode, syncTabs } from "./ui.js";
import { $, clamp, debounce, esc } from "./util.js";

// ───────── Search ─────────
let searchItems = [];
let searchActive = 0;
export const searchBox = $("#search");
const searchList = $("#search-results");

function renderSearch() {
  searchList.hidden = !searchItems.length;
  searchBox.setAttribute("aria-expanded", String(!!searchItems.length));
  searchList.innerHTML = searchItems
    .map(
      (s, i) => `<li role="option" class="${i === searchActive ? "active" : ""}" data-i="${i}">
    <span class="kind">${esc(t(s.kind === "maps" ? "search.kindMaps" : "search.kindPlace"))}</span>
    <span>${esc(s.label)}${s.sub ? `<br><small>${esc(s.sub)}</small>` : ""}</span></li>`,
    )
    .join("");
}

const searchPlaces = debounce(async (text) => {
  if (text.length < 2) return;
  try {
    const res = await nominatim(`/search?format=jsonv2&limit=5&q=${encodeURIComponent(text)}`);
    if (searchBox.value.trim() !== text) return;
    searchItems = [
      searchItems[0],
      ...res.map((r) => ({
        kind: "place",
        label: r.name || r.display_name.split(",")[0],
        sub: r.display_name,
        bbox: r.boundingbox.map(Number),
      })),
    ];
    renderSearch();
  } catch {
    /* search is best effort */
  }
}, 450);

function chooseSearch(i) {
  const s = searchItems[i];
  if (!s) return;
  searchItems = [];
  renderSearch();
  searchBox.blur();
  state.tab = "all";
  syncTabs();
  if (s.kind === "maps") {
    state.query = s.text;
    setMode("maps");
    openSheet();
    refreshMaps();
  } else {
    state.query = null;
    if (state.mode === "landing") setMode("maps");
    const [s1, n1, w1, e1] = s.bbox;
    map.fitBounds(
      [
        [w1, s1],
        [e1, n1],
      ],
      { padding: 60, maxZoom: 9, duration: 1800 },
    );
  }
}

export function wireSearch() {
  searchBox.addEventListener("input", () => {
    const text = searchBox.value.trim();
    searchActive = 0;
    searchItems = text ? [{ kind: "maps", label: t("search.maps", { q: text }), text }] : [];
    renderSearch();
    searchPlaces(text);
  });
  searchBox.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      searchActive = clamp(searchActive + (e.key === "ArrowDown" ? 1 : -1), 0, searchItems.length - 1);
      renderSearch();
    } else if (e.key === "Enter") {
      e.preventDefault();
      chooseSearch(searchActive);
    } else if (e.key === "Escape") {
      searchItems = [];
      renderSearch();
      searchBox.blur();
    }
    e.stopPropagation();
  });
  searchList.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li");
    if (li) {
      e.preventDefault();
      chooseSearch(+li.dataset.i);
    }
  });
  searchBox.addEventListener("blur", () =>
    setTimeout(() => {
      searchItems = [];
      renderSearch();
    }, 150),
  );
}
