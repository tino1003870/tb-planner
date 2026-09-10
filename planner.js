const calendarSelect =
  document.getElementById("calendarSelect");

const refreshButton =
  document.getElementById("refreshButton");

const createTaskButton =
  document.getElementById("createTaskButton");

const renameTaskButton =
  document.getElementById("renameTaskButton");

const indentButton =
  document.getElementById("indentButton");

const outdentButton =
  document.getElementById("outdentButton");

const upButton =
  document.getElementById("upButton");

const downButton =
  document.getElementById("downButton");


const minusWeekButton =
  document.getElementById("minusWeekButton");

const minusDayButton =
  document.getElementById("minusDayButton");

const plusDayButton =
  document.getElementById("plusDayButton");

const plusWeekButton =
  document.getElementById("plusWeekButton");

const minusDurationButton =
  document.getElementById("minusDurationButton");

const plusDurationButton =
  document.getElementById("plusDurationButton");

const status =
  document.getElementById("status");

const planner =
  document.getElementById("planner");

const zoomButtons =
  document.querySelectorAll(
    "[data-zoom]"
  );


const todoEditor =
  document.getElementById("todoEditor");

const todoEditorTask =
  document.getElementById("todoEditorTask");

const todoTitleInput =
  document.getElementById("todoTitleInput");

const todoDescriptionInput =
  document.getElementById("todoDescriptionInput");

const todoProgressInput =
  document.getElementById("todoProgressInput");

const todoProgressValue =
  document.getElementById("todoProgressValue");

const todoSaveButton =
  document.getElementById("todoSaveButton");

const todoCancelButton =
  document.getElementById("todoCancelButton");


let calendars = [];
let items = [];

let selectedId = null;

let collapsed = new Set();

let hierarchy = {
  order: [],
  parent: {}
};

let zoomMode = "week";


// ============================================================
// DATUM
// ============================================================

