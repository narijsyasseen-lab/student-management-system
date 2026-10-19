import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
# نقرأ الإعدادات من .env الموجود بجانب ملف database.py.
load_dotenv(Path(__file__).resolve().parent / ".env")
# الاختيار الأساسي MySQL. متغير البيئة يسبق القيمة الموجودة في .env.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://student_user:student_pass@127.0.0.1:3306/student_management?charset=utf8mb4",
)
# SQLite يستخدم فقط في الاختبارات، وMySQL هو قاعدة المشروع المطلوبة.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
# الفئة الأساسية لجداول قاعدة البيانات
    pass


def get_db():
# فتح اتصال بقاعدة البيانات
   db = SessionLocal()
   try:
      yield db
   finally:
# إغلاق الاتصال بعد انتهاء الطلب
      db.close()