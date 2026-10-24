/*
 * Student Management System — واجهة RTL متصلة بـ FastAPI.
 * الخادم الحالي: GET/POST/PUT/DELETE /api/students وGET /health.
 * ملاحظة: يجب إضافة gpa وstatus إلى Backend لكي يتم حفظهما في MySQL.
 */
"use strict";

const API = "/api/students";
let PER_PAGE = getPageSize();
function getPageSize() {
  if (window.innerWidth <= 700) return window.innerHeight <= 640 ? 1 : 2;
  if (window.innerHeight < 680) return 3;
  if (window.innerHeight < 850) return 5;
  return 8;
}
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

// في الهاتف والشاشات القصيرة: حقول النموذج على خطوتين بدون تمرير الصفحة.
const stepMedia = window.matchMedia("(max-width: 700px), (max-height: 560px)");
let formStep = 0;
function setFormStep(next) {
  const enabled = stepMedia.matches;
  formStep = enabled ? (next === 1 ? 1 : 0) : 0;
  $("step-indicator").hidden = !enabled;
  $("prev-step").hidden = !enabled || formStep === 0;
  $("step-title").textContent = formStep === 0 ? "البيانات الأساسية" : "البيانات الإضافية";
  $("step-count").textContent = `الخطوة ${formStep + 1} من 2`;
  const fields = [...document.querySelectorAll("#student-form .form-grid > .field")];
  fields.forEach((field, index) => field.classList.toggle("is-step-hidden", enabled && (formStep === 0 ? index >= 4 : index < 4)));
  $("save-button").lastElementChild.textContent = enabled && formStep === 0
    ? "التالي" : editId !== null ? "حفظ التعديلات" : "إضافة الطالب";
}
function validateStepOne() {
  const fields = [...document.querySelectorAll("#student-form .form-grid > .field")].slice(0, 4);
  for (const control of fields.flatMap((field) => [...field.querySelectorAll("input, select")])) {
    if (!control.checkValidity()) { control.reportValidity(); return false; }
  }
  return true;
}


const STAGE_NAMES = { 1: "الأولى", 2: "الثانية", 3: "الثالثة", 4: "الرابعة", 5: "الخامسة", 6: "السادسة" };
const PAGE_TEXT = {
  home: ["الرئيسية", "ملخص السجل الأكاديمي وإحصاءات الطلاب"],
  add: ["إضافة طالب جديد", "يرجى تعبئة البيانات التالية لإضافة طالب جديد إلى النظام"],
  students: ["قائمة الطلاب", "استعراض السجلات والبحث والتصفية والتعديل والحذف"],
  reports: ["التقارير والإحصاءات", "نظرة عامة على التخصصات والحالة الأكاديمية"],
  settings: ["الإعدادات والاتصال", "تعرّف على حالة الاتصال بالخادم وروابط واجهة API"],
};

async function request(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try { response = await fetch(path, { ...options, headers }); }
  catch { throw new Error("تعذر الاتصال بالخادم. تأكد من تشغيل FastAPI وافتح الواجهة من /static/index.html"); }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    let detail = data.detail || `فشل الطلب (HTTP ${response.status})`;
    if (Array.isArray(detail)) detail = detail.map((e) => `${(e.loc || []).slice(1).join(".")}: ${e.msg}`).join(" | ");
    throw new Error(String(detail));
  }
  return data;
}

function notify(text, type = "success") {
  const el = $("toast");
  el.textContent = text;
  el.className = `toast ${type}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, type === "warning" ? 9000 : 6000);
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

// التنقل بين كل صفحات القائمة حتى لو تعذر اتصال الـ API.
function closeMobileMenu() {
  $("sidebar").classList.remove("open");
  $("sidebar-overlay").hidden = true;
  $("menu-toggle").setAttribute("aria-expanded", "false");
  $("menu-toggle").setAttribute("aria-label", "فتح القائمة");
}

function go(page) {
  if (!(page in PAGE_TEXT)) page = "add";
  for (const section of document.querySelectorAll(".page")) {
    const active = section.id === `page-${page}`;
    section.classList.toggle("active", active);
    section.hidden = !active;
  }
  for (const link of document.querySelectorAll(".nav-link")) {
    const active = link.dataset.go === page;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  $("hero-title").textContent = PAGE_TEXT[page][0];
  $("hero-description").textContent = PAGE_TEXT[page][1];
  closeMobileMenu();
  if (window.location.hash !== `#${page}`) window.location.hash = page;
  window.scrollTo({ top: 0, behavior: "instant" });
  if (page === "home") renderDashboard();
  if (page === "students") renderTable();
  if (page === "reports") renderReports();
}