function parseDate(value) {

  if (!value) {
    return null;
  }

  const match =
    String(value).match(
      /^(\d{4})(\d{2})(\d{2})/
    );

  if (!match) {
    return null;
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
}


function startOfDay(date) {

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}


function addDays(date, days) {

  const result =
    new Date(date);

  result.setDate(
    result.getDate() + days
  );

  return result;
}


function diffDays(a, b) {

  const ms =
    24 * 60 * 60 * 1000;

  return Math.round(
    (
      startOfDay(b) -
      startOfDay(a)
    ) / ms
  );
}


function toDateString(date) {

  if (!date) {
    return null;
  }

  return (
    date.getFullYear().toString().padStart(4, "0") +
    (date.getMonth() + 1).toString().padStart(2, "0") +
    date.getDate().toString().padStart(2, "0")
  );
}


function formatDate(date) {

  if (!date) {
    return "";
  }

  return date.toLocaleDateString(
    "de-DE",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );
}


function formatMonth(date) {

  return date.toLocaleDateString(
    "de-DE",
    {
      month: "long",
      year: "numeric"
    }
  );
}


function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ============================================================
// WBS-SPEICHER
// ============================================================

function storageKey() {

  return (
    "tb-planner-wbs-" +
    calendarSelect.value
  );
}


function loadHierarchy() {

  // ----------------------------------------------------------
  // Thunderbird ist die primäre Quelle.
  // ----------------------------------------------------------

  const hasWbsData =
    items.some(
      item =>
        item.wbs !== null &&
        item.wbs !== undefined
    );


  if (hasWbsData) {

    const ordered =
      [...items].sort(
        (a, b) =>
          (a.order || 0) -
          (b.order || 0)
      );


    hierarchy = {
      order: ordered.map(
        item => item.id
      ),

      parent: {}
    };


    for (const item of ordered) {

      if (
        item.parentId !== null &&
        item.parentId !== undefined &&
        item.parentId !== ""
      ) {

        hierarchy.parent[item.id] =
          item.parentId;
      }
    }


    // Lokalen Backup-Speicher aktualisieren.
    saveHierarchy();

    return;
  }


  // ----------------------------------------------------------
  // Alte Tasks ohne WBS:
  // lokale Struktur als Übergang verwenden.
  // ----------------------------------------------------------

  const raw =
    localStorage.getItem(
      storageKey()
    );


  if (!raw) {

    hierarchy = {
      order: items.map(
        item => item.id
      ),

      parent: {}
    };

    saveHierarchy();

    return;
  }


  try {

    hierarchy =
      JSON.parse(raw);

  } catch (error) {

    hierarchy = {
      order: items.map(
        item => item.id
      ),

      parent: {}
    };
  }


  if (!hierarchy.order) {
    hierarchy.order = [];
  }

  if (!hierarchy.parent) {
    hierarchy.parent = {};
  }


  for (const item of items) {

    if (!hierarchy.order.includes(item.id)) {

      hierarchy.order.push(
        item.id
      );
    }
  }


  hierarchy.order =
    hierarchy.order.filter(
      id =>
        items.some(
          item =>
            item.id === id
        )
    );


  for (
    const id of
    Object.keys(hierarchy.parent)
  ) {

    if (!hierarchy.order.includes(id)) {

      delete hierarchy.parent[id];
    }
  }


  saveHierarchy();
}

async function syncHierarchyToCalendar() {

  const wbs =
    calculateWbs();


  for (
    let index = 0;
    index < hierarchy.order.length;
    index++
  ) {

    const id =
      hierarchy.order[index];


    const item =
      items.find(
        item => item.id === id
      );


    if (!item) {
      continue;
    }


    const parentId =
      hierarchy.parent[id] || "";


    const number =
      wbs.get(id);


    if (!number) {
      continue;
    }


    // Reihenfolge innerhalb des jeweiligen Parents.
    const siblings =
      childrenOf(
        parentId || null
      );

    const siblingOrder =
      siblings.indexOf(id);


    console.log(
      "WBS-SYNC:",
      {
        title: item.title,
        id: id,
        wbs: number,
        parentId: parentId || null,
        order: siblingOrder
      }
    );


    await browser.tbPlannerCalendar.updateItem(
      calendarSelect.value,
      id,
      number,
      parentId,
      siblingOrder
    );
  }
}


function saveHierarchy() {

  localStorage.setItem(
    storageKey(),
    JSON.stringify(
      hierarchy
    )
  );
}


// ============================================================
// BAUM
// ============================================================

function childrenOf(parentId) {

  return hierarchy.order.filter(
    id =>
      (hierarchy.parent[id] || null)
      === parentId
  );
}


function visibleOrder() {

  const result = [];


  function walk(parentId, level) {

    for (
      const id of
      childrenOf(parentId)
    ) {

      result.push({
        id,
        level
      });


      if (!collapsed.has(id)) {

        walk(
          id,
          level + 1
        );
      }
    }
  }


  walk(null, 0);

  return result;
}


function previousSibling(id) {

  const parent =
    hierarchy.parent[id] || null;

  const siblings =
    childrenOf(parent);

  const index =
    siblings.indexOf(id);

  if (index <= 0) {
    return null;
  }

  return siblings[index - 1];
}


async function indentSelected() {

  if (!selectedId) {
    return;
  }

  const previous =
    previousSibling(selectedId);

  if (!previous) {
    return;
  }

  const item =
    items.find(
      item => item.id === selectedId
    );

  const oldParent =
    hierarchy.parent[selectedId] || null;

  const oldWbs =
    calculateWbs().get(selectedId) || "?";


  console.log(
    "=== WBS ÄNDERUNG: EINRÜCKEN ==="
  );

  console.log(
    "Aufgabe:",
    item?.title || selectedId
  );

  console.log(
    "ID:",
    selectedId
  );

  console.log(
    "VORHER:",
    {
      wbs: oldWbs,
      parentId: oldParent
    }
  );


  hierarchy.parent[selectedId] =
    previous;


  const newWbs =
    calculateWbs().get(selectedId) || "?";


  console.log(
    "NACHHER:",
    {
      wbs: newWbs,
      parentId: previous
    }
  );


  saveHierarchy();

  render();

  console.log(
    "→ Thunderbird synchronisieren"
  );

  await syncHierarchyToCalendar();

  console.log(
    "=== WBS ÄNDERUNG ENDE ==="
  );
}


async function outdentSelected() {

  if (!selectedId) {
    return;
  }

  const parent =
    hierarchy.parent[selectedId] || null;

  if (!parent) {
    return;
  }

  const item =
    items.find(
      item => item.id === selectedId
    );

  const oldParent =
    parent;

  const oldWbs =
    calculateWbs().get(selectedId) || "?";

  const newParent =
    hierarchy.parent[parent] || null;


  console.log(
    "=== WBS ÄNDERUNG: AUSÜCKEN ==="
  );

  console.log(
    "Aufgabe:",
    item?.title || selectedId
  );

  console.log(
    "ID:",
    selectedId
  );

  console.log(
    "VORHER:",
    {
      wbs: oldWbs,
      parentId: oldParent
    }
  );


  hierarchy.parent[selectedId] =
    newParent;


  const newWbs =
    calculateWbs().get(selectedId) || "?";


  console.log(
    "NACHHER:",
    {
      wbs: newWbs,
      parentId: newParent
    }
  );


  saveHierarchy();

  render();

  console.log(
    "→ Thunderbird synchronisieren"
  );

  await syncHierarchyToCalendar();

  console.log(
    "=== WBS ÄNDERUNG ENDE ==="
  );
}


async function moveSelected(direction) {

  if (!selectedId) {
    return;
  }

  const parent =
    hierarchy.parent[selectedId] || null;

  const siblings =
    childrenOf(parent);

  const index =
    siblings.indexOf(selectedId);

  if (index < 0) {
    return;
  }

  const newIndex =
    direction === "up"
      ? index - 1
      : index + 1;


  if (
    newIndex < 0 ||
    newIndex >= siblings.length
  ) {
    return;
  }


  const item =
    items.find(
      item => item.id === selectedId
    );

  const oldWbs =
    calculateWbs().get(selectedId) || "?";


  const a =
    siblings[index];

  const b =
    siblings[newIndex];


  console.log(
    "=== WBS ÄNDERUNG:",
    direction === "up"
      ? "NACH OBEN"
      : "NACH UNTEN",
    "==="
  );

  console.log(
    "Aufgabe:",
    item?.title || selectedId
  );

  console.log(
    "ID:",
    selectedId
  );

  console.log(
    "VORHER:",
    {
      wbs: oldWbs,
      orderIndex: index,
      siblingBefore: b
    }
  );


  const ai =
    hierarchy.order.indexOf(a);

  const bi =
    hierarchy.order.indexOf(b);


  hierarchy.order[ai] =
    b;

  hierarchy.order[bi] =
    a;


  const newWbs =
    calculateWbs().get(selectedId) || "?";


  console.log(
    "NACHHER:",
    {
      wbs: newWbs,
      orderIndex: newIndex,
      siblingAfter: b
    }
  );


  saveHierarchy();

  render();

  console.log(
    "→ Thunderbird synchronisieren"
  );

  await syncHierarchyToCalendar();

  console.log(
    "=== WBS ÄNDERUNG ENDE ==="
  );
}


function toggleCollapsed(id) {

  if (collapsed.has(id)) {

    collapsed.delete(id);

  } else {

    collapsed.add(id);
  }

  render();
}


// ============================================================
// WBS-NUMMERN
// ============================================================

function calculateWbs() {

  const result =
    new Map();


  function walk(parentId, prefix) {

    const children =
      childrenOf(parentId);


    children.forEach(
      (id, index) => {

        const number =
          prefix
            ? `${prefix}.${index + 1}`
            : `${index + 1}`;


        result.set(
          id,
          number
        );


        walk(
          id,
          number
        );
      }
    );
  }


  walk(null, "");

  return result;
}


// ============================================================
// KALENDER
// ============================================================

async function loadCalendars() {

  calendars =
    await browser.tbPlannerCalendar
      .listCalendars();


  calendarSelect.innerHTML = "";


  for (
    const calendar of
    calendars
  ) {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      calendar.id;

    option.textContent =
      calendar.name;

    calendarSelect.appendChild(
      option
    );
  }


  const plannerCalendar =
    calendars.find(
      calendar =>
        calendar.name === "planner"
    );


  if (plannerCalendar) {

    calendarSelect.value =
      plannerCalendar.id;
  }
}


async function loadItems() {

  const calendarId =
    calendarSelect.value;


  if (!calendarId) {
    return;
  }


  status.textContent =
    "Lade Aufgaben …";


  items =
    await browser.tbPlannerCalendar
      .listItems(calendarId);


  // TEMPORÄRE DIAGNOSE
  const acc2 =
    items.find(
      item => item.title === "Acc2"
    );

  const sensors =
    items.find(
      item => item.title === "Sensors"
    );

  console.log(
    "=== TODO-VERGLEICH ==="
  );

  console.log(
    "Acc2:",
    acc2
      ? {
          id: acc2.id,
          type: acc2.type,
          title: acc2.title,
          percentComplete: acc2.percentComplete,
          status: acc2.status,
          entryDate: acc2.entryDate,
          dueDate: acc2.dueDate,
          description: acc2.description
        }
      : "NICHT GEFUNDEN"
  );

  console.log(
    "Sensors:",
    sensors
      ? {
          id: sensors.id,
          type: sensors.type,
          title: sensors.title,
          percentComplete: sensors.percentComplete,
          status: sensors.status,
          entryDate: sensors.entryDate,
          dueDate: sensors.dueDate,
          description: sensors.description
        }
      : "NICHT GEFUNDEN"
  );

  console.log(
    "=== TODO-VERGLEICH ENDE ==="
  );

  console.log(
    "=== ALLE TODO-DATEN ==="
  );

  for (const item of items) {
    console.log(
      "TODO:",
      {
        id: item.id,
        type: item.type,
        title: item.title,
        entryDate: item.entryDate,
        dueDate: item.dueDate,
        parsedEntryDate: parseDate(item.entryDate),
        parsedDueDate: parseDate(item.dueDate)
      }
    );
  }

  console.log(
    "=== ALLE TODO-DATEN ENDE ==="
  );


  loadHierarchy();


  status.textContent =
    `${items.length} Aufgaben`;


  render();
}


// ============================================================
// TASK ERSTELLEN
// ============================================================

async function createTask() {

  const calendarId =
    calendarSelect.value;

  if (!calendarId) {
    return;
  }


  const title =
    window.prompt(
      "Tasktitel:",
      ""
    );

  if (title === null) {
    return;
  }


  const normalizedTitle =
    title.trim();

  if (!normalizedTitle) {
    return;
  }


  const today =
    new Date();

  const defaultStart =
    toDateString(today);


  const startInput =
    window.prompt(
      "Startdatum (YYYYMMDD):",
      defaultStart
    );

  if (startInput === null) {
    return;
  }


  const startDate =
    startInput.trim();

  if (!/^\d{8}$/.test(startDate)) {

    window.alert(
      "Ungültiges Startdatum.\n\n" +
      "Bitte YYYYMMDD verwenden."
    );

    return;
  }


  const durationInput =
    window.prompt(
      "Dauer in Tagen:",
      "1"
    );

  if (durationInput === null) {
    return;
  }


  const duration =
    Number(
      durationInput
    );


  if (
    !Number.isInteger(duration) ||
    duration < 1
  ) {

    window.alert(
      "Die Dauer muss eine ganze Zahl " +
      "größer als 0 sein."
    );

    return;
  }


  console.log(
    "=== TASK ERSTELLEN ==="
  );

  console.log(
    {
      calendarId,
      title: normalizedTitle,
      startDate,
      duration
    }
  );


  try {

    createTaskButton.disabled =
      true;


    const saved =
      await browser.tbPlannerCalendar.createTodo(
        calendarId,
        normalizedTitle,
        startDate,
        duration
      );


    console.log(
      "TASK ERSTELLT:",
      saved
    );


    // ----------------------------------------------------------
    // Task in die lokale Hierarchie übernehmen.
    //
    // Ohne Auswahl wird der Task auf Wurzelebene angelegt.
    // Mit Auswahl wird er direkt nach dem ausgewählten
    // Geschwister-Task eingefügt.
    // ----------------------------------------------------------

    const newId =
      saved.id;


    let insertIndex =
      hierarchy.order.length;


    if (selectedId) {

      const parentId =
        hierarchy.parent[selectedId] || null;

      hierarchy.parent[newId] =
        parentId;


      const selectedIndex =
        hierarchy.order.indexOf(
          selectedId
        );


      if (selectedIndex >= 0) {
        insertIndex =
          selectedIndex + 1;
      }

    } else {

      hierarchy.parent[newId] =
        null;
    }


    hierarchy.order.splice(
      insertIndex,
      0,
      newId
    );


    items.push(
      saved
    );


    selectedId =
      newId;


    saveHierarchy();

    render();

    updateButtons();


    // WBS-Daten nach Thunderbird synchronisieren.
    await syncHierarchyToCalendar();


    console.log(
      "=== TASK ERSTELLEN ENDE ==="
    );

  } catch (error) {

    console.error(
      "TASK-ERSTELLUNG FEHLGESCHLAGEN:",
      error
    );

    window.alert(
      "Task konnte nicht erstellt werden:\n\n" +
      error
    );

  } finally {

    createTaskButton.disabled =
      false;
  }
}


// ============================================================
// TASKTITEL ÄNDERN
// ============================================================

async function renameSelectedTask() {

  if (!selectedId) {
    return;
  }


  const item =
    items.find(
      item => item.id === selectedId
    );


  if (!item) {
    return;
  }


  const newTitle =
    window.prompt(
      "Neuer Tasktitel:",
      item.title || ""
    );


  if (newTitle === null) {
    return;
  }


  const title =
    newTitle.trim();


  if (!title) {
    window.alert(
      "Der Tasktitel darf nicht leer sein."
    );

    return;
  }


  if (title === item.title) {
    return;
  }


  console.log(
    "=== TASKTITEL ÄNDERN ==="
  );

  console.log(
    "VORHER:",
    item.title
  );

  console.log(
    "NACHHER:",
    title
  );


  try {

    renameTaskButton.disabled =
      true;


    const saved =
      await browser.tbPlannerCalendar.updateTodo(
        calendarSelect.value,
        item.id,
        title,
        item.description || "",
        Number.isFinite(
          Number(item.percentComplete)
        )
          ? Number(item.percentComplete)
          : 0
      );


    Object.assign(
      item,
      saved
    );


    render();

    updateButtons();


    console.log(
      "TASKTITEL GESPEICHERT:",
      item.title
    );

  } catch (error) {

    console.error(
      "TASKTITEL-ÄNDERUNG FEHLGESCHLAGEN:",
      error
    );

    window.alert(
      "Tasktitel konnte nicht geändert werden:\n\n" +
      error
    );

  } finally {

    renameTaskButton.disabled =
      !selectedId;
  }
}


// ============================================================
// ZOOM
// ============================================================

function getDayWidth() {

  switch (zoomMode) {

    case "day":
      return 50;

    case "month":
      return 12;

    case "week":
    default:
      return 28;
  }
}


function setZoom(mode) {

  zoomMode =
    mode;


  zoomButtons.forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.zoom === mode
      );
    }
  );


  render();
}


