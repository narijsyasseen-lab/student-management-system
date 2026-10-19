from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


# الحصول على الوقت الحالي
def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# إنشاء جدول الطلاب
class Student(Base):

    # اسم الجدول داخل قاعدة البيانات
    __tablename__ = "students"

    # رقم الطالب التلقائي
    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    # الرقم الجامعي
    student_number: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        index=True
    )

    # الاسم الكامل
    full_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True
    )

    # القسم الدراسي
    department: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True
    )

    # المرحلة الدراسية
    stage: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    # البريد الإلكتروني
    email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    # رقم الهاتف
    phone: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    # تاريخ إضافة الطالب
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False
    )

    # تاريخ آخر تعديل
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )
