/*
 * Student Management System — واجهة RTL متصلة بـ FastAPI.
 * الخادم الحالي: GET/POST/PUT/DELETE /api/students وGET /health.
 * ملاحظة: يجب إضافة gpa وstatus إلى Backend لكي يتم حفظهما في MySQL.
 */
"use strict";

const API = "/api/students";
const PER_PAGE = 8;
const FETCH_BATCH = 100;
const MAX_RECORDS = 10000;

const $ = (id) => document.getElementById(id);
const form = $("student-form");

let allStudents = [];
let displayedStudents = [];
let currentPage = 0;
let editId = null;
let isLoading = false;
let toastTimer = null;

const STAGE_NAMES = {
  1: "الأولى",
  2: "الثانية",
  3: "الثالثة",
  4: "الرابعة",
  5: "الخامسة",
  6: "السادسة",
};

const PAGE_TEXT = {
  home: ["الرئيسية", "ملخص السجل الأكاديمي وإحصاءات الطلاب"],
  add: [
    "إضافة طالب جديد",
    "يرجى تعبئة البيانات التالية لإضافة طالب جديد إلى النظام",
  ],
  students: [
    "قائمة الطلاب",
    "استعراض السجلات والبحث والتصفية والتعديل والحذف",
  ],
  reports: [
    "التقارير والإحصاءات",
    "نظرة عامة على التخصصات والحالة الأكاديمية",
  ],
  settings: [
    "الإعدادات والاتصال",
    "تعرّف على حالة الاتصال بالخادم وروابط واجهة API",
  ],
};

async function request(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(path, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "تعذر الاتصال بالخادم. تأكد من تشغيل FastAPI وافتح الواجهة من /static/index.html"
    );
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let detail = data.detail || `فشل الطلب (HTTP ${response.status})`;

    if (Array.isArray(detail)) {
      detail = detail
        .map(
          (error) =>
            `${(error.loc || []).slice(1).join(".")}: ${error.msg}`
        )
        .join(" | ");
    }

    throw new Error(String(detail));
  }

  return data;
}

function notify(text, type = "success") {
  const element = $("toast");

  if (!element) {
    return;
  }

  element.textContent = text;
  element.className = `toast ${type}`;
  element.hidden = false;

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.hidden = true;
  }, type === "warning" ? 9000 : 6000);
}

function icon(name) {
  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );

  const use = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "use"
  );

  use.setAttribute("href", `#i-${name}`);
  svg.appendChild(use);

  return svg;
}

// التنقل بين كل صفحات القائمة حتى لو تعذر اتصال الـ API.
function closeMobileMenu() {
  $("sidebar")?.classList.remove("open");

  if ($("sidebar-overlay")) {
    $("sidebar-overlay").hidden = true;
  }

  $("menu-toggle")?.setAttribute("aria-expanded", "false");
  $("menu-toggle")?.setAttribute("aria-label", "فتح القائمة");
}

function go(page) {
  if (!(page in PAGE_TEXT)) {
    page = "add";
  }

  for (const section of document.querySelectorAll(".page")) {
    const active = section.id === `page-${page}`;

    section.classList.toggle("active", active);
    section.hidden = !active;
  }

  for (const link of document.querySelectorAll(".nav-link")) {
    const active = link.dataset.go === page;

    link.classList.toggle("active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  if ($("hero-title")) {
    $("hero-title").textContent = PAGE_TEXT[page][0];
  }

  if ($("hero-description")) {
    $("hero-description").textContent = PAGE_TEXT[page][1];
  }

  closeMobileMenu();

  if (window.location.hash !== `#${page}`) {
    window.location.hash = page;
  }

  window.scrollTo({
    top: 0,
    behavior: "instant",
  });

  if (page === "home") {
    renderDashboard();
  }

  if (page === "students") {
    renderTable();
  }

  if (page === "reports") {
    renderReports();
  }
}

for (const control of document.querySelectorAll("[data-go]")) {
  control.addEventListener("click", () => {
    if (control.dataset.go === "add" && editId === null) {
      resetForm();
    }

    go(control.dataset.go);
  });
}

$("menu-toggle")?.addEventListener("click", () => {
  const sidebar = $("sidebar");
  const overlay = $("sidebar-overlay");
  const menuToggle = $("menu-toggle");

  if (!sidebar) {
    return;
  }

  const isOpen = sidebar.classList.toggle("open");

  if (overlay) {
    overlay.hidden = !isOpen;
  }

  menuToggle?.setAttribute("aria-expanded", String(isOpen));
  menuToggle?.setAttribute(
    "aria-label",
    isOpen ? "إغلاق القائمة" : "فتح القائمة"
  );
});

$("sidebar-overlay")?.addEventListener("click", closeMobileMenu);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileMenu();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 1050) {
    closeMobileMenu();
  }
});

