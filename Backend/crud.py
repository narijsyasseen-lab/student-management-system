from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from .models import Student
from .schemas import StudentCreate
def get_student(db: Session, student_id: int) -> Student | None:
    #"قراءة طالب عن طريق رقمه الداخلي ID."""
    return db.get(Student, student_id)
def get_student_by_number(db: Session, student_number: str) -> Student | None:
    #"نستخدمها لمنع تكرار الرقم الطلابي."""
    return db.scalar(select(Student).where(Student.student_number == student_number))
def list_students(
    db: Session,
    search: str | None,
    department: str | None,
    stage: int | None,
    skip: int,
    limit: int,
) -> tuple[list[Student], int]:
    #"جلب الطلاب مع بحث وتصفية وصفحات؛ وتُرجع العدد الكلي أيضاً."""
    stmt = select(Student)
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Student.full_name.ilike(term), Student.student_number.ilike(term)))
    if department:
        stmt = stmt.where(Student.department.ilike(f"%{department.strip()}%"))
    if stage is not None:
        stmt = stmt.where(Student.stage == stage)
    # Subquery لحساب مجموع النتائج قبل تطبيق skip/limit.
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    students = db.scalars(stmt.order_by(Student.id.desc()).offset(skip).limit(limit)).all()
    return list(students), total
def create_student(db: Session, data: StudentCreate) -> Student:
    #"إضافة سجل ثم إرجاعه مع ID الذي ولّدته قاعدة البيانات."""
    student = Student(**data.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student
def update_student(db: Session, student: Student, changes: dict) -> Student:
    #"تعديل الحقول المرسلة فقط، ثم حفظ التغيير."""
    for name, value in changes.items():
        setattr(student, name, value)
    db.commit()
    db.refresh(student)
    return student
def delete_student(db: Session, student: Student) -> None:
    #"حذف سجل الطالب المحدد."""
    db.delete(student)
    db.commit()