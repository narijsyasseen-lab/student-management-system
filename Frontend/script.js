/*
 * script.js - ربط صفحة HTML بخادم FastAPI بواسطة Fetch API.
 * البيانات تُقرأ وتُحفظ في MySQL عن طريق Backend.
 */

"use strict";

function initializeStudentsPage() {
    const API = "/api/students";
    const PAGE_SIZE = 10;

    const form = document.getElementById("student-form");
    const body = document.getElementById("students-body");
    const message = document.getElementById("message");
    const searchInput = document.getElementById("search");
    const filterDepartment = document.getElementById("filter-department");
    const filterStage = document.getElementById("filter-stage");

    const totalStudents = document.getElementById("total-students");
    const pageInfo = document.getElementById("page-info");
    const prevButton = document.getElementById("prev-page");
    const nextButton = document.getElementById("next-page");
    const saveButton = document.getElementById("save-button");
    const cancelButton = document.getElementById("cancel-button");

    if (!form || !body || !message) {
        console.error(
            "تأكد من وجود student-form و students-body و message في index.html"
        );
        return;
    }

    let editId = null;
    let page = 0;
    let total = 0;
    let debounceTimer;
    let latestLoad = 0;

    // إرسال طلب إلى FastAPI وقراءة الاستجابة والأخطاء.
    async function request(path, options = {}) {
        const headers = {
            ...(options.headers || {})
        };

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        let response;

        try {
            response = await fetch(path, {
                ...options,
                headers
            });
        } catch {
            throw new Error(
                "تعذر الاتصال بالخادم. تحقق من تشغيل FastAPI و MySQL"
            );
        }

        if (response.status === 204) {
            return null;
        }

        const responseText = await response.text();
        let data = null;

        if (responseText) {
            try {
                data = JSON.parse(responseText);
            } catch {
                data = responseText;
            }
        }

        if (!response.ok) {
            let detail =
                data && typeof data === "object" ? data.detail : null;

            if (Array.isArray(detail)) {
                detail = detail
                    .map((error) => {
                        const location = (error.loc || [])
                            .slice(1)
                            .join(".");

                        return `${location}: ${error.msg}`;
                    })
                    .join(" | ");
            }

            if (typeof detail !== "string" || !detail) {
                detail = `حدث خطأ من الخادم (${response.status})`;
            }

            throw new Error(detail);
        }

        return data;
    }

    // عرض رسالة نجاح أو خطأ.
    function showMessage(text, type = "success") {
        message.textContent = text;
        message.className = `message ${type}`;

        message.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    // إضافة خلية كنص آمن.
    function cell(row, text, className = "") {
        const td = document.createElement("td");

        td.textContent =
            text === null || text === undefined || text === ""
                ? "—"
                : String(text);

        if (className) {
            td.className = className;
        }

        row.appendChild(td);
        return td;
    }

    function buildButton(text, className, handler) {
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = text;
        button.className = `button small ${className}`;

        button.addEventListener("click", handler);

        return button;
    }

    // عرض الطلاب داخل الجدول.
    function renderStudents(students) {
        body.replaceChildren();

        if (students.length === 0) {
            const row = document.createElement("tr");

            cell(
                row,
                "لا توجد نتائج مطابقة للبحث",
                "empty-state"
            ).colSpan = 8;

            body.appendChild(row);
            return;
        }

        for (const student of students) {
            const row = document.createElement("tr");

            cell(row, student.id, "student-id");
            cell(row, student.student_number);
            cell(row, student.full_name);
            cell(row, student.department);
            cell(row, student.stage);
            cell(row, student.email);
            cell(row, student.phone);

            const buttons = document.createElement("td");
            buttons.className = "no-wrap";

            buttons.append(
                buildButton("تعديل", "muted", () => startEdit(student)),
                " ",
                buildButton("حذف", "danger", () => deleteStudent(student))
            );

            row.appendChild(buttons);
            body.appendChild(row);
        }
    }

    // تحميل الطلاب مع البحث والفلاتر.
    async function loadStudents() {
        const currentLoad = ++latestLoad;

        const params = new URLSearchParams({
            skip: String(page * PAGE_SIZE),
            limit: String(PAGE_SIZE)
        });

        if (searchInput && searchInput.value.trim()) {
            params.set("search", searchInput.value.trim());
        }

        if (filterDepartment && filterDepartment.value.trim()) {
            params.set("department", filterDepartment.value.trim());
        }

        if (filterStage && filterStage.value) {
            params.set("stage", filterStage.value);
        }

        try {
            const data = await request(`${API}?${params.toString()}`);

            if (currentLoad !== latestLoad) {
                return false;
            }

            const students = Array.isArray(data?.items)
                ? data.items
                : [];

            total = Number(data?.total ?? students.length);

            // العودة للصفحة السابقة إذا أصبحت الحالية فارغة.
            if (page > 0 && students.length === 0) {
                page = Math.min(
                    page - 1,
                    Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
                );

                return loadStudents();
            }

            renderStudents(students);

            if (totalStudents) {
                totalStudents.textContent = `${total} طالب`;
            }

            if (pageInfo) {
                pageInfo.textContent =
                    `الصفحة ${page + 1} من ${Math.max(
                        1,
                        Math.ceil(total / PAGE_SIZE)
                    )}`;
            }

            if (prevButton) {
                prevButton.disabled = page === 0;
            }

            if (nextButton) {
                nextButton.disabled =
                    (page + 1) * PAGE_SIZE >= total;
            }

            return true;
        } catch (error) {
            if (currentLoad !== latestLoad) {
                return false;
            }

            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "خطأ غير معروف";

            showMessage(
                `تعذر تحميل الطلاب: ${errorMessage}`,
                "error"
            );

            const row = document.createElement("tr");

            cell(
                row,
                "تعذر تحميل الطلاب، تحقق من تشغيل FastAPI و MySQL",
                "empty-state"
            ).colSpan = 8;

            body.replaceChildren(row);

            return false;
        }
    }

    // قراءة بيانات نموذج الإضافة والتعديل.
    function readForm() {
        const data = Object.fromEntries(
            new FormData(form).entries()
        );

        data.stage = Number(data.stage);
        data.email = String(data.email ?? "").trim() || null;
        data.phone = String(data.phone ?? "").trim() || null;

        return data;
    }

    // العودة من وضع التعديل إلى وضع الإضافة.
    function resetForm() {
        form.reset();
        editId = null;

        const formTitle = document.getElementById("form-title");

        if (formTitle) {
            formTitle.textContent = "إضافة طالب جديد";
        }

        if (saveButton) {
            saveButton.textContent = "+ إضافة الطالب";
        }

        if (cancelButton) {
            cancelButton.classList.add("hidden");
        }
    }

    // إضافة طالب POST أو تعديل كامل PUT.
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!form.reportValidity()) {
            return;
        }

        if (saveButton) {
            saveButton.disabled = true;
        }

        try {
            const editing = editId !== null;
            const url = editing
                ? `${API}/${editId}`
                : API;

            await request(url, {
                method: editing ? "PUT" : "POST",
                body: JSON.stringify(readForm())
            });

            resetForm();
            page = 0;

            const loaded = await loadStudents();

            if (loaded) {
                showMessage(
                    editing
                        ? "تم حفظ تعديل بيانات الطالب بنجاح."
                        : "تمت إضافة الطالب بنجاح."
                );
            }
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "خطأ غير معروف";

            showMessage(
                `تعذر حفظ الطالب: ${errorMessage}`,
                "error"
            );
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
            }
        }
    });

    // تجهيز النموذج لتعديل الطالب.
    function startEdit(student) {
        editId = student.id;

        const fields = [
            "student_number",
            "full_name",
            "department",
            "stage",
            "email",
            "phone"
        ];

        for (const name of fields) {
            const input = document.getElementById(name);

            if (input) {
                input.value = student[name] ?? "";
            }
        }

        const formTitle = document.getElementById("form-title");

        if (formTitle) {
            formTitle.textContent =
                `تعديل بيانات الطالب #${student.id}`;
        }

        if (saveButton) {
            saveButton.textContent = "حفظ التعديلات";
        }

        if (cancelButton) {
            cancelButton.classList.remove("hidden");
        }

        document
            .getElementById("form-section")
            ?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
    }

    // حذف طالب بعد التأكيد.
    async function deleteStudent(student) {
        const confirmed = window.confirm(
            `هل تريد حذف الطالب «${student.full_name}» نهائياً؟`
        );

        if (!confirmed) {
            return;
        }

        try {
            await request(`${API}/${student.id}`, {
                method: "DELETE"
            });

            if (editId === student.id) {
                resetForm();
            }

            const loaded = await loadStudents();

            if (loaded) {
                showMessage("تم حذف الطالب بنجاح.");
            }
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "خطأ غير معروف";

            showMessage(
                `تعذر حذف الطالب: ${errorMessage}`,
                "error"
            );
        }
    }

    // إعادة الصفحة الأولى عند تغيير البحث.
    function filtersChanged() {
        page = 0;
        loadStudents();
    }

    // تأخير البحث 300 مللي ثانية لتقليل الطلبات.
    for (const input of [searchInput, filterDepartment]) {
        if (!input) {
            continue;
        }

        input.addEventListener("input", () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(filtersChanged, 300);
        });
    }

    if (filterStage) {
        filterStage.addEventListener("change", filtersChanged);
    }

    // إلغاء التعديل.
    if (cancelButton) {
        cancelButton.addEventListener("click", (event) => {
            event.preventDefault();
            resetForm();
        });
    }

    // مسح الفلاتر.
    document
        .getElementById("clear-filters")
        ?.addEventListener("click", () => {
            clearTimeout(debounceTimer);

            if (searchInput) {
                searchInput.value = "";
            }

            if (filterDepartment) {
                filterDepartment.value = "";
            }

            if (filterStage) {
                filterStage.value = "";
            }

            filtersChanged();
        });

    // الصفحة السابقة.
    if (prevButton) {
        prevButton.addEventListener("click", () => {
            if (page > 0) {
                page -= 1;
                loadStudents();
            }
        });
    }

    // الصفحة التالية.
    if (nextButton) {
        nextButton.addEventListener("click", () => {
            if ((page + 1) * PAGE_SIZE < total) {
                page += 1;
                loadStudents();
            }
        });
    }

    // تحميل الطلاب عند فتح الصفحة.
    loadStudents();
}

// انتظار تحميل عناصر HTML قبل تشغيل الكود.
if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeStudentsPage
    );
} else {
    initializeStudentsPage();
}