window.addEventListener("hashchange", () => {
  const next = window.location.hash.slice(1);

  if (
    next in PAGE_TEXT &&
    !$(`page-${next}`)?.classList.contains("active")
  ) {
    go(next);
  }
});

function stageName(stage) {
  return STAGE_NAMES[Number(stage)] || String(stage || "—");
}

function gpaName(gpa) {
  return gpa === null || gpa === undefined || gpa === ""
    ? "—"
    : Number(gpa).toFixed(2);
}

function statusName(status) {
  return status || "غير محدد";
}

function statusStyle(status) {
  if (status === "مؤجل") {
    return "muted";
  }

  if (status === "منسحب") {
    return "inactive";
  }

  return "";
}

function safeText(value) {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

async function loadStudents({ quiet = false } = {}) {
  if (isLoading) {
    return;
  }

  isLoading = true;

  if (!quiet && $("students-body")) {
    $("students-body").replaceChildren(
      makeEmptyRow("جاري تحميل بيانات الطلاب...")
    );
  }

  try {
    const records = [];
    let skip = 0;

    while (skip < MAX_RECORDS) {
      const page = await request(
        `${API}?skip=${skip}&limit=${FETCH_BATCH}`
      );

      if (!page || !Array.isArray(page.items)) {
        throw new Error("شكل استجابة API غير متوقع");
      }

      records.push(...page.items);
      skip += page.items.length;

      if (
        page.items.length === 0 ||
        skip >= Number(page.total || 0) ||
        page.items.length < FETCH_BATCH
      ) {
        break;
      }
    }

    allStudents = records;

    if (skip >= MAX_RECORDS) {
      notify(
        "تم عرض أول 10000 سجل فقط. للتوسع استخدم التصفية من الخادم.",
        "warning"
      );
    }

    populateDepartments();
    applyFilters();
    renderDashboard();
    renderReports();
    setConnection(true);
  } catch (error) {
    if ($("students-body")) {
      $("students-body").replaceChildren(
        makeEmptyRow(error.message)
      );
    }

    setConnection(false);
    notify(`تعذر تحميل الطلاب: ${error.message}`, "error");
  } finally {
    isLoading = false;
  }
}

function setConnection(connected) {
  if ($("sidebar-status")) {
    $("sidebar-status").textContent = connected
      ? "الاتصال بالخادم متاح"
      : "تعذر الاتصال بالخادم";
  }

  document
    .querySelector(".online-dot")
    ?.classList.toggle("offline", !connected);
}

function populateDepartments() {
  const select = $("filter-department");

  if (!select) {
    return;
  }

  const oldValue = select.value;

  select.replaceChildren(new Option("كل التخصصات", ""));

  const departments = [
    ...new Set(
      allStudents
        .map((student) => student.department)
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "ar"));

  departments.forEach((department) => {
    select.add(new Option(department, department));
  });

  if (
    [...select.options].some(
      (option) => option.value === oldValue
    )
  ) {
    select.value = oldValue;
  }

  const datalist = $("department-options");

  if (!datalist) {
    return;
  }

  const existing = new Set(
    [...datalist.options].map((option) => option.value)
  );

  for (const department of allStudents.map(
    (student) => student.department
  )) {
    if (department && !existing.has(department)) {
      datalist.appendChild(new Option(department, department));
      existing.add(department);
    }
  }
}

function applyFilters() {
  const search = $("search");
  const department = $("filter-department");
  const stage = $("filter-stage");
  const status = $("filter-status");

  const needle = search
    ? search.value.trim().toLocaleLowerCase("ar")
    : "";

  const departmentValue = department?.value || "";
  const stageValue = stage?.value || "";
  const statusValue = status?.value || "";

  displayedStudents = allStudents.filter((student) => {
    const matchesSearch =
      !needle ||
      [student.full_name, student.student_number].some((value) =>
        String(value || "")
          .toLocaleLowerCase("ar")
          .includes(needle)
      );

    return (
      matchesSearch &&
      (!departmentValue ||
        student.department === departmentValue) &&
      (!stageValue ||
        Number(student.stage) === Number(stageValue)) &&
      (!statusValue || student.status === statusValue)
    );
  });

  const lastPage = Math.max(
    0,
    Math.ceil(displayedStudents.length / PER_PAGE) - 1
  );

  currentPage = Math.min(currentPage, lastPage);
  renderTable();
}

function makeEmptyRow(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = 7;
  cell.className = "empty-state";
  cell.textContent = message;

  row.appendChild(cell);
  return row;
}

function tableCell(row, value) {
  const cell = document.createElement("td");

  cell.textContent = safeText(value);
  row.appendChild(cell);

  return cell;
}

function actionButton(
  name,
  title,
  callback,
  extraClass = ""
) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = `table-icon ${extraClass}`;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.appendChild(icon(name));
  button.addEventListener("click", callback);

  return button;
}