for (const control of document.querySelectorAll("[data-go]")) {
  control.addEventListener("click", () => {
    if (control.dataset.go === "add" && editId === null) resetForm();
    go(control.dataset.go);
  });
}
$("menu-toggle").addEventListener("click", () => {
  const isOpen = $("sidebar").classList.toggle("open");
  $("sidebar-overlay").hidden = !isOpen;
  $("menu-toggle").setAttribute("aria-expanded", String(isOpen));
  $("menu-toggle").setAttribute("aria-label", isOpen ? "إغلاق القائمة" : "فتح القائمة");
});
$("sidebar-overlay").addEventListener("click", closeMobileMenu);
window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMobileMenu(); });
window.addEventListener("resize", () => { if (window.innerWidth > 1050) closeMobileMenu(); });
window.addEventListener("hashchange", () => {
  const next = window.location.hash.slice(1);
  if (next in PAGE_TEXT && !$("page-" + next).classList.contains("active")) go(next);
});

function stageName(stage) { return STAGE_NAMES[Number(stage)] || String(stage || "—"); }
function gpaName(gpa) { return gpa === null || gpa === undefined || gpa === "" ? "—" : Number(gpa).toFixed(2); }
function statusName(status) { return status || "غير محدد"; }
function statusStyle(status) { return ["مؤجل"].includes(status) ? "muted" : ["منسحب"].includes(status) ? "inactive" : ""; }
function safeText(value) { return value === null || value === undefined || value === "" ? "—" : String(value); }

async function loadStudents({ quiet = false } = {}) {
  if (isLoading) return;
  isLoading = true;
  if (!quiet) $("students-body").replaceChildren(makeEmptyRow("جاري تحميل بيانات الطلاب..."));
  try {
    let records = [];
    let skip = 0;
    while (skip < MAX_RECORDS) {
      const page = await request(`${API}?skip=${skip}&limit=${FETCH_BATCH}`);
      if (!page || !Array.isArray(page.items)) throw new Error("شكل استجابة API غير متوقع");
      records.push(...page.items);
      skip += page.items.length;
      if (page.items.length === 0 || skip >= Number(page.total) || page.items.length < FETCH_BATCH) break;
    }
    allStudents = records;
    if (skip >= MAX_RECORDS) notify("تم عرض أول 10000 سجل فقط. للتوسع استخدم التصفية من الخادم.", "warning");
    populateDepartments();
    applyFilters();
    renderDashboard();
    renderReports();
    setConnection(true);
  } catch (error) {
    $("students-body").replaceChildren(makeEmptyRow(error.message));
    setConnection(false);
    notify(`تعذر تحميل الطلاب: ${error.message}`, "error");
  } finally { isLoading = false; }
}

function setConnection(connected) {
  $("sidebar-status").textContent = connected ? "الاتصال بالخادم متاح" : "تعذر الاتصال بالخادم";
  document.querySelector(".online-dot").classList.toggle("offline", !connected);
}