// ============================================================
// ZEITRAUM
// ============================================================

function calculateRange(tasks) {

  let minDate =
    tasks[0].start;

  let maxDate =
    tasks[0].end;


  for (
    const task of
    tasks
  ) {

    if (task.start < minDate) {
      minDate = task.start;
    }

    if (task.end > maxDate) {
      maxDate = task.end;
    }
  }


  let paddingBefore = 2;
  let paddingAfter = 2;


  if (zoomMode === "month") {

    paddingBefore = 14;
    paddingAfter = 14;

  } else if (zoomMode === "week") {

    paddingBefore = 4;
    paddingAfter = 4;
  }


  return {
    minDate:
      addDays(
        minDate,
        -paddingBefore
      ),

    maxDate:
      addDays(
        maxDate,
        paddingAfter
      )
  };
}


// ============================================================
// GANTT
// ============================================================

function render() {

  planner.innerHTML = "";


  // ----------------------------------------------------------
  // Aufgaben + automatisch berechnete Summary-Zeiträume
  // ----------------------------------------------------------

  const taskMap = new Map();

  for (const item of items) {

    if (item.type !== "task") {
      continue;
    }

    taskMap.set(item.id, {
      ...item,
      start: parseDate(item.entryDate),
      end: parseDate(item.dueDate),
      summary: false
    });
  }


  // Zeitraum einer Aufgabe bestimmen.
  //
  // Hat die Aufgabe eigene Start-/Enddaten, werden diese benutzt.
  //
  // Hat sie keine eigenen Daten, aber Kinder, wird automatisch
  // der früheste Start und das späteste Ende der Kinder verwendet.
  function calculateSchedule(id, visiting = new Set()) {

    const task = taskMap.get(id);

    if (!task) {
      return null;
    }

    // Schutz gegen zyklische WBS-Strukturen.
    if (visiting.has(id)) {
      return null;
    }

    const nextVisiting =
      new Set(visiting);

    nextVisiting.add(id);


    const childIds =
      childrenOf(id);


    // --------------------------------------------------------
    // Blattaufgabe
    // --------------------------------------------------------

    if (!childIds.length) {

      task.summary = false;

      if (!task.start || !task.end) {
        return null;
      }

      return {
        start: task.start,
        end: task.end,
        summary: false
      };
    }


    // --------------------------------------------------------
    // Summary-Aufgabe
    //
    // Sobald Kinder vorhanden sind, ist diese Aufgabe eine
    // Summary-Aufgabe.
    // --------------------------------------------------------

    task.summary = true;


    const childSchedules = [];

    for (const childId of childIds) {

      const schedule =
        calculateSchedule(
          childId,
          nextVisiting
        );

      if (schedule) {
        childSchedules.push(schedule);
      }
    }


    // Wenn Kinder gültige Zeiträume besitzen,
    // daraus den Summary-Zeitraum bilden.

    if (childSchedules.length) {

      let start =
        childSchedules[0].start;

      let end =
        childSchedules[0].end;


      for (
        const schedule of
        childSchedules
      ) {

        if (schedule.start < start) {
          start = schedule.start;
        }

        if (schedule.end > end) {
          end = schedule.end;
        }
      }


      task.start = start;
      task.end = end;


      return {
        start,
        end,
        summary: true
      };
    }


    // --------------------------------------------------------
    // Fallback:
    // Kinder vorhanden, aber keine gültigen Daten.
    // Dann eigene Daten verwenden.
    // --------------------------------------------------------

    if (task.start && task.end) {

      return {
        start: task.start,
        end: task.end,
        summary: true
      };
    }


    return null;
  }

  // Alle Zeiträume berechnen.
  for (const item of items) {
    if (item.type === "task") {
      calculateSchedule(item.id);
    }
  }


  // Nur Aufgaben mit einem tatsächlichen oder automatisch
  // berechneten Zeitraum darstellen.
  const tasks =
    Array.from(taskMap.values())
      .filter(
        task =>
          task.start &&
          task.end
      );


  if (!tasks.length) {

    planner.innerHTML =
      `<div class="empty">
        Keine Aufgaben mit Start- und Enddatum.
       </div>`;

    return;
  }


  const wbs =
    calculateWbs();


  const range =
    calculateRange(tasks);


  const minDate =
    range.minDate;

  const maxDate =
    range.maxDate;


  const totalDays =
    diffDays(
      minDate,
      maxDate
    ) + 1;


  const dayWidth =
    getDayWidth();


  const timelineWidth =
    totalDays *
    dayWidth;


  // ----------------------------------------------------------
  // Container
  // ----------------------------------------------------------

  const gantt =
    document.createElement("div");

  gantt.id =
    "gantt";

  planner.appendChild(
    gantt
  );


  // ----------------------------------------------------------
  // HEADER
  // ----------------------------------------------------------

  const header =
    document.createElement("div");

  header.className =
    "gantt-header";


  const h1 =
    document.createElement("div");

  h1.className =
    "header-cell";

  h1.textContent =
    "WBS";


  const h2 =
    document.createElement("div");

  h2.className =
    "header-cell";

  h2.textContent =
    "Aufgabe";


  const timelineHeader =
    document.createElement("div");

  timelineHeader.className =
    "header-cell timeline-header";

  timelineHeader.style.width =
    `${timelineWidth}px`;


  // ----------------------------------------------------------
  // Monate
  // ----------------------------------------------------------

  let currentMonth =
    null;

  let monthStart =
    0;


  for (
    let i = 0;
    i <= totalDays;
    i++
  ) {

    const date =
      addDays(
        minDate,
        i
      );


    const monthKey =
      `${date.getFullYear()}-${date.getMonth()}`;


    if (
      currentMonth !== null &&
      monthKey !== currentMonth
    ) {

      const width =
        (
          i -
          monthStart
        ) *
        dayWidth;


      const month =
        document.createElement(
          "div"
        );

      month.className =
        "month-header";

      month.style.left =
        `${monthStart * dayWidth}px`;

      month.style.width =
        `${width}px`;

      month.textContent =
        formatMonth(
          addDays(
            minDate,
            monthStart
          )
        );


      timelineHeader.appendChild(
        month
      );


      monthStart =
        i;
    }


    currentMonth =
      monthKey;
  }


  // letzter Monat

  const finalMonth =
    document.createElement(
      "div"
    );

  finalMonth.className =
    "month-header";

  finalMonth.style.left =
    `${monthStart * dayWidth}px`;

  finalMonth.style.width =
    `${(
      totalDays -
      monthStart
    ) * dayWidth}px`;

  finalMonth.textContent =
    formatMonth(
      addDays(
        minDate,
        monthStart
      )
    );


  timelineHeader.appendChild(
    finalMonth
  );


  // ----------------------------------------------------------
  // Tage / Wochen
  // ----------------------------------------------------------

  for (
    let i = 0;
    i < totalDays;
    i++
  ) {

    const date =
      addDays(
        minDate,
        i
      );


    const week =
      document.createElement(
        "div"
      );

    week.className =
      "week-header";

    week.style.left =
      `${i * dayWidth}px`;

    week.style.width =
      `${dayWidth}px`;


    if (zoomMode === "month") {

      week.textContent =
        date.getDate();

    } else {

      const weekday =
        date.toLocaleDateString(
          "de-DE",
          {
            weekday: "short"
          }
        );

      week.textContent =
        `${weekday} ${date.getDate()}`;
    }


    timelineHeader.appendChild(
      week
    );
  }


  header.appendChild(h1);
  header.appendChild(h2);
  header.appendChild(
    timelineHeader
  );

  gantt.appendChild(
    header
  );


  // ----------------------------------------------------------
  // ZEILEN
  // ----------------------------------------------------------

  for (
    const entry of
    visibleOrder()
  ) {

    const item =
      taskMap.get(
        entry.id
      );


    if (!item) {
      continue;
    }


    const row =
      document.createElement(
        "div"
      );

    row.className =
      "row";


    if (entry.level === 0) {

      row.classList.add(
        "root-row"
      );

    } else {

      row.classList.add(
        "child-row"
      );
    }


    if (
      selectedId === item.id
    ) {

      row.classList.add(
        "selected"
      );
    }


    // --------------------------------------------------------
    // WBS
    // --------------------------------------------------------

    const wbsCell =
      document.createElement(
        "div"
      );

    wbsCell.className =
      "cell wbs";

    wbsCell.textContent =
      wbs.get(item.id) || "?";


    // --------------------------------------------------------
    // Aufgabe
    // --------------------------------------------------------

    const taskCell =
      document.createElement(
        "div"
      );

    taskCell.className =
      "cell task-cell";


    taskCell.style.paddingLeft =
      `${8 + entry.level * 22}px`;


    const content =
      document.createElement(
        "div"
      );

    content.className =
      "task-content";


    const children =
      childrenOf(
        item.id
      );


    if (children.length) {

      const toggle =
        document.createElement(
          "button"
        );

      toggle.className =
        "tree-toggle";

      toggle.textContent =
        collapsed.has(item.id)
          ? "▶"
          : "▼";


      toggle.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          toggleCollapsed(
            item.id
          );
        }
      );


      content.appendChild(
        toggle
      );

    } else {

      const spacer =
        document.createElement(
          "span"
        );

      spacer.className =
        "tree-spacer";

      content.appendChild(
        spacer
      );
    }


    const title =
      document.createElement(
        "div"
      );


    title.innerHTML = `
      <div class="task-title">
        ${escapeHtml(
          item.title ||
          "(ohne Titel)"
        )}
      </div>

      <span class="task-dates">
        ${formatDate(item.start)}
        –
        ${formatDate(item.end)}
      </span>
    `;


    content.appendChild(
      title
    );


    taskCell.appendChild(
      content
    );


    taskCell.addEventListener(
      "click",
      () => {

        selectedId =
          item.id;

        render();
      }
    );


    // --------------------------------------------------------
    // TIMELINE
    // --------------------------------------------------------

    const timeline =
      document.createElement(
        "div"
      );

    timeline.className =
      "cell timeline";


    timeline.style.width =
      `${timelineWidth}px`;


    timeline.style.setProperty(
      "--day-width",
      `${dayWidth}px`
    );


    // --------------------------------------------------------
    // Wochenenden
    // --------------------------------------------------------

    for (
      let i = 0;
      i < totalDays;
      i++
    ) {

      const date =
        addDays(
          minDate,
          i
        );


      const weekday =
        date.getDay();


      if (
        weekday === 0 ||
        weekday === 6
      ) {

        const weekend =
          document.createElement(
            "div"
          );

        weekend.className =
          "weekend";

        weekend.style.left =
          `${i * dayWidth}px`;

        weekend.style.width =
          `${dayWidth}px`;


        timeline.appendChild(
          weekend
        );
      }
    }


    // --------------------------------------------------------
    // Monatsgrenzen
    // --------------------------------------------------------

    for (
      let i = 0;
      i < totalDays;
      i++
    ) {

      const date =
        addDays(
          minDate,
          i
        );


      if (
        date.getDate() === 1
      ) {

        const boundary =
          document.createElement(
            "div"
          );

        boundary.className =
          "month-boundary";

        boundary.style.left =
          `${i * dayWidth}px`;


        timeline.appendChild(
          boundary
        );
      }
    }


    // --------------------------------------------------------
    // Balken
    // --------------------------------------------------------

    const offset =
      diffDays(
        minDate,
        item.start
      );


    const duration =
      Math.max(
        1,
        diffDays(
          item.start,
          item.end
        ) + 1
      );


    const bar =
      document.createElement(
        "div"
      );

    bar.className =
      item.summary
        ? "bar summary-bar"
        : "bar";


    bar.style.left =
      `${offset * dayWidth + 2}px`;


    bar.style.width =
      `${Math.max(
        8,
        duration * dayWidth - 4
      )}px`;


    const progress =
      Number(
        item.percentComplete
      );


    if (
      Number.isFinite(progress) &&
      progress > 0
    ) {

      const progressBar =
        document.createElement(
          "div"
        );

      progressBar.className =
        "bar-progress";

      progressBar.style.width =
        `${Math.min(
          100,
          progress
        )}%`;


      bar.appendChild(
        progressBar
      );
    }


    const label =
      document.createElement(
        "span"
      );

    label.className =
      "bar-label";

    label.textContent =
      item.title || "";


    bar.appendChild(
      label
    );


    bar.title =
      `${item.title}\n` +
      `${formatDate(item.start)} – ` +
      `${formatDate(item.end)}`;


    bar.addEventListener(
      "click",
      event => {

        event.stopPropagation();

        selectedId =
          item.id;

        render();
      }
    );


    timeline.appendChild(
      bar
    );


    // --------------------------------------------------------
    // Heute
    // --------------------------------------------------------

    const today =
      startOfDay(
        new Date()
      );


    if (
      today >= minDate &&
      today <= maxDate
    ) {

      const todayOffset =
        diffDays(
          minDate,
          today
        );


      const todayLine =
        document.createElement(
          "div"
        );

      todayLine.className =
        "today-line";

      todayLine.style.left =
        `${todayOffset * dayWidth}px`;


      timeline.appendChild(
        todayLine
      );
    }


    row.appendChild(
      wbsCell
    );

    row.appendChild(
      taskCell
    );

    row.appendChild(
      timeline
    );


    gantt.appendChild(
      row
    );
  }


  updateButtons();
}