function renderTable() {
  const tbody = $("students-body");

  if (!tbody) {
    return;
  }

  tbody.replaceChildren();

  const pageData = displayedStudents.slice(
    currentPage * PER_PAGE,
    (currentPage + 1) * PER_PAGE
  );

  if (!pageData.length) {
    tbody.appendChild(
      makeEmptyRow(
        "لا توجد سجلات مطابقة. يمكنك تعديل البحث أو إضافة طالب جديد."
      )
    );
  }

  for (const student of pageData) {
    const row = document.createElement("tr");

    tableCell(row, student.student_number);
    tableCell(row, student.full_name);
    tableCell(row, student.department);
    tableCell(row, stageName(student.stage));
    tableCell(row, gpaName(student.gpa));

    const statusCell = document.createElement("td");
    const statusSpan = document.createElement("span");

    statusSpan.className = `badge-status ${statusStyle(
      student.status
    )}`;
    statusSpan.textContent = statusName(student.status);

    statusCell.appendChild(statusSpan);
    row.appendChild(statusCell);

    const actionCell = document.createElement("td");
    const actions = document.createElement("div");

    actions.className = "table-actions";

    actions.append(
      actionButton(
        "eye",
        "عرض التفاصيل",
        () => showStudent(student)
      ),
      actionButton(
        "edit",
        "تعديل الطالب",
        () => startEdit(student)
      ),
      actionButton(
        "trash",
        "حذف الطالب",
        () => deleteStudent(student),
        "danger"
      )
    );

    actionCell.appendChild(actions);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  }

  if ($("total-students")) {
    $("total-students").textContent =
      `${displayedStudents.length} طالب من أصل ${allStudents.length}`;
  }

  const totalPages = Math.max(
    1,
    Math.ceil(displayedStudents.length / PER_PAGE)
  );

  if ($("page-info")) {
    $("page-info").textContent =
      `الصفحة ${currentPage + 1} من ${totalPages}`;
  }

  if ($("prev-page")) {
    $("prev-page").disabled = currentPage === 0;
  }

  if ($("next-page")) {
    $("next-page").disabled =
      currentPage + 1 >= totalPages;
  }
}

function resetForm() {
  if (!form) {
    return;
  }

  form.reset();
  editId = null;

  $("form-heading").textContent =
    "البيانات الأكاديمية والشخصية";
  $("save-button").lastElementChild.textContent =
    "إضافة الطالب";
  $("cancel-button").classList.add("hidden");
}

function readForm() {
  const data = Object.fromEntries(new FormData(form));

  data.student_number = String(
    data.student_number || ""
  ).trim();

  data.full_name = String(data.full_name || "").trim();
  data.department = String(data.department || "").trim();
  data.stage = Number(data.stage);
  data.gpa = data.gpa === "" ? null : Number(data.gpa);
  data.status = data.status || "مستمر";
  data.email = String(data.email || "").trim() || null;
  data.phone = String(data.phone || "").trim() || null;

  return data;
}

