from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
class StudentCreate(BaseModel):
    #"البيانات المطلوبة لإضافة طالب؛ تُستخدم أيضاً مع PUT الكامل."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    # الرقم الطلابي يقبل الإنجليزية والأرقام والشرطة فقط ويجب أن يكون فريداً.
    student_number: str = Field(min_length=3, max_length=20, pattern=r"^[A-Za-z0-9_-]+$", examples=["ST2026001"])
    full_name: str = Field(min_length=3, max_length=100, examples=["أحمد محمد علي"])
    department: str = Field(min_length=2, max_length=100, examples=["علوم الحاسوب"])
    stage: int = Field(ge=1, le=6, examples=[2])
    email: EmailStr | None = Field(default=None, examples=["ahmad@example.com"])
    phone: str | None = Field(default=None, min_length=7, max_length=20, pattern=r"^[0-9+ -]+$", examples=["07701234567"])
class StudentUpdate(BaseModel):
    #"لـ PATCH: كل الحقول اختيارية، ولكن يجب إرسال حقل واحد على الأقل."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    student_number: str | None = Field(default=None, min_length=3, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    full_name: str | None = Field(default=None, min_length=3, max_length=100)
    department: str | None = Field(default=None, min_length=2, max_length=100)
    stage: int | None = Field(default=None, ge=1, le=6)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=7, max_length=20, pattern=r"^[0-9+ -]+$")

    @model_validator(mode="after")
    def reject_empty_patch(self):
        if not self.model_fields_set:
            raise ValueError("أرسل حقلاً واحداً على الأقل للتعديل")
        return self


class StudentRead(StudentCreate):
    #"الحقول التي ترجع من الخادم بعد قراءة سجل الطالب."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class StudentList(BaseModel):
    #"نتيجة البحث: البيانات مع العدد الكلي ومعلومات الصفحات."""

    items: list[StudentRead]
    total: int
    skip: int