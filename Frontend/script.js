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
let searchTimer;

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
  add: ["إضافة طالب جديد", "يرجى تعبئة البيانات التالية لإضافة طالب جديد إلى النظام"],
  students: ["قائمة الطلاب", "استعراض السجلات والبحث والتصفية والتعديل والحذف"],
  reports: ["التقارير والإحصاءات", "نظرة عامة على التخصصات والحالة الأكاديمية"],
  settings: ["الإعدادات والاتصال", "تعرّف على حالة الاتصال بالخادم وروابط واجهة API"],
};

function safeText(value) {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

function statusName(status) {
  return status || "غير محدد";
}

function statusStyle(status) {
  const styles = {
    مستمر: "status-active",
    متخرج: "status-graduated",
    موقوف: "status-suspended",
    منسحب: "status-withdrawn",
  };

  return styles[status] || "status-unknown";
}

function stageName(stage) {
  return STAGE_NAMES[Number(stage)] || String(stage || "—");
}

function gpaName(gpa) {
  return gpa === null || gpa === undefined || gpa === ""
    ? "—"
    : Number(gpa).toFixed(2);
}

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
        .map((error) => {
          const location = (error.loc || []).slice(1).join(".");
          return `${location}: ${error.msg}`;
        })
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

  toastTimer = setTimeout(
    () => {
      element.hidden = true;
    },
    type === "warning" ? 9000 : 6000
  );
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

function go(page) {
  if (!(page in PAGE_TEXT)) {
    page = "add";
  }

  document.querySelectorAll(".page").forEach((element) => {
    element.classList.toggle("active", element.id === `page-${page}`);
  });

  document.querySelectorAll(".nav-link").forEach((element) => {
    element.classList.toggle("active", element.dataset.go === page);
  });

  if ($("hero-title")) {
    $("hero-title").textContent = PAGE_TEXT[page][0];
  }

  if ($("hero-description")) {
    $("hero-description").textContent = PAGE_TEXT[page][1];
  }

  $("sidebar")?.classList.remove("open");

  if ($("sidebar-overlay")) {
    $("sidebar-overlay").hidden = true;
  }

  window.location.hash = page;
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (page === "home") {
    renderDashboard();
  }

  if (page === "reports") {
    renderReports();
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

function makeEmptyRow(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = 7;
  cell.className = "empty-state";
  cell.textContent = message;

  row.appendChild(cell);
  return row;
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
      $("students-body").replaceChildren(makeEmptyRow(error.message));
    }

    setConnection(false);
    notify(`تعذر تحميل الطلاب: ${error.message}`, "error");
  } finally {
    isLoading = false;
  }
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
    [...select.options].some((option) => option.value === oldValue)
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
      (!department?.value ||
        student.department === department.value) &&
      (!stage?.value ||
        Number(student.stage) === Number(stage.value)) &&
      (!status?.value || student.status === status.value)
    );
  });

  const lastPage = Math.max(
    0,
    Math.ceil(displayedStudents.length / PER_PAGE) - 1
  );

  currentPage = Math.min(currentPage, lastPage);
  renderTable();
}

function tableCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = safeText(value);
  row.appendChild(cell);
  return cell;
}

function actionButton(name, title, callback, extraClass = "") {
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

  const start = currentPage * PER_PAGE;
  const pageData = displayedStudents.slice(start, start + PER_PAGE);

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

    statusSpan.className = `badge-status ${statusStyle(student.status)}`;
    statusSpan.textContent = statusName(student.status);

    statusCell.appendChild(statusSpan);
    row.appendChild(statusCell);

    const actionCell = document.createElement("td");
    const actions = document.createElement("div");

    actions.className = "table-actions";
    actions.append(
      actionButton("eye", "عرض التفاصيل", () => showStudent(student)),
      actionButton("edit", "تعديل الطالب", () => startEdit(student)),
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
    $("next-page").disabled = currentPage + 1 >= totalPages;
  }
}

function resetForm() {
  form.reset();
  editId = null;

  $("form-heading").textContent = "البيانات الأكاديمية والشخصية";
  $("save-button").lastElementChild.textContent = "إضافة الطالب";
  $("cancel-button").classList.add("hidden");
}

function readForm() {
  const data = Object.fromEntries(new FormData(form));

  data.student_number = String(data.student_number || "").trim();
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
        student[field] ?? (field === "status" ? "مستمر" : "");
    }
  });

  $("form-heading").textContent =
    `تعديل بيانات الطالب #${student.id}`;
  $("save-button").lastElementChild.textContent = "حفظ التعديلات";
  $("cancel-button").classList.remove("hidden");

  go("add");
  $("form-section")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