function startEdit(student) {
  editId = student.id;

  [
    "student_number",
    "full_name",
    "department",
    "stage",
    "gpa",
    "status",
    "email",
    "phone",
  ].forEach((field) => {
    const element = $(field);

    if (element) {
      element.value =
        student[field] ??
        (field === "status" ? "مستمر" : "");
    }
  });

  $("form-heading").textContent =
    `تعديل بيانات الطالب #${student.id}`;
  $("save-button").lastElementChild.textContent =
    "حفظ التعديلات";
  $("cancel-button").classList.remove("hidden");

  go("add");

  $("form-section")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  const button = $("save-button");
  const editing = editId !== null;
  const payload = readForm();

  button.disabled = true;

  try {
    const saved = await request(
      editing ? `${API}/${editId}` : API,
      {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }
    );

    resetForm();
    await loadStudents({ quiet: true });
    go("students");

    if (
      !saved ||
      !("gpa" in saved) ||
      !("status" in saved)
    ) {
      notify(
        "تم حفظ البيانات الأساسية، لكن GPA والحالة لم يرجعهما الخادم. يجب تحديث Backend لحفظهما في MySQL.",
        "warning"
      );
    } else {
      notify(
        editing
          ? "تم حفظ تعديل بيانات الطالب بنجاح."
          : "تمت إضافة الطالب بنجاح."
      );
    }
  } catch (error) {
    notify(`تعذر حفظ الطالب: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
});

function showStudent(student) {
  const details = $("student-details");

  if (!details) {
    return;
  }

  details.replaceChildren();

  const pairs = [
    ["الاسم الكامل", student.full_name],
    ["الرقم الجامعي", student.student_number],
    ["التخصص", student.department],
    ["المرحلة", stageName(student.stage)],
    ["GPA", gpaName(student.gpa)],
    ["الحالة", statusName(student.status)],
    ["البريد الإلكتروني", student.email],
    ["رقم الهاتف", student.phone],
  ];

  for (const [label, value] of pairs) {
    const block = document.createElement("div");
    const strong = document.createElement("strong");
    const span = document.createElement("span");

    strong.textContent = label;
    span.textContent = safeText(value);

    block.append(strong, span);
    details.appendChild(block);
  }

  $("student-dialog")?.showModal();
}

async function deleteStudent(student) {
  const confirmed = window.confirm(
    `هل تريد حذف الطالب «${student.full_name}» نهائياً؟`
  );

  if (!confirmed) {
    return;
  }

  try {
    await request(`${API}/${student.id}`, {
      method: "DELETE",
    });

    if (editId === student.id) {
      resetForm();
    }

    await loadStudents({ quiet: true });
    notify("تم حذف الطالب بنجاح.");
  } catch (error) {
    notify(`تعذر حذف الطالب: ${error.message}`, "error");
  }
}

let searchTimer;

$("search")?.addEventListener("input", () => {
  clearTimeout(searchTimer);

  searchTimer = setTimeout(() => {
    currentPage = 0;
    applyFilters();
  }, 250);
});

for (const id of [
  "filter-department",
  "filter-stage",
  "filter-status",
]) {
  $(id)?.addEventListener("change", () => {
    currentPage = 0;
    applyFilters();
  });
}

$("clear-filters")?.addEventListener("click", () => {
  if ($("search")) {
    $("search").value = "";
  }

  for (const name of [
    "filter-department",
    "filter-stage",
    "filter-status",
  ]) {
    if ($(name)) {
      $(name).value = "";
    }
  }

  currentPage = 0;
  applyFilters();
});

$("prev-page")?.addEventListener("click", () => {
  if (currentPage > 0) {
    currentPage--;
    renderTable();
  }
});

$("next-page")?.addEventListener("click", () => {
  if (
    (currentPage + 1) * PER_PAGE <
    displayedStudents.length
  ) {
    currentPage++;
    renderTable();
  }
});

$("new-student")?.addEventListener("click", () => {
  resetForm();
  go("add");
});

$("cancel-button")?.addEventListener("click", resetForm);

$("reset-button")?.addEventListener("click", () => {
  editId = null;

  $("cancel-button").classList.add("hidden");
  $("form-heading").textContent =
    "البيانات الأكاديمية والشخصية";
  $("save-button").lastElementChild.textContent =
    "إضافة الطالب";
});

$("close-dialog")?.addEventListener("click", () => {
  $("student-dialog")?.close();
});

$("dialog-done")?.addEventListener("click", () => {
  $("student-dialog")?.close();
});

function renderDashboard() {
  if ($("stat-total")) {
    $("stat-total").textContent = allStudents.length;
  }

  if ($("stat-active")) {
    $("stat-active").textContent = allStudents.filter(
      (student) => student.status === "مستمر"
    ).length;
  }

  const grades = allStudents
    .map((student) => Number(student.gpa))
    .filter((value, index) => {
      return (
        allStudents[index].gpa !== null &&
        allStudents[index].gpa !== undefined &&
        Number.isFinite(value)
      );
    });

  if ($("stat-gpa")) {
    $("stat-gpa").textContent = grades.length
      ? (
          grades.reduce((sum, value) => sum + value, 0) /
          grades.length
        ).toFixed(2)
      : "—";
  }

  if ($("stat-depts")) {
    $("stat-depts").textContent = new Set(
      allStudents
        .map((student) => student.department)
        .filter(Boolean)
    ).size;
  }

  const recent = $("recent-students");

  if (!recent) {
    return;
  }

  recent.replaceChildren();

  if (!allStudents.length) {
    recent.textContent = "لا توجد سجلات حالياً.";
    return;
  }

  const recentStudents = [...allStudents]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 5);

  for (const student of recentStudents) {
    const row = document.createElement("div");
    row.className = "recent-row";

    const avatar = document.createElement("span");
    avatar.className = "recent-avatar";
    avatar.textContent = (student.full_name || "ط").slice(0, 1);

    const text = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = student.full_name;

    const detail = document.createElement("p");
    detail.textContent =
      `${student.department} · ${stageName(student.stage)} · ${student.student_number}`;

    text.append(name, detail);

    const view = document.createElement("button");
    view.className = "btn btn-secondary btn-small";
    view.type = "button";
    view.textContent = "التفاصيل";
    view.addEventListener("click", () => showStudent(student));

    row.append(avatar, text, view);
    recent.appendChild(row);
  }
}

function reportBar(container, title, count, max) {
  const div = document.createElement("div");

  const top = document.createElement("div");
  top.className = "report-item-top";

  const label = document.createElement("span");
  label.textContent = title;

  const number = document.createElement("strong");
  number.textContent = String(count);

  top.append(label, number);

  const track = document.createElement("div");
  track.className = "bar-track";

  const fill = document.createElement("div");
  fill.className = "bar-fill";
  fill.style.width =
    `${(count / Math.max(1, max)) * 100}%`;

  track.appendChild(fill);
  div.append(top, track);
  container.appendChild(div);
}

function renderReports() {
  const departmentReport = $("department-report");
  const statusReport = $("status-report");

  if (!departmentReport || !statusReport) {
    return;
  }

  departmentReport.replaceChildren();
  statusReport.replaceChildren();

  const group = (key) =>
    allStudents.reduce((map, student) => {
      const value = student[key] || "غير محدد";
      map[value] = (map[value] || 0) + 1;
      return map;
    }, {});

  const reports = [
    [departmentReport, group("department")],
    [statusReport, group("status")],
  ];

  for (const [container, groups] of reports) {
    const entries = Object.entries(groups).sort(
      (a, b) => b[1] - a[1]
    );

    container.classList.remove("report-empty");

    if (!entries.length) {
      container.textContent = "لا توجد بيانات لعرض التقرير";
      container.classList.add("report-empty");
      continue;
    }

    const max = entries[0][1];

    for (const [name, count] of entries) {
      reportBar(container, name, count, max);
    }
  }
}

function downloadCsv() {
  const rows = [
    [
      "الرقم الجامعي",
      "اسم الطالب",
      "التخصص",
      "المرحلة",
      "GPA",
      "الحالة",
      "البريد الإلكتروني",
      "الهاتف",
    ],
    ...allStudents.map((student) => [
      student.student_number,
      student.full_name,
      student.department,
      stageName(student.stage),
      student.gpa ?? "",
      statusName(student.status),
      student.email ?? "",
      student.phone ?? "",
    ]),
  ];

  const csv =
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map(
            (value) =>
              `"${String(value ?? "")
                .replace(/^[=+@\-\t\r]/, "'$&")
                .replace(/"/g, '""')}"`
          )
          .join(",")
      )
      .join("\r\n");

  const url = URL.createObjectURL(
    new Blob([csv], {
      type: "text/csv;charset=utf-8",
    })
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = "students_report.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

$("export-csv")?.addEventListener("click", downloadCsv);

async function testConnection() {
  const result = $("connection-result");

  if (!result) {
    return;
  }

  result.textContent = "جاري فحص الخادم...";

  try {
    const data = await request("/health");

    result.textContent =
      data.status === "ok"
        ? "✅ الخادم يستجيب بصورة صحيحة (FastAPI)."
        : "الخادم يستجيب، لكن حالة /health غير متوقعة.";

    setConnection(true);
  } catch (error) {
    result.textContent = `❌ ${error.message}`;
    setConnection(false);
  }
}

$("test-connection")?.addEventListener(
  "click",
  testConnection
);

try {
  go((window.location.hash || "#add").slice(1));
  loadStudents();
} catch (error) {
  console.error("Frontend initialization error:", error);

  const banner = $("toast");

  if (banner) {
    banner.textContent =
      "يوجد خطأ في تشغيل الواجهة: " + error.message;
    banner.className = "toast error";
    banner.hidden = false;
  }
}