// ============================================================
// ZEITVERSCHIEBUNG
// ============================================================

async function shiftSelectedDays(days) {

  if (!selectedId) {
    return;
  }


  const item =
    items.find(
      item => item.id === selectedId
    );


  if (!item) {
    return;
  }


  // Sammelvorgänge werden automatisch aus ihren
  // Unteraufgaben berechnet und nicht direkt verschoben.
  const hasChildren =
    childrenOf(selectedId).length > 0;


  if (hasChildren) {

    console.log(
      "ZEITVERSCHIEBUNG ABGELEHNT:",
      item.title,
      "ist ein Sammelvorgang."
    );

    return;
  }


  const oldStart =
    parseDate(item.entryDate);

  const oldEnd =
    parseDate(item.dueDate);


  if (!oldStart || !oldEnd) {

    console.log(
      "ZEITVERSCHIEBUNG ABGELEHNT:",
      item.title,
      "hat kein vollständiges Start-/Enddatum."
    );

    return;
  }


  const newStart =
    addDays(
      oldStart,
      days
    );

  const newEnd =
    addDays(
      oldEnd,
      days
    );


  console.log(
    "=== ZEITVERSCHIEBUNG ==="
  );

  console.log(
    "Aufgabe:",
    item.title
  );

  console.log(
    "ID:",
    item.id
  );

  console.log(
    "VORHER:",
    {
      start: formatDate(oldStart),
      end: formatDate(oldEnd)
    }
  );

  console.log(
    "VERSCHIEBUNG:",
    days,
    "Tag(e)"
  );

  console.log(
    "NACHHER:",
    {
      start: formatDate(newStart),
      end: formatDate(newEnd)
    }
  );


  console.log(
    "→ Thunderbird: updateDates()"
  );

  const saved =
    await browser.tbPlannerCalendar.updateDates(
      calendarSelect.value,
      item.id,
      toDateString(newStart),
      toDateString(newEnd)
    );


  Object.assign(
    item,
    saved
  );


  console.log(
    "RENDER NACH DATUMSÄNDERUNG:",
    {
      title: item.title,
      entryDate: item.entryDate,
      dueDate: item.dueDate
    }
  );


  render();


  console.log(
    "GESPEICHERT:",
    {
      start: item.entryDate,
      end: item.dueDate
    }
  );

  console.log(
    "=== ZEITVERSCHIEBUNG ENDE ==="
  );
}