async function deleteStudent(student) {
  if (
    !window.confirm(
      `هل تريد حذف الطالب «${student.full_name}» نهائياً؟`
    )
  ) {
    return;
  }

  try {
    await request(`${API}/${student.id}`, { method: "DELETE" });

    if (editId === student.id) {
      resetForm();
    }

    await loadStudents({ quiet: true });
    notify("تم حذف الطالب بنجاح.");
  } catch (error) {
    notify(`تعذر حذف الطالب: ${error.message}`, "error");
  }
}

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
      allStudents.map((student) => student.department).filter(Boolean)
    ).size;
  }
}

function renderReports() {
  const departmentReport = $("department-report");
  const statusReport = $("status-report");

  if (!departmentReport || !statusReport) {
    return;
  }

  departmentReport.replaceChildren();
  statusReport.replaceChildren();

  const groupBy = (key) =>
    allStudents.reduce((result, student) => {
      const value = student[key] || "غير محدد";
      result[value] = (result[value] || 0) + 1;
      return result;
    }, {});

  const renderGroup = (container, groups) => {
    const entries = Object.entries(groups).sort(
      (a, b) => b[1] - a[1]
    );

    if (!entries.length) {
      container.textContent = "لا توجد بيانات لعرض التقرير";
      return;
    }

    const max = entries[0][1];

    for (const [name, count] of entries) {
      const item = document.createElement("div");
      item.className = "report-item";

      item.textContent = `${name}: ${count}`;
      item.style.setProperty(
        "--percentage",
        `${(count / Math.max(1, max)) * 100}%`
      );

      container.appendChild(item);
    }
  };

  renderGroup(departmentReport, groupBy("department"));
  renderGroup(statusReport, groupBy("status"));
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
                .replace(/^[=+@-\t\r]/, "'$&")
                .replace(/"/g, '""')}"`
          )
          .join(",")
      )
      .join("\r\n");

  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" })
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = "students_report.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener("submit", async (event) => {
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
        "تم حفظ البيانات الأساسية، لكن GPA والحالة لم يرجعهما الخادم.",
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

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.go === "add" && editId === null) {
      resetForm();
    }

    go(button.dataset.go);
  });
});

$("menu-toggle")?.addEventListener("click", () => {
  $("sidebar")?.classList.toggle("open");

  if ($("sidebar-overlay")) {
    $("sidebar-overlay").hidden = !$("sidebar")?.classList.contains("open");
  }
});

$("sidebar-overlay")?.addEventListener("click", () => {
  $("sidebar")?.classList.remove("open");
  $("sidebar-overlay").hidden = true;
});

window.addEventListener("hashchange", () => {
  const page = window.location.hash.slice(1);

  if (
    page in PAGE_TEXT &&
    !$(`page-${page}`)?.classList.contains("active")
  ) {
    go(page);
  }
});

$("search")?.addEventListener("input", () => {
  clearTimeout(searchTimer);

  searchTimer = setTimeout(() => {
    currentPage = 0;
    applyFilters();
  }, 250);
});

["filter-department", "filter-stage", "filter-status"].forEach((id) => {
  $(id)?.addEventListener("change", () => {
    currentPage = 0;
    applyFilters();
  });
});

$("clear-filters")?.addEventListener("click", () => {
  $("search").value = "";

  ["filter-department", "filter-stage", "filter-status"].forEach(
    (id) => {
      $(id).value = "";
    }
  );

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
  if ((currentPage + 1) * PER_PAGE < displayedStudents.length) {
    currentPage++;
    renderTable();
  }
});

$("new-student")?.addEventListener("click", () => {
  resetForm();
  go("add");
});

$("cancel-button")?.addEventListener("click", resetForm);

$("reset-button")?.addEventListener("click", resetForm);

$("close-dialog")?.addEventListener("click", () => {
  $("student-dialog")?.close();
});

$("dialog-done")?.addEventListener("click", () => {
  $("student-dialog")?.close();
});

$("export-csv")?.addEventListener("click", downloadCsv);

$("test-connection")?.addEventListener("click", async () => {
  const result = $("connection-result");

  if (result) {
    result.textContent = "جاري فحص الخادم...";
  }

  try {
    const data = await request("/health");

    if (result) {
      result.textContent =
        data.status === "ok"
          ? "الخادم يستجيب بصورة صحيحة (FastAPI)."
          : "الخادم يستجيب، لكن حالة /health غير متوقعة.";
    }

    setConnection(true);
  } catch (error) {
    if (result) {
      result.textContent = `فشل الاتصال: ${error.message}`;
    }

    setConnection(false);
  }
});

go((window.location.hash || "#add").slice(1));
loadStudents();