(() => {
  "use strict";

  const STORAGE_KEY = "rapidlog.v1";
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];

  function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 미리 잘 어울리게 짜둔 색 계열들. 랜덤으로 아무 색상각(hue)이나 뽑는 대신
  // 이 목록 안에서만 고르기 때문에 "따로 노는 3색 조합"이 안 나옴.
  const HUE_FAMILIES = {
    gold:      ["#FCE9B0", "#E8A33D", "#B9791F"],
    amber:     ["#FFD79A", "#E8862E", "#A8541A"],
    sunset:    ["#FFB199", "#E85C4A", "#A6305C"],
    rose:      ["#FBC7DA", "#E24E86", "#A32E5C"],
    ocean:     ["#B7E8F5", "#3AA8D8", "#1E6FA6"],
    teal:      ["#A9EBD9", "#2FA88C", "#1C7A63"],
    forest:    ["#BFE3A0", "#4C9A4A", "#2C6B2E"],
    orchid:    ["#D9BFF0", "#8E4FC9", "#5C2E8C"],
    plum:      ["#E7BEE0", "#A24E9A", "#6E2E6B"],
    champagne: ["#FFF6DE", "#E8D3A0", "#B08D4E"],
    ember:     ["#FFD9A0", "#D9713D", "#8C3B1E"],
    indigo:    ["#C9D3F5", "#5A6FD9", "#33409C"],
  };
  // 서로 섞였을 때 실제로 예쁜 궁합만 미리 골라둔 2계열 조합 목록 (아무 계열끼리나 랜덤 조합 X)
  const DUO_COMBOS = [
    ["gold", "forest"], ["ocean", "indigo"], ["sunset", "amber"],
    ["orchid", "plum"], ["rose", "gold"], ["teal", "gold"],
  ];
  const FAMILY_NAMES = Object.keys(HUE_FAMILIES);

  // 대부분(65%)은 한 색 계열 안에서만 명암 차이를 주고, 가끔(35%)만 궁합 좋은 두 계열을 섞음.
  // 어느 쪽이든 "미리 검증된 조합"에서만 뽑기 때문에 결과가 항상 실제로 어울림.
  function generatePalette(rand) {
    if (rand() < 0.65) {
      const name = FAMILY_NAMES[Math.floor(rand() * FAMILY_NAMES.length)];
      return HUE_FAMILIES[name].slice();
    }
    const [nameA, nameB] = DUO_COMBOS[Math.floor(rand() * DUO_COMBOS.length)];
    const a = HUE_FAMILIES[nameA], b = HUE_FAMILIES[nameB];
    return [a[0], b[0], a[1], b[1], a[2], b[2]];
  }

  // 이전엔 각도·길이·개수를 전부 연속값으로 무작위 생성해서 가끔 못생긴 결과가 나왔음.
  // 대신 실제로 예쁜 8가지 "종(species)"을 미리 튜닝해두고, 그 틀 안에서만 살짝(최대 ±14%) 흔들어서
  // 조합(종 8 × 색 계열/듀오 18 × 링 유무 × 회전각)은 사실상 무한이면서 결과 품질은 보장되게 함.
  const SPECIES = [
    { kind: "spike", n: 7,  outerR: 34, innerR: 5,  widthFactor: 0.085, ring: false }, // 뾰족·골드 계열
    { kind: "round", n: 5,  orbitR: 15, petalR: 15, ring: false },                     // 둥근 로제트
    { kind: "spike", n: 10, outerR: 29, innerR: 6,  widthFactor: 0.12,  ring: false }, // 중간 촘촘한 핀휠
    { kind: "chunky", n: 4, len: 30,    width: 20,  ring: true },                      // 통통·안쪽 링·보태니컬
    { kind: "spike", n: 9,  outerR: 31, innerR: 5,  widthFactor: 0.07,  ring: false }, // 뾰족·가늘게
    { kind: "round", n: 11, orbitR: 13, petalR: 11, ring: true },                      // 둥근·안쪽 링
    { kind: "leaf",  n: 6,  len: 32,    width: 7,   ring: false },                     // 잎맥 보태니컬
    { kind: "round", n: 8,  orbitR: 11, petalR: 13, ring: false },                     // 촘촘한 블룸
    { kind: "teardrop", n: 3, len: 33, width: 13, ring: false },                       // 둥근 물방울 클러스터
  ];
  const jitter = (rand, v, amt = 0.14) => v * (1 + (rand() * 2 - 1) * amt);

  // 날짜(key)를 시드로 매번 다른 형태·색조합이 나오는 문양 SVG를 생성 (같은 날짜는 항상 같은 결과)
  function generateOrnamentSVG(key, size) {
    const rand = mulberry32(hashSeed(key));
    const folder = generatePalette(rand);
    const centerColor = folder[Math.floor(rand() * folder.length)];
    const rotationOffset = rand() * 360;
    const sp = SPECIES[Math.floor(rand() * SPECIES.length)];
    let shapes = "";

    if (sp.kind === "spike") {
      const n = sp.n;
      const outerR = jitter(rand, sp.outerR), innerR = jitter(rand, sp.innerR);
      for (let i = 0; i < n; i++) {
        const a = ((rotationOffset + i * (360 / n)) * Math.PI) / 180;
        const spread = ((360 / n) * sp.widthFactor * Math.PI) / 180;
        const tipR = outerR * (0.85 + rand() * 0.25);
        const x1 = innerR * Math.cos(a - spread), y1 = innerR * Math.sin(a - spread);
        const x2 = tipR * Math.cos(a), y2 = tipR * Math.sin(a);
        const x3 = innerR * Math.cos(a + spread), y3 = innerR * Math.sin(a + spread);
        shapes += `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} L${x3.toFixed(1)},${y3.toFixed(1)} Z" fill="${folder[i % folder.length]}"/>`;
      }
    } else if (sp.kind === "round") {
      const n = sp.n;
      const orbitR = jitter(rand, sp.orbitR), petalR = jitter(rand, sp.petalR);
      for (let i = 0; i < n; i++) {
        const a = ((rotationOffset + i * (360 / n)) * Math.PI) / 180;
        const cx = orbitR * Math.cos(a), cy = orbitR * Math.sin(a);
        shapes += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${petalR.toFixed(1)}" fill="${folder[i % folder.length]}" opacity="0.88"/>`;
      }
    } else if (sp.kind === "chunky") {
      const n = sp.n;
      const len = jitter(rand, sp.len), width = jitter(rand, sp.width);
      for (let i = 0; i < n; i++) {
        const a = ((rotationOffset + i * (360 / n)) * Math.PI) / 180;
        const tipX = len * Math.cos(a), tipY = len * Math.sin(a);
        const perpX = -Math.sin(a) * width, perpY = Math.cos(a) * width;
        const midR = len * 0.42;
        const midX = midR * Math.cos(a), midY = midR * Math.sin(a);
        const c1x = midX + perpX, c1y = midY + perpY;
        const c2x = midX - perpX, c2y = midY - perpY;
        const bx = tipX + perpX * 0.3, by = tipY + perpY * 0.3;
        const dx = tipX - perpX * 0.3, dy = tipY - perpY * 0.3;
        shapes += `<path d="M0,0 C${c1x.toFixed(1)},${c1y.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} C${dx.toFixed(1)},${dy.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} 0,0 Z" fill="${folder[i % folder.length]}" opacity="0.92"/>`;
      }
    } else if (sp.kind === "leaf") {
      const n = sp.n;
      const len = jitter(rand, sp.len), width = jitter(rand, sp.width);
      for (let i = 0; i < n; i++) {
        const a = ((rotationOffset + i * (360 / n)) * Math.PI) / 180;
        const tipX = len * Math.cos(a), tipY = len * Math.sin(a);
        const perpX = -Math.sin(a) * width, perpY = Math.cos(a) * width;
        const midR = len * 0.5;
        const midX = midR * Math.cos(a), midY = midR * Math.sin(a);
        const color = folder[i % folder.length];
        shapes += `<path d="M0,0 Q${(midX + perpX).toFixed(1)},${(midY + perpY).toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} Q${(midX - perpX).toFixed(1)},${(midY - perpY).toFixed(1)} 0,0 Z" fill="${color}" opacity="0.9"/>`;
        shapes += `<line x1="0" y1="0" x2="${(tipX * 0.85).toFixed(1)}" y2="${(tipY * 0.85).toFixed(1)}" stroke="${centerColor}" stroke-width="0.6" opacity="0.35"/>`;
      }
    } else {
      // teardrop: 중심에서 살짝 벗어난 곳에 둥근 물방울들이 겹쳐 뭉친 클러스터
      const n = sp.n;
      const len = jitter(rand, sp.len), width = jitter(rand, sp.width);
      const offset = len * 0.22;
      for (let i = 0; i < n; i++) {
        const a = ((rotationOffset + i * (360 / n)) * Math.PI) / 180;
        const baseX = offset * Math.cos(a), baseY = offset * Math.sin(a);
        const tipX = baseX + len * Math.cos(a), tipY = baseY + len * Math.sin(a);
        const perpX = -Math.sin(a) * width, perpY = Math.cos(a) * width;
        const midR = len * 0.62;
        const midX = baseX + midR * Math.cos(a), midY = baseY + midR * Math.sin(a);
        const color = folder[i % folder.length];
        shapes += `<path d="M${baseX.toFixed(1)},${baseY.toFixed(1)} Q${(midX + perpX).toFixed(1)},${(midY + perpY).toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} Q${(midX - perpX).toFixed(1)},${(midY - perpY).toFixed(1)} ${baseX.toFixed(1)},${baseY.toFixed(1)} Z" fill="${color}" opacity="0.9"/>`;
      }
    }

    if (sp.ring || rand() < 0.15) {
      const ringR = 12 + rand() * 12;
      const thick = rand() < 0.5;
      const sw = thick ? 2.5 + rand() * 2.5 : 0.8 + rand() * 0.6;
      shapes += `<circle r="${ringR.toFixed(1)}" fill="none" stroke="${centerColor}" stroke-width="${sw.toFixed(1)}" opacity="${thick ? 0.5 : 0.55}"/>`;
    }
    shapes += `<circle r="${(4 + rand() * 3).toFixed(1)}" fill="${centerColor}"/>`;
    return `<svg viewBox="-50 -50 100 100" width="${size}" height="${size}" style="overflow:visible">${shapes}</svg>`;
  }


  // ---------- 테마 ----------
  const THEME_KEY = "rapidlog.theme";
  const THEMES = [
    { id: "classic-white", name: "클래식 화이트", group: "light" },
    { id: "ivory-cream", name: "아이보리 크림", group: "light" },
    { id: "mint-dawn", name: "민트 새벽", group: "light" },
    { id: "lavender-mist", name: "라벤더 미스트", group: "light" },
    { id: "peach-coral", name: "피치 산호", group: "light" },
    { id: "midnight-black", name: "미드나잇 블랙", group: "dark" },
    { id: "deep-forest", name: "딥 포레스트", group: "dark" },
    { id: "indigo-night", name: "인디고 나이트", group: "dark" },
    { id: "wine-dark", name: "와인 다크", group: "dark" },
    { id: "opal-pearl-dark", name: "오묘한 펄 다크", group: "dark" },
  ];
  function applyTheme(id) {
    document.documentElement.setAttribute("data-theme", id);
    try { localStorage.setItem(THEME_KEY, id); } catch (e) {}
  }
  function loadTheme() {
    let id = "classic-white";
    try { id = localStorage.getItem(THEME_KEY) || id; } catch (e) {}
    applyTheme(id);
  }
  function renderThemeList() {
    const wrap = $("#themeList");
    if (!wrap) return;
    const current = document.documentElement.getAttribute("data-theme") || "classic-white";
    const row = (t) => `<button class="theme-swatch ${t.id === current ? "active" : ""}" data-theme-id="${t.id}"><span class="theme-dot ${t.id}"></span>${t.name}</button>`;
    wrap.innerHTML =
      `<p class="theme-group-label">라이트</p><div class="theme-grid">${THEMES.filter(t => t.group === "light").map(row).join("")}</div>` +
      `<p class="theme-group-label">다크</p><div class="theme-grid">${THEMES.filter(t => t.group === "dark").map(row).join("")}</div>`;
    wrap.querySelectorAll("[data-theme-id]").forEach(btn => {
      btn.addEventListener("click", () => { applyTheme(btn.dataset.themeId); renderThemeList(); });
    });
  }
  loadTheme();

  function computeStreak(uptoKey) {
    let streak = 0;
    const d = keyToDate(uptoKey);
    if (!state.completedDays[uptoKey]) d.setDate(d.getDate() - 1);
    while (state.completedDays[fmtKey(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  // ---------- STATE ----------
  const defaultState = () => ({ entries: {}, gratitude: {}, habits: [], habitLogs: {}, completedDays: {}, monthlyGoals: {} });

  let state = load();
  let currentView = "today";
  let currentDate = new Date();          // date shown in Today view
  let monthCursor = new Date();          // month shown in Monthly view
  let dpCursor = new Date();             // month shown in date-picker sheet
  let pendingType = "task";

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const merged = { ...defaultState(), ...parsed };
      // migrate legacy items (done:boolean) -> status:string
      Object.keys(merged.entries).forEach(k => {
        merged.entries[k] = (merged.entries[k] || []).map(it => {
          if (it.type === "task" && it.status === undefined) {
            it.status = it.done ? "done" : "open";
          }
          if (it.priority === undefined) it.priority = false;
          return it;
        });
      });
      return merged;
    } catch (e) {
      console.error("load failed", e);
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("save failed", e);
      alert("저장에 실패했어. 브라우저 저장공간이 꽉 찼을 수도 있어.");
    }
  }

  function fmtKey(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function keyToDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function nextDayKey(key) {
    const d = keyToDate(key);
    d.setDate(d.getDate() + 1);
    return fmtKey(d);
  }

  function isSameDay(a, b) { return fmtKey(a) === fmtKey(b); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function monthKeyOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

  function getGoal(monthKey, goalId) {
    return (state.monthlyGoals[monthKey] || []).find(g => g.id === goalId);
  }

  function addGoalProgress(monthKey, goalId, amount) {
    const g = getGoal(monthKey, goalId);
    if (!g) return;
    g.progress = Math.round(((g.progress || 0) + amount) * 10) / 10;
  }

  function subtractGoalProgress(monthKey, goalId, amount) {
    const g = getGoal(monthKey, goalId);
    if (!g) return;
    g.progress = Math.round(Math.max(0, (g.progress || 0) - amount) * 10) / 10;
  }

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const viewTitle = $("#viewTitle");
  const viewSubtitle = $("#viewSubtitle");
  const perfectBadge = $("#perfectBadge");
  const streakNote = $("#streakNote");
  const mainEl = $("#main");
  const appEl = $("#app");
  const dayCompleteFrame = $("#dayCompleteFrame");
  const rapidList = $("#rapidList");
  makeSortable(rapidList, (newOrderIds) => {
    const key = fmtKey(currentDate);
    const arr = state.entries[key] || [];
    const byId = Object.fromEntries(arr.map(it => [it.id, it]));
    const reordered = newOrderIds.map(id => byId[id]).filter(Boolean);
    // 안전장치: 혹시 누락된 항목 있으면 뒤에 붙임
    arr.forEach(it => { if (!reordered.includes(it)) reordered.push(it); });
    state.entries[key] = reordered;
    save();
  });
  const overdueBlock = $("#overdueBlock");
  const overdueList = $("#overdueList");
  const gratitudeInput = $("#gratitudeInput");
  const monthLabel = $("#monthLabel");
  const monthList = $("#monthList");
  const habitGrid = $("#habitGrid");
  const gemCountEl = $("#gemCount");
  const goalList = $("#goalList");
  const goalPicker = $("#goalPicker");
  const goalPickerList = $("#goalPickerList");
  let pendingGoalId = null;

  // ---------- OVERLAY SAFETY: 한 번에 하나만 열리도록 강제 ----------
  function closeAllOverlays() {
    document.querySelectorAll(".sheet-overlay").forEach(o => { o.hidden = true; });
  }

  // ---------- COMPLETION / COLLECTION ----------
  function isDayComplete(key) {
    const list = state.entries[key] || [];
    const tasks = list.filter(it => it.type === "task");
    if (tasks.length === 0) return false;
    return tasks.every(it => it.status === "done");
  }

  // 하루 완료 상태를 실제 항목 상태와 항상 동기화. 완료 -> 보석 획득, 완료 취소/삭제로 다시 미완료가 되면 보석도 회수.
  function syncDayCompletion(key) {
    const complete = isDayComplete(key);
    if (complete && !state.completedDays[key]) {
      state.completedDays[key] = true;
      save();
    } else if (!complete && state.completedDays[key]) {
      delete state.completedDays[key];
      save();
    }
  }

  function updateGemCountUI() {
    if (gemCountEl) gemCountEl.textContent = Object.keys(state.completedDays).length;
  }

  const gemVaultOverlay = $("#gemVaultOverlay");
  const gemVaultGrid = $("#gemVaultGrid");
  const gemVaultCount = $("#gemVaultCount");
  const gemVaultSelectedInfo = $("#gemVaultSelectedInfo");

  function renderGemVault() {
    const keys = Object.keys(state.completedDays).sort().reverse();
    gemVaultCount.textContent = keys.length;
    gemVaultSelectedInfo.textContent = "";
    gemVaultGrid.innerHTML = "";
    if (keys.length === 0) {
      gemVaultGrid.innerHTML = `<p style="color:var(--ink-faint);font-size:13px;">아직 모은 문양이 없어. 하루를 완벽하게 채워봐.</p>`;
      return;
    }
    keys.forEach(key => {
      const btn = document.createElement("button");
      btn.className = "gem-vault-item";
      btn.dataset.key = key;
      btn.innerHTML = generateOrnamentSVG(key, 40);
      gemVaultGrid.appendChild(btn);
    });
  }

  gemVaultGrid.addEventListener("click", (e) => {
    const item = e.target.closest(".gem-vault-item");
    if (!item) return;
    const date = keyToDate(item.dataset.key);
    gemVaultSelectedInfo.textContent = date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }) + "의 완벽한 하루";
    gemVaultGrid.querySelectorAll(".gem-vault-item.selected").forEach(el => el.classList.remove("selected"));
    item.classList.add("selected");
  });

  $("#openGemVault").addEventListener("click", () => {
    closeAllOverlays();
    renderGemVault();
    gemVaultOverlay.hidden = false;
  });
  $("#closeGemVault").addEventListener("click", () => gemVaultOverlay.hidden = true);
  gemVaultOverlay.addEventListener("click", (e) => { if (e.target === gemVaultOverlay) gemVaultOverlay.hidden = true; });

  // ---------- VIEW SWITCH ----------
  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
    $(`#view-${view}`).classList.add("active");
    closeSideMenu();
    const titleTextNode = viewTitle.firstChild;
    if (view === "today") {
      titleTextNode.textContent = isSameDay(currentDate, new Date()) ? "오늘 " : "일지 ";
      renderToday();
    }
    if (view === "monthly") { titleTextNode.textContent = "Monthly "; perfectBadge.hidden = true; appEl.classList.remove("day-complete"); dayCompleteFrame.classList.remove("active"); renderMonthly(); }
    if (view === "habits") { titleTextNode.textContent = "Habits "; perfectBadge.hidden = true; appEl.classList.remove("day-complete"); dayCompleteFrame.classList.remove("active"); renderHabits(); }
    updateSubtitle();
    updateGemCountUI();
  }

  function updateSubtitle() {
    if (currentView === "today") {
      viewSubtitle.textContent = currentDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
    } else {
      viewSubtitle.textContent = "";
    }
  }

  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => switchView(t.dataset.view)));
  document.querySelectorAll(".menu-item[data-view]").forEach(t => t.addEventListener("click", () => switchView(t.dataset.view)));

  // ---------- TODAY VIEW ----------
  function glyphFor(type, status) {
    if (type === "task") {
      if (status === "migrated") return `<span class="glyph arrow"></span>`;
      if (status === "done") return `<span class="glyph check"></span>`;
      return `<span class="glyph dot"></span>`;
    }
    if (type === "note") return `<span class="glyph dash"></span>`;
    return `<span class="glyph circle"></span>`;
  }

  function renderToday() {
    const key = fmtKey(currentDate);
    const list = state.entries[key] || [];
    rapidList.innerHTML = "";
    if (list.length === 0) {
      rapidList.innerHTML = `<li class="rapid-item"><span class="body"><span class="text" style="color:var(--ink-faint)">아직 아무것도 없어. 아래에서 추가해봐.</span></span></li>`;
    }
    list.forEach(item => rapidList.appendChild(renderItem(item, key)));

    // overdue: open tasks from previous days
    const overdue = [];
    Object.keys(state.entries).forEach(k => {
      if (k >= key) return;
      (state.entries[k] || []).forEach(it => {
        if (it.type === "task" && it.status === "open") overdue.push({ ...it, sourceKey: k });
      });
    });
    overdue.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
    if (overdue.length) {
      overdueBlock.hidden = false;
      overdueList.innerHTML = "";
      overdue.forEach(it => overdueList.appendChild(renderItem(it, it.sourceKey, true)));
    } else {
      overdueBlock.hidden = true;
    }

    gratitudeInput.value = state.gratitude[key] || "";

    // perfect-day visuals
    const complete = isDayComplete(key);
    appEl.classList.toggle("day-complete", complete);
    dayCompleteFrame.classList.toggle("active", complete);
    if (complete) {
      perfectBadge.hidden = false;
      perfectBadge.innerHTML = generateOrnamentSVG(key, 26);
    } else {
      perfectBadge.hidden = true;
      perfectBadge.innerHTML = "";
    }

    // 연속기록 (실제 오늘을 보고 있을 때만)
    if (isSameDay(currentDate, new Date())) {
      const streak = computeStreak(key);
      streakNote.textContent = streak > 0 ? `${streak}일 연속 달성중` : "";
      streakNote.hidden = streak === 0;
    } else {
      streakNote.hidden = true;
    }
  }

  function renderItem(item, dateKey, showMigrateIn = false) {
    const li = document.createElement("li");
    const isTask = item.type === "task";
    const status = isTask ? item.status : null;
    li.className = "rapid-item" + (status === "done" ? " done" : "") + (status === "migrated" ? " migrated" : "");
    const draggable = !showMigrateIn;
    if (draggable) li.dataset.id = item.id;
    const metaBits = [];
    if (showMigrateIn) metaBits.push(keyToDate(dateKey).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }));

    const starHtml = isTask && status !== "migrated"
      ? `<button class="star-toggle ${item.priority ? "active" : ""}" data-action="star" data-id="${item.id}" data-key="${dateKey}" aria-label="중요 표시">${item.priority ? "★" : "☆"}</button>`
      : "";

    let goalTagHtml = "";
    if (item.goalId) {
      const g = getGoal(item.goalMonth, item.goalId);
      if (g) goalTagHtml = `<span class="goal-tag">${escapeHtml(g.title)}</span>`;
    }

    const dragHandleHtml = draggable ? `<button class="drag-handle" aria-label="순서변경">⠿</button>` : "";

    li.innerHTML = `
      <button class="glyph-btn" data-action="toggle" data-id="${item.id}" data-key="${dateKey}">${glyphFor(item.type, status)}</button>
      <div class="body">
        <div class="text-row" style="display:flex;align-items:center;gap:4px;">
          ${starHtml}
          <div class="text">${goalTagHtml}${escapeHtml(item.text)}</div>
        </div>
        ${metaBits.length ? `<div class="meta-row"><span>${metaBits.join(" · ")}</span></div>` : ""}
      </div>
      ${dragHandleHtml}
      ${showMigrateIn ? `<button class="del-btn" data-action="migrate-in" data-id="${item.id}" data-key="${dateKey}" title="오늘로 이동">→</button>` : `<button class="del-btn" data-action="delete" data-id="${item.id}" data-key="${dateKey}">×</button>`}
    `;

    // long-press to migrate forward (only plain open tasks, only in the main today list, not overdue block)
    if (isTask && status === "open" && !showMigrateIn) {
      attachLongPress(li, () => migrateForward(item.id, dateKey));
    }
    // tap the arrow glyph to cancel a migration
    if (isTask && status === "migrated") {
      const gbtn = li.querySelector(".glyph-btn");
      gbtn.dataset.action = "unmigrate";
    }

    return li;
  }

  function makeSortable(listEl, onReorder) {
    let dragEl = null;

    listEl.addEventListener("pointerdown", (e) => {
      const handle = e.target.closest(".drag-handle");
      if (!handle) return;
      const li = handle.closest("li.rapid-item");
      if (!li || !li.dataset.id) return;
      e.preventDefault();
      dragEl = li;
      dragEl.classList.add("dragging");
      try { dragEl.setPointerCapture(e.pointerId); } catch (err) {}

      const onMove = (ev) => {
        if (!dragEl) return;
        const y = ev.clientY;
        const siblings = [...listEl.querySelectorAll("li.rapid-item[data-id]:not(.dragging)")];
        let next = null;
        for (const sib of siblings) {
          const rect = sib.getBoundingClientRect();
          if (y < rect.top + rect.height / 2) { next = sib; break; }
        }
        if (next) listEl.insertBefore(dragEl, next);
        else listEl.appendChild(dragEl);
      };
      const onUp = (ev) => {
        if (dragEl) {
          dragEl.classList.remove("dragging");
          try { dragEl.releasePointerCapture(ev.pointerId); } catch (err) {}
        }
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        const newOrder = [...listEl.querySelectorAll("li.rapid-item[data-id]")].map(el => el.dataset.id);
        dragEl = null;
        onReorder(newOrder);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function attachLongPress(el, onLongPress) {
    let timer = null;
    let triggered = false;
    let startX = 0, startY = 0;

    const cancel = () => { clearTimeout(timer); timer = null; };

    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return; // don't hijack button taps
      triggered = false;
      startX = e.clientX; startY = e.clientY;
      timer = setTimeout(() => {
        triggered = true;
        el.classList.add("long-press-active");
        if (navigator.vibrate) navigator.vibrate(12);
        onLongPress();
      }, 550);
    });
    el.addEventListener("pointermove", (e) => {
      if (!timer) return;
      if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) cancel();
    });
    el.addEventListener("pointerup", () => { cancel(); el.classList.remove("long-press-active"); });
    el.addEventListener("pointercancel", () => { cancel(); el.classList.remove("long-press-active"); });
    el.addEventListener("click", (e) => {
      if (triggered) { e.stopPropagation(); e.preventDefault(); triggered = false; }
    }, true);
  }

  function migrateForward(id, dateKey) {
    const list = state.entries[dateKey];
    if (!list) return;
    const item = list.find(it => it.id === id);
    if (!item || item.type !== "task" || item.status !== "open") return;
    const nKey = nextDayKey(dateKey);
    const newId = uid();
    state.entries[nKey] = state.entries[nKey] || [];
    state.entries[nKey].push({ id: newId, type: "task", text: item.text, status: "open", priority: item.priority || false });
    item.status = "migrated";
    item.migratedToKey = nKey;
    item.migratedToId = newId;
    save();
    renderToday();
  }

  function unmigrate(id, dateKey) {
    const list = state.entries[dateKey];
    if (!list) return;
    const item = list.find(it => it.id === id);
    if (!item || item.status !== "migrated") return;
    if (item.migratedToKey && item.migratedToId && state.entries[item.migratedToKey]) {
      state.entries[item.migratedToKey] = state.entries[item.migratedToKey].filter(it => it.id !== item.migratedToId);
    }
    item.status = "open";
    delete item.migratedToKey;
    delete item.migratedToId;
    save();
    renderToday();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id, key } = btn.dataset;
    const list = state.entries[key];
    if (!list) return;
    const idx = list.findIndex(it => it.id === id);
    if (idx === -1) return;

    if (action === "toggle") {
      const it = list[idx];
      if (it.type === "task" && it.status !== "migrated") {
        if (it.status !== "done") {
          if (it.goalId) {
            openGoalProgressSheet(it, key);
            return; // 저장은 progress 입력 확정 후 처리
          }
          it.status = "done";
        } else {
          if (it.goalId && it.goalAmount) {
            subtractGoalProgress(it.goalMonth, it.goalId, it.goalAmount);
            it.goalAmount = 0;
          }
          it.status = "open";
        }
        syncDayCompletion(key);
      }
      save(); renderToday();
    } else if (action === "unmigrate") {
      unmigrate(id, key);
    } else if (action === "star") {
      list[idx].priority = !list[idx].priority;
      save(); renderToday();
    } else if (action === "delete") {
      list.splice(idx, 1);
      syncDayCompletion(key);
      save(); renderToday();
    } else if (action === "migrate-in") {
      const item = list[idx];
      list.splice(idx, 1);
      const todayKey = fmtKey(currentDate);
      state.entries[todayKey] = state.entries[todayKey] || [];
      state.entries[todayKey].push({ ...item, id: uid(), status: "open" });
      save(); renderToday();
    }
  });

  gratitudeInput.addEventListener("input", () => {
    const key = fmtKey(currentDate);
    state.gratitude[key] = gratitudeInput.value;
    save();
  });

  // ---------- DATE PICKER SHEET ----------
  const datePickerSheet = $("#datePickerSheet");
  const dpMonthLabel = $("#dpMonthLabel");
  const dpGrid = $("#dpGrid");

  $("#todayBtn").addEventListener("click", () => {
    closeAllOverlays();
    dpCursor = new Date(currentDate);
    renderDatePicker();
    datePickerSheet.hidden = false;
  });

  function renderDatePicker() {
    dpMonthLabel.textContent = dpCursor.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
    dpGrid.innerHTML = "";
    const y = dpCursor.getFullYear(), m = dpCursor.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < firstDow; i++) {
      const empty = document.createElement("div");
      empty.className = "dp-cell empty";
      dpGrid.appendChild(empty);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const key = fmtKey(date);
      const complete = !!state.completedDays[key];
      const cell = document.createElement("div");
      cell.className = "dp-cell" + (isSameDay(date, today) ? " is-today" : "") + (isSameDay(date, currentDate) ? " is-selected" : "") + (complete ? " complete-day" : "");
      cell.innerHTML = complete
        ? `<span>${d}</span><span class="dp-gem">${generateOrnamentSVG(key, 10)}</span>`
        : `<span>${d}</span>`;
      cell.addEventListener("click", () => {
        currentDate = date;
        datePickerSheet.hidden = true;
        switchView("today");
      });
      dpGrid.appendChild(cell);
    }
  }

  $("#dpPrevMonth").addEventListener("click", () => { dpCursor.setMonth(dpCursor.getMonth() - 1); renderDatePicker(); });
  $("#dpNextMonth").addEventListener("click", () => { dpCursor.setMonth(dpCursor.getMonth() + 1); renderDatePicker(); });
  $("#dpToday").addEventListener("click", () => {
    currentDate = new Date();
    datePickerSheet.hidden = true;
    switchView("today");
  });
  $("#dpClose").addEventListener("click", () => datePickerSheet.hidden = true);
  datePickerSheet.addEventListener("click", (e) => { if (e.target === datePickerSheet) datePickerSheet.hidden = true; });

  // ---------- ADD ENTRY SHEET ----------
  const entrySheet = $("#entrySheet");
  const entryInput = $("#entryInput");

  $("#addEntryBtn").addEventListener("click", () => openEntrySheet());

  function openEntrySheet() {
    closeAllOverlays();
    pendingType = "task";
    pendingGoalId = null;
    goalPicker.hidden = true;
    document.querySelectorAll(".type-btn").forEach(b => b.classList.toggle("active", b.dataset.type === "task"));
    entryInput.value = "";
    entrySheet.hidden = false;
    setTimeout(() => entryInput.focus(), 50);
  }

  function renderGoalPicker() {
    const monthKey = monthKeyOf(currentDate);
    const goals = (state.monthlyGoals[monthKey] || []).filter(g => g.recurring || (g.progress || 0) < g.target);
    goalPickerList.innerHTML = "";
    if (goals.length === 0) {
      goalPickerList.innerHTML = `<p class="goal-picker-empty">이번달 남은 목표가 없어. Monthly 탭에서 먼저 추가해봐.</p>`;
      pendingGoalId = null;
      return;
    }
    if (!goals.find(g => g.id === pendingGoalId)) pendingGoalId = goals[0].id;
    goals.forEach(g => {
      const pct = g.target > 0 ? Math.round(((g.progress || 0) / g.target) * 1000) / 10 : 0;
      const btn = document.createElement("button");
      btn.className = "goal-pick-btn" + (g.id === pendingGoalId ? " selected" : "");
      btn.innerHTML = `${escapeHtml(g.title)}<span class="g-progress">${g.progress || 0}/${g.target}${g.unit ? escapeHtml(g.unit) : ""} · ${pct}%${g.recurring ? " · 정기" : ""}</span>`;
      btn.addEventListener("click", () => { pendingGoalId = g.id; renderGoalPicker(); });
      goalPickerList.appendChild(btn);
    });
  }

  document.querySelectorAll(".type-btn").forEach(b => {
    b.addEventListener("click", () => {
      pendingType = b.dataset.type;
      document.querySelectorAll(".type-btn").forEach(x => x.classList.toggle("active", x === b));
      if (pendingType === "goal") {
        goalPicker.hidden = false;
        renderGoalPicker();
      } else {
        goalPicker.hidden = true;
      }
    });
  });

  $("#cancelEntry").addEventListener("click", () => entrySheet.hidden = true);
  entrySheet.addEventListener("click", (e) => { if (e.target === entrySheet) entrySheet.hidden = true; });

  $("#saveEntry").addEventListener("click", () => {
    const text = entryInput.value.trim();
    if (!text) return;
    if (pendingType === "goal" && !pendingGoalId) { alert("연결할 목표를 먼저 골라줘."); return; }
    const key = fmtKey(currentDate);
    state.entries[key] = state.entries[key] || [];
    const isGoal = pendingType === "goal";
    const newItem = { id: uid(), type: isGoal ? "task" : pendingType, text, priority: false };
    if (newItem.type === "task") newItem.status = "open";
    if (isGoal) {
      newItem.goalId = pendingGoalId;
      newItem.goalMonth = monthKeyOf(currentDate);
    }
    state.entries[key].push(newItem);
    save();
    entrySheet.hidden = true;
    renderToday();
  });

  entryInput.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#saveEntry").click(); });

  // ---------- MONTHLY VIEW ----------
  function renderMonthly() {
    monthLabel.textContent = monthCursor.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
    renderMonthlyGoals();
    monthList.innerHTML = "";
    const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const key = fmtKey(date);
      const entries = state.entries[key] || [];
      const complete = !!state.completedDays[key];
      const li = document.createElement("li");
      li.className = "month-day" + (isSameDay(date, today) ? " today" : "") + ((date.getDay() === 0 || date.getDay() === 6) ? " weekend" : "") + (complete ? " day-complete-row" : "");
      const entriesHtml = entries.length
        ? entries.slice(0, 4).map(it => `<div class="mini-entry ${it.status === "done" ? "done" : ""}">${glyphFor(it.type, it.status)} ${escapeHtml(it.text)}</div>`).join("")
        : `<div class="empty">—</div>`;
      li.innerHTML = `
        <div class="date-col">
          <div class="date-num${complete ? " complete-subtle" : ""}">${d}</div>
          <div class="date-dow">${DOW[date.getDay()]}${complete ? `<span class="date-gem">${generateOrnamentSVG(key, 13)}</span>` : ""}</div>
        </div>
        <div class="entries">${entriesHtml}${entries.length > 4 ? `<div class="empty">+${entries.length - 4}개 더</div>` : ""}</div>
      `;
      li.addEventListener("click", () => { currentDate = date; switchView("today"); });
      monthList.appendChild(li);
    }
  }

  $("#prevMonth").addEventListener("click", () => { monthCursor.setMonth(monthCursor.getMonth() - 1); renderMonthly(); });
  $("#nextMonth").addEventListener("click", () => { monthCursor.setMonth(monthCursor.getMonth() + 1); renderMonthly(); });

  // ---------- MONTHLY GOALS ----------
  function renderMonthlyGoals() {
    const monthKey = monthKeyOf(monthCursor);
    const goals = state.monthlyGoals[monthKey] || [];
    goalList.innerHTML = "";
    if (goals.length === 0) {
      goalList.innerHTML = `<p style="color:var(--ink-faint);font-size:12.5px;">이번달 등록된 목표가 없어.</p>`;
      return;
    }
    goals.forEach(g => {
      const pct = g.target > 0 ? ((g.progress || 0) / g.target) * 100 : 0;
      const over = pct >= 100;
      const div = document.createElement("div");
      div.className = "goal-item";
      div.innerHTML = `
        <div class="goal-item-top">
          <div class="goal-item-title">${escapeHtml(g.title)}${g.recurring ? '<span class="recurring-badge">정기</span>' : ""}</div>
          <button class="del-btn" data-del-goal="${g.id}" data-goal-month="${monthKey}">×</button>
        </div>
        <div class="goal-item-bar"><div class="goal-item-bar-fill ${over ? "over" : ""}" style="width:${Math.min(pct, 100)}%"></div></div>
        <div class="goal-item-meta">
          <span>${g.progress || 0} / ${g.target}${g.unit ? escapeHtml(g.unit) : ""}</span>
          <span class="${over ? "over-text" : ""}">${pct > 100 ? `초과달성 +${Math.round((pct - 100) * 10) / 10}%` : `${Math.round(pct * 10) / 10}%${pct >= 100 ? " 달성" : ""}`}</span>
        </div>
      `;
      goalList.appendChild(div);
    });
  }

  goalList.addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-del-goal]");
    if (!delBtn) return;
    const { delGoal, goalMonth } = delBtn.dataset;
    if (confirm("이 목표를 삭제할까? 연결된 할일의 진도 연결도 함께 해제돼.")) {
      state.monthlyGoals[goalMonth] = (state.monthlyGoals[goalMonth] || []).filter(g => g.id !== delGoal);
      save();
      renderMonthlyGoals();
    }
  });

  const goalSheet = $("#goalSheet");
  const goalTitleInput = $("#goalTitleInput");
  const goalTargetInput = $("#goalTargetInput");
  const goalUnitInput = $("#goalUnitInput");
  const goalRecurringInput = $("#goalRecurringInput");

  $("#addGoalBtn").addEventListener("click", () => {
    closeAllOverlays();
    goalTitleInput.value = ""; goalTargetInput.value = ""; goalUnitInput.value = ""; goalRecurringInput.checked = false;
    goalSheet.hidden = false;
    setTimeout(() => goalTitleInput.focus(), 50);
  });
  $("#cancelGoal").addEventListener("click", () => goalSheet.hidden = true);
  goalSheet.addEventListener("click", (e) => { if (e.target === goalSheet) goalSheet.hidden = true; });
  $("#saveGoal").addEventListener("click", () => {
    const title = goalTitleInput.value.trim();
    const target = parseFloat(goalTargetInput.value);
    if (!title || !target || target <= 0) { alert("목표 이름과 목표 수치를 정확히 입력해줘."); return; }
    const monthKey = monthKeyOf(monthCursor);
    state.monthlyGoals[monthKey] = state.monthlyGoals[monthKey] || [];
    state.monthlyGoals[monthKey].push({
      id: uid(), title, target, unit: goalUnitInput.value.trim(), recurring: goalRecurringInput.checked, progress: 0
    });
    save();
    goalSheet.hidden = true;
    renderMonthlyGoals();
  });

  // ---------- GOAL PROGRESS SHEET (완료 처리시 진도 입력) ----------
  const goalProgressSheet = $("#goalProgressSheet");
  const goalProgressLabel = $("#goalProgressLabel");
  const goalProgressInput = $("#goalProgressInput");
  let pendingGoalProgressItem = null;
  let pendingGoalProgressKey = null;

  function openGoalProgressSheet(item, key) {
    closeAllOverlays();
    pendingGoalProgressItem = item;
    pendingGoalProgressKey = key;
    const g = getGoal(item.goalMonth, item.goalId);
    goalProgressLabel.textContent = g
      ? `${g.title} — 현재 ${g.progress || 0} / ${g.target}${g.unit || ""}. 이번에 얼마나 채웠어?`
      : "이번에 얼마나 채웠어?";
    goalProgressInput.value = "1";
    goalProgressSheet.hidden = false;
    setTimeout(() => goalProgressInput.focus(), 50);
  }

  $("#cancelGoalProgress").addEventListener("click", () => goalProgressSheet.hidden = true);
  goalProgressSheet.addEventListener("click", (e) => { if (e.target === goalProgressSheet) goalProgressSheet.hidden = true; });
  $("#saveGoalProgress").addEventListener("click", () => {
    const amount = Math.round(parseFloat(goalProgressInput.value || "0") * 10) / 10;
    if (isNaN(amount) || amount < 0) { alert("숫자를 정확히 입력해줘."); return; }
    const item = pendingGoalProgressItem, key = pendingGoalProgressKey;
    if (!item) { goalProgressSheet.hidden = true; return; }
    item.status = "done";
    item.goalAmount = amount;
    addGoalProgress(item.goalMonth, item.goalId, amount);
    syncDayCompletion(key);
    save();
    goalProgressSheet.hidden = true;
    renderToday();
    pendingGoalProgressItem = null; pendingGoalProgressKey = null;
  });

  // ---------- HABITS VIEW ----------
  const habitMonthState = {}; // "habitId:YYYY-MM" -> true/false(펼침 여부), 없으면 기본값 사용

  function renderHabits() {
    habitGrid.innerHTML = "";
    if (state.habits.length === 0) {
      habitGrid.innerHTML = `<p style="color:var(--ink-faint);font-size:13px;">아직 등록된 습관이 없어. 위에서 추가해봐.</p>`;
      return;
    }
    const today = new Date();
    const curMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    state.habits.forEach(h => {
      const card = document.createElement("div");
      card.className = "habit-card";
      const log = state.habitLogs[h.id] || {};
      const startDate = h.startDate ? keyToDate(h.startDate) : today;
      const duration = h.duration || 30;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + duration - 1);

      let monthsHtml = "";
      let filledCount = 0, elapsed = 0;

      if (startDate > today) {
        monthsHtml = `<p class="habit-not-started">${startDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}부터 시작 예정</p>`;
      } else {
        const cappedEnd = endDate < today ? endDate : today;
        const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const lastMonth = new Date(cappedEnd.getFullYear(), cappedEnd.getMonth(), 1);

        while (cursor <= lastMonth) {
          const y = cursor.getFullYear(), mo = cursor.getMonth();
          const monthKey = `${y}-${String(mo + 1).padStart(2, "0")}`;
          const daysInThisMonth = new Date(y, mo + 1, 0).getDate();
          const dayStart = (y === startDate.getFullYear() && mo === startDate.getMonth()) ? startDate.getDate() : 1;
          let dayEnd = daysInThisMonth;
          if (y === endDate.getFullYear() && mo === endDate.getMonth()) dayEnd = Math.min(dayEnd, endDate.getDate());

          let cellsHtml = "";
          let monthFilled = 0, monthAttempt = 0;
          for (let d = dayStart; d <= dayEnd; d++) {
            const date = new Date(y, mo, d);
            const key = fmtKey(date);
            const future = date > today;
            const filled = !!log[key];
            if (!future) { monthAttempt++; elapsed++; if (filled) { monthFilled++; filledCount++; } }
            cellsHtml += `<div class="habit-cell ${filled ? "filled" : ""} ${future ? "future" : ""} ${isSameDay(date, today) ? "is-today" : ""}" data-habit="${h.id}" data-key="${key}" title="${d}일">${filled ? '<svg viewBox="0 0 20 20"><path d="M4 10.5L8 14.5L16 6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ""}</div>`;
          }

          const stateKey = `${h.id}:${monthKey}`;
          const isCur = monthKey === curMonthKey;
          const expanded = habitMonthState.hasOwnProperty(stateKey) ? habitMonthState[stateKey] : isCur;

          monthsHtml += `
            <div class="habit-month-block">
              <button class="habit-month-toggle" data-toggle-month="${stateKey}">
                <span class="habit-month-label">${y}년 ${mo + 1}월</span>
                <span class="habit-month-stat">${monthFilled}/${monthAttempt}</span>
                <span class="habit-month-chevron">${expanded ? "▾" : "▸"}</span>
              </button>
              <div class="habit-days" ${expanded ? "" : "hidden"}>${cellsHtml}</div>
            </div>
          `;
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }

      const rangeLabel = `${startDate.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} ~ ${endDate.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} · ${duration}일`;

      card.innerHTML = `
        <div class="habit-name">
          <span>${escapeHtml(h.name)}</span>
          <button class="del-btn" data-del-habit="${h.id}">×</button>
        </div>
        <div class="habit-meta-row">
          <span class="habit-range">${rangeLabel}</span>
          <span class="habit-progress">${filledCount}/${elapsed}일</span>
        </div>
        ${monthsHtml}
      `;
      habitGrid.appendChild(card);
    });
  }

  habitGrid.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-toggle-month]");
    if (toggleBtn) {
      const key = toggleBtn.dataset.toggleMonth;
      const daysEl = toggleBtn.closest(".habit-month-block").querySelector(".habit-days");
      habitMonthState[key] = !!daysEl.hidden;
      renderHabits();
      return;
    }
    const cell = e.target.closest(".habit-cell");
    if (cell && !cell.classList.contains("future")) {
      const { habit, key } = cell.dataset;
      state.habitLogs[habit] = state.habitLogs[habit] || {};
      state.habitLogs[habit][key] = !state.habitLogs[habit][key];
      save(); renderHabits();
      return;
    }
    const delBtn = e.target.closest("[data-del-habit]");
    if (delBtn) {
      const id = delBtn.dataset.delHabit;
      if (confirm("이 습관을 삭제할까? 기록도 함께 사라져.")) {
        state.habits = state.habits.filter(h => h.id !== id);
        delete state.habitLogs[id];
        save(); renderHabits();
      }
    }
  });

  const habitSheet = $("#habitSheet");
  const habitInput = $("#habitInput");
  const habitStartInput = $("#habitStartInput");
  const habitDurationInput = $("#habitDurationInput");
  $("#addHabitBtn").addEventListener("click", () => {
    closeAllOverlays();
    habitInput.value = "";
    habitStartInput.value = fmtKey(new Date());
    habitDurationInput.value = "30";
    habitSheet.hidden = false;
    setTimeout(() => habitInput.focus(), 50);
  });
  $("#cancelHabit").addEventListener("click", () => habitSheet.hidden = true);
  habitSheet.addEventListener("click", (e) => { if (e.target === habitSheet) habitSheet.hidden = true; });
  $("#saveHabit").addEventListener("click", () => {
    const name = habitInput.value.trim();
    if (!name) return;
    const startDate = habitStartInput.value || fmtKey(new Date());
    let duration = parseInt(habitDurationInput.value, 10);
    if (!duration || duration < 1) duration = 30;
    if (duration > 365) duration = 365;
    state.habits.push({ id: uid(), name, startDate, duration });
    save();
    habitSheet.hidden = true;
    renderHabits();
  });
  habitInput.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#saveHabit").click(); });

  // ---------- SIDE MENU ----------
  const sideMenuOverlay = $("#sideMenuOverlay");
  $("#menuBtn").addEventListener("click", () => { closeAllOverlays(); updateGemCountUI(); renderThemeList(); sideMenuOverlay.hidden = false; });
  sideMenuOverlay.addEventListener("click", (e) => { if (e.target === sideMenuOverlay) closeSideMenu(); });
  function closeSideMenu() { sideMenuOverlay.hidden = true; }

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapidlog-backup-${fmtKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!confirm("가져온 데이터로 현재 데이터를 덮어쓸까? 되돌릴 수 없어.")) return;
        state = { ...defaultState(), ...parsed };
        save();
        switchView(currentView);
        renderMonthly(); renderHabits();
      } catch (err) {
        alert("파일을 읽을 수 없어. JSON 백업 파일이 맞는지 확인해줘.");
      }
    };
    reader.readAsText(file);
  });

  // ---------- INIT ----------
  switchView("today");

  // ---------- PWA: service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW registration failed", err));
    });
  }
})();