// ============================================================
// DAUER ÄNDERN
// ============================================================

async function changeSelectedDuration(days) {

  if (!selectedId) {
    return;
  }


  const item =
    items.find(
      item => item.id === selectedId
    );


  if (!item) {
    return;
  }


  // Sammelvorgänge werden automatisch aus ihren
  // Unteraufgaben berechnet.
  const hasChildren =
    childrenOf(selectedId).length > 0;


  if (hasChildren) {

    console.log(
      "DAUERÄNDERUNG ABGELEHNT:",
      item.title,
      "ist ein Sammelvorgang."
    );

    return;
  }


  const oldStart =
    parseDate(item.entryDate);

  const oldEnd =
    parseDate(item.dueDate);


  if (!oldStart || !oldEnd) {

    console.log(
      "DAUERÄNDERUNG ABGELEHNT:",
      item.title,
      "hat kein vollständiges Start-/Enddatum."
    );

    return;
  }


  const oldDuration =
    Math.round(
      (
        startOfDay(oldEnd) -
        startOfDay(oldStart)
      ) /
      (24 * 60 * 60 * 1000)
    ) + 1;


  const newDuration =
    oldDuration + days;


  // Mindestens ein Kalendertag.
  if (newDuration < 1) {

    console.log(
      "DAUERÄNDERUNG ABGELEHNT:",
      "Mindestdauer erreicht."
    );

    return;
  }


  const newEnd =
    addDays(
      oldEnd,
      days
    );


  console.log(
    "=== DAUERÄNDERUNG ==="
  );

  console.log(
    "Aufgabe:",
    item.title
  );

  console.log(
    "ID:",
    item.id
  );

  console.log(
    "VORHER:",
    {
      start: formatDate(oldStart),
      end: formatDate(oldEnd),
      duration: oldDuration + " Tag(e)"
    }
  );

  console.log(
    "ÄNDERUNG:",
    days > 0
      ? "+1 Tag"
      : "-1 Tag"
  );

  console.log(
    "NACHHER:",
    {
      start: formatDate(oldStart),
      end: formatDate(newEnd),
      duration: newDuration + " Tag(e)"
    }
  );


  console.log(
    "→ Thunderbird: updateDates()"
  );

  const saved =
    await browser.tbPlannerCalendar.updateDates(
      calendarSelect.value,
      item.id,
      toDateString(oldStart),
      toDateString(newEnd)
    );


  Object.assign(
    item,
    saved
  );


  console.log(
    "RENDER NACH DATUMSÄNDERUNG:",
    {
      title: item.title,
      entryDate: item.entryDate,
      dueDate: item.dueDate
    }
  );


  render();


  console.log(
    "GESPEICHERT:",
    {
      start: item.entryDate,
      end: item.dueDate
    }
  );

  console.log(
    "=== DAUERÄNDERUNG ENDE ==="
  );
}


