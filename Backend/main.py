from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from . import crud, models
from .database import Base, engine, get_db
from .schemas import StudentCreate, StudentList, StudentRead, StudentUpdate
ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
@asynccontextmanager
async def lifespan(app: FastAPI):
# إنشاء جدول students تلقائياً إذا لم يكن موجوداً؛ قاعدة MySQL نفسها يجب إنشاؤها مسبقاً.
    Base.metadata.create_all(bind=engine)
    yield
app = FastAPI(
title="Student Management API | نظام إدارة بيانات الطلاب",
description="واجهة REST API لإضافة الطلاب وعرضهم والبحث والتعديل والحذف.",
version="1.0.0",
lifespan=lifespan,
)
# نفس الخادم يقدم ملفات CSS وJavaScript، لذا لا حاجة لإعداد CORS منفصل.
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/", include_in_schema=False)
def home():
#"فتح واجهة HTML عند زيارة الرابط الأساسي."""
    return FileResponse(FRONTEND / "index.html")


@app.get("/health", tags=["System"])
def health():
#"فحص بسيط لتأكد عمل خادم FastAPI."""
    return {"status": "ok"}


def require_student(db: Session, student_id: int) -> models.Student:
    student = crud.get_student(db, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
        return student


def prevent_duplicate_number(db: Session, student_number: str, current_id: int | None = None):
#"منع الرقم الجامعي المتكرر عند الإضافة أو التحديث."""
    existing = crud.get_student_by_number(db, student_number)
    if existing and existing.id!= current_id:
        raise HTTPException(status_code=409, detail="الرقم الجامعي مستخدم لطالب آخر")


def save_or_conflict(db: Session, action):
#"معالجة خطأ UNIQUE الذي قد يظهر من MySQL عند الطلبات المتزامنة."""
    try:
        return action()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="تعارض في البيانات: قد يكون الرقم الجامعي مكرراً") from None


@app.post("/api/students", response_model=StudentRead, status_code=status.HTTP_201_CREATED, tags=["Students"])
def add_student(data: StudentCreate, db: Session = Depends(get_db)):
#Create: إضافة طالب جديد."""
    prevent_duplicate_number(db, data.student_number)
    return save_or_conflict(db, lambda: crud.create_student(db, data))


@app.get("/api/students", response_model=StudentList, tags=["Students"])
def read_students(
    search: str | None = Query(default=None, max_length=100, description="الاسم أو الرقم الجامعي"),
    department: str | None = Query(default=None, max_length=100),
    stage: int | None = Query(default=None, ge=1, le=6),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
#Read: عرض القائمة مع البحث والتصفية والتنقل بين الصفحات."""
    items, total = crud.list_students(db, search, department, stage, skip, limit)
    return StudentList(items=items, total=total, skip=skip, limit=limit)


@app.get("/api/students/{student_id}", response_model=StudentRead, tags=["Students"])
def read_student(student_id: int, db: Session = Depends(get_db)):
#Read: عرض طالب واحد بواسطة ID."""
     return require_student(db, student_id)


@app.put("/api/students/{student_id}", response_model=StudentRead, tags=["Students"])
def replace_student(student_id: int, data: StudentCreate, db: Session = Depends(get_db)):
#Update (PUT): استبدال بيانات الطالب كاملة."""
    student = require_student(db, student_id)
    prevent_duplicate_number(db, data.student_number, student_id)
    return save_or_conflict(db, lambda: crud.update_student(db, student, data.model_dump()))

@app.patch("/api/students/{student_id}", response_model=StudentRead, tags=["Students"])
def edit_student(student_id: int, data: StudentUpdate, db: Session = Depends(get_db)):
#Update (PATCH): تعديل حقل أو عدة حقول فقط."""
     student = require_student(db, student_id)
     changes = data.model_dump(exclude_unset=True)
# لا يجوز مسح أي حقل مطلوب في MySQL.
     for field in ("student_number", "full_name", "department", "stage"):
           if field in changes and changes[field] is None:
                raise HTTPException(status_code=422, detail=f"الحقل {field} لا يمكن تركه فارغاً")
                if "student_number" in changes:
                    prevent_duplicate_number(db, changes["student_number"], student_id)
     return save_or_conflict(db, lambda: crud.update_student(db, student, changes))


@app.delete("/api/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Students"])
def remove_student(student_id: int, db: Session = Depends(get_db)):
#Delete: حذف الطالب وإرجاع 204 في حال النجاح."""
    student = require_student(db, student_id)
    crud.delete_student(db, student)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