function populateDepartments() {
  const select = $("filter-department");
  const old = select.value;
  select.replaceChildren(new Option("كل التخصصات", ""));
  [...new Set(allStudents.map((s) => s.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")).forEach((d) => select.add(new Option(d, d)));
  if ([...select.options].some((x) => x.value === old)) select.value = old;
  const datalist = $("department-options");
  const existing = new Set([...datalist.options].map((opt) => opt.value));
  for (const d of allStudents.map((s) => s.department)) if (d && !existing.has(d)) { datalist.appendChild(new Option(d, d)); existing.add(d); }
}

function applyFilters() {
  const needle = $("search").value.trim().toLocaleLowerCase("ar");
  const department = $("filter-department").value;
  const stage = $("filter-stage").value;
  const status = $("filter-status").value;
  displayedStudents = allStudents.filter((s) =>
    (!needle || [s.full_name, s.student_number].some((val) => String(val || "").toLocaleLowerCase("ar").includes(needle))) &&
    (!department || s.department === department) &&
    (!stage || Number(s.stage) === Number(stage)) &&
    (!status || s.status === status)
  );
  const lastPage = Math.max(0, Math.ceil(displayedStudents.length / PER_PAGE) - 1);
  currentPage = Math.min(currentPage, lastPage);
  renderTable();
}

function makeEmptyRow(message) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 7;
  td.className = "empty-state";
  td.textContent = message;
  tr.appendChild(td);
  return tr;
}

function tableCell(tr, value, label = "") {
  const td = document.createElement("td");
  td.dataset.label = label;
  td.textContent = safeText(value);
  tr.appendChild(td);
  return td;
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
  tbody.replaceChildren();
  const pageData = displayedStudents.slice(currentPage * PER_PAGE, (currentPage + 1) * PER_PAGE);
  if (!pageData.length) tbody.appendChild(makeEmptyRow("لا توجد سجلات مطابقة. يمكنك تعديل البحث أو إضافة طالب جديد."));
  for (const s of pageData) {
    const tr = document.createElement("tr");
    tableCell(tr, s.student_number, "الرقم");
    tableCell(tr, s.full_name, "الاسم");
    tableCell(tr, s.department, "التخصص");
    tableCell(tr, stageName(s.stage), "المرحلة");
    tableCell(tr, gpaName(s.gpa), "GPA");
    const statusTd = document.createElement("td");
    const statusSpan = document.createElement("span");
    statusSpan.className = `badge-status ${statusStyle(s.status)}`;
    statusSpan.textContent = statusName(s.status);
    statusTd.appendChild(statusSpan);
    tr.appendChild(statusTd);
    const actionTd = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "table-actions";
    actions.append(actionButton("eye", "عرض التفاصيل", () => showStudent(s)), actionButton("edit", "تعديل الطالب", () => startEdit(s)), actionButton("trash", "حذف الطالب", () => deleteStudent(s), "danger"));
    actionTd.appendChild(actions);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
  $("total-students").textContent = `${displayedStudents.length} طالب من أصل ${allStudents.length}`;
  const totalPages = Math.max(1, Math.ceil(displayedStudents.length / PER_PAGE));
  $("page-info").textContent = `الصفحة ${currentPage + 1} من ${totalPages}`;
  $("prev-page").disabled = currentPage === 0;
  $("next-page").disabled = currentPage + 1 >= totalPages;
}

function resetForm() {
  form.reset();
  editId = null;
  $("form-heading").textContent = "البيانات الأكاديمية والشخصية";
  $("save-button").lastElementChild.textContent = "إضافة الطالب";
  $("cancel-button").classList.add("hidden");
  setFormStep(0);
}

function readForm() {
  const data = Object.fromEntries(new FormData(form));
  data.student_number = data.student_number.trim();
  data.full_name = data.full_name.trim();
  data.department = data.department.trim();
  data.stage = Number(data.stage);
  data.gpa = data.gpa === "" ? null : Number(data.gpa);
  data.status = data.status || "مستمر";
  data.email = String(data.email || "").trim() || null;
  data.phone = String(data.phone || "").trim() || null;
  return data;
}

function startEdit(student) {
  editId = student.id;
  ["student_number", "full_name", "department", "stage", "gpa", "status", "email", "phone"].forEach((field) => {
    const element = $(field);
    element.value = student[field] ?? (field === "status" ? "مستمر" : "");
  });
  $("form-heading").textContent = `تعديل بيانات الطالب #${student.id}`;
  $("save-button").lastElementChild.textContent = "حفظ التعديلات";
  $("cancel-button").classList.remove("hidden");
  go("add");
  setFormStep(0);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (stepMedia.matches && formStep === 0) {
    if (validateStepOne()) setFormStep(1);
    return;
  }
  if (!form.reportValidity()) return;
  const button = $("save-button");
  button.disabled = true;
  const editing = editId !== null;
  const payload = readForm();
  try {
    const saved = await request(editing ? `${API}/${editId}` : API, { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
    resetForm();
    await loadStudents({ quiet: true });
    go("students");
    if (!saved || !("gpa" in saved) || !("status" in saved)) {
      notify("تم حفظ البيانات الأساسية، لكن GPA والحالة لم يرجعهما الخادم. يجب تحديث Backend لحفظهما في MySQL؛ راجع ملف التعليمات المرفق.", "warning");
    } else {
      notify(editing ? "تم حفظ تعديل بيانات الطالب بنجاح." : "تمت إضافة الطالب بنجاح.");
    }
  } catch (error) { notify(`تعذر حفظ الطالب: ${error.message}`, "error"); }
  finally { button.disabled = false; }
});

function showStudent(student) {
  const details = $("student-details");
  details.replaceChildren();
  const pairs = [["الاسم الكامل", student.full_name], ["الرقم الجامعي", student.student_number], ["التخصص", student.department], ["المرحلة", stageName(student.stage)], ["GPA", gpaName(student.gpa)], ["الحالة", statusName(student.status)], ["البريد الإلكتروني", student.email], ["رقم الهاتف", student.phone]];
  for (const [label, value] of pairs) {
    const block = document.createElement("div");
    const strong = document.createElement("strong"); strong.textContent = label;
    const span = document.createElement("span"); span.textContent = safeText(value);
    block.append(strong, span);
    details.appendChild(block);
  }
  $("student-dialog").showModal();
}

async function deleteStudent(student) {
  if (!window.confirm(`هل تريد حذف الطالب «${student.full_name}» نهائياً؟`)) return;
  try {
    await request(`${API}/${student.id}`, { method: "DELETE" });
    if (editId === student.id) resetForm();
    await loadStudents({ quiet: true });
    notify("تم حذف الطالب بنجاح.");
  } catch (error) { notify(`تعذر حذف الطالب: ${error.message}`, "error"); }
}

let searchTimer;
$("search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { currentPage = 0; applyFilters(); }, 250); });
for (const id of ["filter-department", "filter-stage", "filter-status"]) $(id).addEventListener("change", () => { currentPage = 0; applyFilters(); });
$("clear-filters").addEventListener("click", () => { $("search").value = ""; for (const name of ["filter-department", "filter-stage", "filter-status"]) $(name).value = ""; currentPage = 0; applyFilters(); });
$("prev-page").addEventListener("click", () => { if (currentPage > 0) { currentPage--; renderTable(); } });
$("next-page").addEventListener("click", () => { if ((currentPage + 1) * PER_PAGE < displayedStudents.length) { currentPage++; renderTable(); } });
$("new-student").addEventListener("click", () => { resetForm(); go("add"); });
$("cancel-button").addEventListener("click", () => resetForm());
$("prev-step").addEventListener("click", () => setFormStep(0));
$("reset-button").addEventListener("click", () => { editId = null; $("cancel-button").classList.add("hidden"); $("form-heading").textContent = "البيانات الأكاديمية والشخصية"; setFormStep(0); });
$("close-dialog").addEventListener("click", () => $("student-dialog").close());
$("dialog-done").addEventListener("click", () => $("student-dialog").close());

function renderDashboard() {
  $("stat-total").textContent = allStudents.length;
  $("stat-active").textContent = allStudents.filter((s) => s.status === "مستمر").length;
  const grades = allStudents.map((s) => Number(s.gpa)).filter((x, i) => allStudents[i].gpa != null && Number.isFinite(x));
  $("stat-gpa").textContent = grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2) : "—";
  $("stat-depts").textContent = new Set(allStudents.map((s) => s.department).filter(Boolean)).size;
  const recent = $("recent-students");
  recent.replaceChildren();
  if (!allStudents.length) { recent.textContent = "لا توجد سجلات حالياً."; return; }
  for (const student of [...allStudents].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 5)) {
    const row = document.createElement("div"); row.className = "recent-row";
    const avatar = document.createElement("span"); avatar.className = "recent-avatar"; avatar.textContent = (student.full_name || "ط").slice(0, 1);
    const text = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = student.full_name;
    const detail = document.createElement("p"); detail.textContent = `${student.department} · ${stageName(student.stage)} · ${student.student_number}`;
    text.append(name, detail);
    const view = document.createElement("button"); view.className = "btn btn-secondary btn-small"; view.type = "button"; view.textContent = "التفاصيل"; view.addEventListener("click", () => showStudent(student));
    row.append(avatar, text, view); recent.appendChild(row);
  }
}

function reportBar(container, title, count, max) {
  const div = document.createElement("div");
  const top = document.createElement("div"); top.className = "report-item-top";
  const label = document.createElement("span"); label.textContent = title;
  const num = document.createElement("strong"); num.textContent = String(count);
  top.append(label, num);
  const track = document.createElement("div"); track.className = "bar-track";
  const fill = document.createElement("div"); fill.className = "bar-fill"; fill.style.width = `${(count / Math.max(1, max)) * 100}%`;
  track.appendChild(fill); div.append(top, track); container.appendChild(div);
}
function renderReports() {
  const dept = $("department-report"), status = $("status-report");
  dept.replaceChildren(); status.replaceChildren();
  const group = (key) => allStudents.reduce((map, student) => { const value = student[key] || "غير محدد"; map[value] = (map[value] || 0) + 1; return map; }, {});
  for (const [container, groups] of [[dept, group("department")], [status, group("status")]]) {
    const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    // شاشة واحدة دون تمرير؛ نجمع الفئات الكثيرة في خانة "أخرى".
    const entries = sorted.length > 6 ? [...sorted.slice(0, 5), ["أخرى", sorted.slice(5).reduce((t, x) => t + x[1], 0)]] : sorted;
    if (!entries.length) { container.textContent = "لا توجد بيانات لعرض التقرير"; container.classList.add("report-empty"); continue; }
    const max = entries[0][1];
    for (const [name, count] of entries) reportBar(container, name, count, max);
  }
}

function downloadCsv() {
  const rows = [["الرقم الجامعي", "اسم الطالب", "التخصص", "المرحلة", "GPA", "الحالة", "البريد الإلكتروني", "الهاتف"], ...allStudents.map((s) => [s.student_number, s.full_name, s.department, stageName(s.stage), s.gpa ?? "", statusName(s.status), s.email ?? "", s.phone ?? ""])];
  const csv = "\ufeff" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "students_report.csv"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export-csv").addEventListener("click", downloadCsv);
async function testConnection() {
  const result = $("connection-result"); result.textContent = "جاري فحص الخادم...";
  try { const data = await request("/health"); result.textContent = data.status === "ok" ? "✅ الخادم يستجيب بصورة صحيحة (FastAPI)." : "الخادم يستجيب، لكن حالة /health غير متوقعة."; setConnection(true); }
  catch (error) { result.textContent = `❌ ${error.message}`; setConnection(false); }
}
$("test-connection").addEventListener("click", testConnection);

window.addEventListener("resize", () => {
  const nextSize = getPageSize();
  if (PER_PAGE !== nextSize) { PER_PAGE = nextSize; currentPage = 0; applyFilters(); }
  setFormStep(formStep);
});

try {
  setFormStep(0);
  go((window.location.hash || "#add").slice(1));
  loadStudents();
} catch (error) {
  console.error("Frontend initialization error:", error);
  const banner = $("toast");
  if (banner) {
    banner.textContent = "يوجد خطأ في تشغيل الواجهة: " + error.message;
    banner.className = "toast error";
    banner.hidden = false;
  }
}