// ============================================================
// VTODO-EDITOR
// ============================================================

function updateTodoEditor() {

  if (!selectedId) {

    todoEditor.classList.add(
      "hidden"
    );

    return;
  }


  const item =
    items.find(
      item => item.id === selectedId
    );


  if (!item) {

    todoEditor.classList.add(
      "hidden"
    );

    return;
  }


  // Sammelvorgänge nicht direkt bearbeiten.
  if (
    childrenOf(selectedId).length > 0
  ) {

    todoEditor.classList.add(
      "hidden"
    );

    return;
  }


  todoEditorTask.textContent =
    item.title || "";


  todoTitleInput.value =
    item.title || "";


  todoDescriptionInput.value =
    item.description || "";


  const progress =
    Number.isFinite(
      Number(item.percentComplete)
    )
      ? Number(item.percentComplete)
      : 0;


  todoProgressInput.value =
    progress;

  todoProgressValue.textContent =
    `${progress} %`;


  todoEditor.classList.remove(
    "hidden"
  );
}


// ============================================================
// BUTTONS
// ============================================================

function updateButtons() {

  const enabled =
    !!selectedId;


  if (createTaskButton) {
    createTaskButton.disabled =
      !calendarSelect.value;
  }

  if (renameTaskButton) {
    renameTaskButton.disabled =
      !enabled;
  }


  indentButton.disabled =
    !enabled;

  outdentButton.disabled =
    !enabled;

  upButton.disabled =
    !enabled;

  downButton.disabled =
    !enabled;

  minusWeekButton.disabled =
    !enabled;

  minusDayButton.disabled =
    !enabled;

  plusDayButton.disabled =
    !enabled;

  plusWeekButton.disabled =
    !enabled;

  minusDurationButton.disabled =
    !enabled;

  plusDurationButton.disabled =
    !enabled;


  updateTodoEditor();
}


