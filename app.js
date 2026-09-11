(() => {
  "use strict";

  const STORAGE_KEY = "rapidlog.v1";
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const GEM_CLASSES = ["gem-c0", "gem-c1", "gem-c2", "gem-c3"];

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

  function gemClassForKey(key) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return GEM_CLASSES[h % GEM_CLASSES.length];
  }

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const viewTitle = $("#viewTitle");
  const viewSubtitle = $("#viewSubtitle");
  const perfectBadge = $("#perfectBadge");
  const mainEl = $("#main");
  const rapidList = $("#rapidList");
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

  function checkAndAwardCompletion(key) {
    if (isDayComplete(key) && !state.completedDays[key]) {
      state.completedDays[key] = true;
      save();
    }
  }

  function updateGemCountUI() {
    if (gemCountEl) gemCountEl.textContent = Object.keys(state.completedDays).length;
  }

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
    if (view === "monthly") { titleTextNode.textContent = "Monthly "; perfectBadge.hidden = true; renderMonthly(); }
    if (view === "habits") { titleTextNode.textContent = "Habits "; perfectBadge.hidden = true; renderHabits(); }
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
    mainEl.classList.toggle("day-complete", complete);
    if (complete) {
      perfectBadge.hidden = false;
      perfectBadge.className = "gem-icon " + gemClassForKey(key);
    } else {
      perfectBadge.hidden = true;
    }
  }

  function renderItem(item, dateKey, showMigrateIn = false) {
    const li = document.createElement("li");
    const isTask = item.type === "task";
    const status = isTask ? item.status : null;
    li.className = "rapid-item" + (status === "done" ? " done" : "") + (status === "migrated" ? " migrated" : "");
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

    li.innerHTML = `
      <button class="glyph-btn" data-action="toggle" data-id="${item.id}" data-key="${dateKey}">${glyphFor(item.type, status)}</button>
      <div class="body">
        <div class="text-row" style="display:flex;align-items:center;gap:4px;">
          ${starHtml}
          <div class="text">${goalTagHtml}${escapeHtml(item.text)}</div>
        </div>
        ${metaBits.length ? `<div class="meta-row"><span>${metaBits.join(" · ")}</span></div>` : ""}
      </div>
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
          checkAndAwardCompletion(key);
        } else {
          if (it.goalId && it.goalAmount) {
            subtractGoalProgress(it.goalMonth, it.goalId, it.goalAmount);
            it.goalAmount = 0;
          }
          it.status = "open";
        }
      }
      save(); renderToday();
    } else if (action === "unmigrate") {
      unmigrate(id, key);
    } else if (action === "star") {
      list[idx].priority = !list[idx].priority;
      save(); renderToday();
    } else if (action === "delete") {
      list.splice(idx, 1);
      checkAndAwardCompletion(key);
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
      const cell = document.createElement("div");
      cell.className = "dp-cell" + (isSameDay(date, today) ? " is-today" : "") + (isSameDay(date, currentDate) ? " is-selected" : "");
      const gem = state.completedDays[key] ? `<span class="gem-icon dp-gem ${gemClassForKey(key)}"></span>` : "";
      cell.innerHTML = `<span>${d}</span>${gem}`;
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
      const li = document.createElement("li");
      li.className = "month-day" + (isSameDay(date, today) ? " today" : "") + ((date.getDay() === 0 || date.getDay() === 6) ? " weekend" : "");
      const entriesHtml = entries.length
        ? entries.slice(0, 4).map(it => `<div class="mini-entry ${it.status === "done" ? "done" : ""}">${glyphFor(it.type, it.status)} ${escapeHtml(it.text)}</div>`).join("")
        : `<div class="empty">—</div>`;
      const gem = state.completedDays[key] ? `<span class="gem-icon ${gemClassForKey(key)}"></span>` : "";
      li.innerHTML = `
        <div class="date-col">
          <div class="date-num">${d}${gem}</div>
          <div class="date-dow">${DOW[date.getDay()]}</div>
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
      const over = pct > 100;
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
          <span class="${over ? "over-text" : ""}">${over ? `초과달성 +${Math.round((pct - 100) * 10) / 10}%` : `${Math.round(pct * 10) / 10}%`}</span>
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
    checkAndAwardCompletion(key);
    save();
    goalProgressSheet.hidden = true;
    renderToday();
    pendingGoalProgressItem = null; pendingGoalProgressKey = null;
  });

  // ---------- HABITS VIEW ----------
  function renderHabits() {
    habitGrid.innerHTML = "";
    if (state.habits.length === 0) {
      habitGrid.innerHTML = `<p style="color:var(--ink-faint);font-size:13px;">아직 등록된 습관이 없어. 위에서 추가해봐.</p>`;
      return;
    }
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    state.habits.forEach(h => {
      const card = document.createElement("div");
      card.className = "habit-card";
      const log = state.habitLogs[h.id] || {};
      let cellsHtml = "";
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(today.getFullYear(), today.getMonth(), d);
        const key = fmtKey(date);
        const future = date > today;
        const filled = !!log[key];
        cellsHtml += `<div class="habit-cell ${filled ? "filled" : ""} ${future ? "future" : ""} ${isSameDay(date, today) ? "is-today" : ""}" data-habit="${h.id}" data-key="${key}" title="${d}일"></div>`;
      }
      card.innerHTML = `
        <div class="habit-name">${escapeHtml(h.name)} <button class="del-btn" data-del-habit="${h.id}">×</button></div>
        <div class="habit-days">${cellsHtml}</div>
      `;
      habitGrid.appendChild(card);
    });
  }

  habitGrid.addEventListener("click", (e) => {
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
  $("#addHabitBtn").addEventListener("click", () => { closeAllOverlays(); habitInput.value = ""; habitSheet.hidden = false; setTimeout(() => habitInput.focus(), 50); });
  $("#cancelHabit").addEventListener("click", () => habitSheet.hidden = true);
  habitSheet.addEventListener("click", (e) => { if (e.target === habitSheet) habitSheet.hidden = true; });
  $("#saveHabit").addEventListener("click", () => {
    const name = habitInput.value.trim();
    if (!name) return;
    state.habits.push({ id: uid(), name });
    save();
    habitSheet.hidden = true;
    renderHabits();
  });
  habitInput.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#saveHabit").click(); });

  // ---------- SIDE MENU ----------
  const sideMenuOverlay = $("#sideMenuOverlay");
  $("#menuBtn").addEventListener("click", () => { closeAllOverlays(); updateGemCountUI(); sideMenuOverlay.hidden = false; });
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