// ============================================================
// EVENTS
// ============================================================

calendarSelect.addEventListener(
  "change",
  loadItems
);


refreshButton.addEventListener(
  "click",
  loadItems
);

createTaskButton.addEventListener(
  "click",
  createTask
);


renameTaskButton.addEventListener(
  "click",
  renameSelectedTask
);



indentButton.addEventListener(
  "click",
  indentSelected
);


outdentButton.addEventListener(
  "click",
  outdentSelected
);


upButton.addEventListener(
  "click",
  () =>
    moveSelected("up")
);


downButton.addEventListener(
  "click",
  () =>
    moveSelected("down")
);


minusWeekButton.addEventListener(
  "click",
  () =>
    shiftSelectedDays(-7)
);


minusDayButton.addEventListener(
  "click",
  () =>
    shiftSelectedDays(-1)
);


plusDayButton.addEventListener(
  "click",
  () =>
    shiftSelectedDays(1)
);


plusWeekButton.addEventListener(
  "click",
  () =>
    shiftSelectedDays(7)
);


minusDurationButton.addEventListener(
  "click",
  () =>
    changeSelectedDuration(-1)
);


plusDurationButton.addEventListener(
  "click",
  () =>
    changeSelectedDuration(1)
);


zoomButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () =>
        setZoom(
          button.dataset.zoom
        )
    );
  }
);


todoProgressInput.addEventListener(
  "input",
  () => {

    todoProgressValue.textContent =
      `${todoProgressInput.value} %`;
  }
);


// ------------------------------------------------------------
// VTODO speichern
// ------------------------------------------------------------

todoSaveButton.addEventListener(
  "click",
  async () => {

    if (!selectedId) {
      return;
    }


    const item =
      items.find(
        item => item.id === selectedId
      );


    if (!item) {
      return;
    }


    const title =
      todoTitleInput.value.trim();


    const description =
      todoDescriptionInput.value;


    const progress =
      Number(
        todoProgressInput.value
      );


    console.log(
      "=== VTODO ÄNDERUNG ==="
    );

    console.log(
      "Aufgabe:",
      item.title
    );

    console.log(
      "VORHER:",
      {
        title: item.title,
        percentComplete:
          item.percentComplete
      }
    );

    console.log(
      "NACHHER:",
      {
        title: title,
        percentComplete: progress
      }
    );


    try {

      todoSaveButton.disabled =
        true;


      const saved =
        await browser.tbPlannerCalendar.updateTodo(
          calendarSelect.value,
          item.id,
          title,
          description,
          progress
        );


      Object.assign(
        item,
        saved
      );


      console.log(
        "VTODO GESPEICHERT:",
        {
          title: item.title,
          percentComplete:
            item.percentComplete,
          status:
            item.status
        }
      );


      render();


      todoEditor.classList.add(
        "hidden"
      );


      console.log(
        "VTODO-EDITOR GESCHLOSSEN"
      );


      console.log(
        "=== VTODO ÄNDERUNG ENDE ==="
      );


    } catch (error) {

      console.error(
        "VTODO-SPEICHERUNG FEHLGESCHLAGEN:",
        error
      );

    } finally {

      todoSaveButton.disabled =
        false;
    }
  }
);


// ------------------------------------------------------------
// VTODO-Bearbeitung abbrechen
// ------------------------------------------------------------

todoCancelButton.addEventListener(
  "click",
  () => {

    todoEditor.classList.add(
      "hidden"
    );

    console.log(
      "VTODO-ÄNDERUNG VERWORFEN"
    );

    console.log(
      "VTODO-EDITOR GESCHLOSSEN"
    );
  }
);


// ============================================================
// START
// ============================================================

async function start() {

  try {

    status.textContent =
      "Initialisiere …";


    await loadCalendars();

    await loadItems();

  } catch (error) {

    console.error(
      error
    );


    planner.innerHTML =
      `<div class="error">
        Fehler beim Laden des TB Planners:

        ${escapeHtml(
          error
        )}
       </div>`;


    status.textContent =
      "Fehler";
  }
}


start();
