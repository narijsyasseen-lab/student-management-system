from datetime import datetime
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    model_validator
)


# البيانات المطلوبة لإضافة طالب أو تعديله بالكامل
class StudentCreate(BaseModel):

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid"
    )

    student_number: str = Field(
        min_length=3,
        max_length=20,
        pattern=r"^[A-Za-z0-9_-]+$",
        examples=["ST2026001"]
    )

    full_name: str = Field(
        min_length=3,
        max_length=100
    )

    department: str = Field(
        min_length=2,
        max_length=100
    ) 
    stage: int = Field(
        ge=1,
        le=6
    )
    # المعدل من صفر إلى أربعة
    gpa: float | None = Field(
        default=None,
        ge=0.0,
        le=4.0
    )
   # الحالة الدراسية
    status: str = Field(
        default="مستمر",
        min_length=1,
        max_length=30
    )

    email: EmailStr | None = None

    phone: str | None = Field(
        default=None,
        min_length=7,
        max_length=20,
        pattern=r"^[0-9+ -]+$"
    )


# تعديل بيانات طالب باستخدام PATCH
class StudentUpdate(BaseModel):

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid"
    )

    student_number: str | None = Field(
        default=None,
        min_length=3,
        max_length=20,
        pattern=r"^[A-Za-z0-9_-]+$"
    )

    full_name: str | None = Field(
        default=None,
        min_length=3,
        max_length=100
    )

    department: str | None = Field(
        default=None,
        min_length=2,
        max_length=100
    )

    stage: int | None = Field(
        default=None,
        ge=1,
        le=6
    )

    gpa: float | None = Field(
        default=None,
        ge=0,
        le=4
    )

    status: str | None = Field(
        default=None,
        min_length=1,
        max_length=30
    )

    email: EmailStr | None = None

    phone: str | None = Field(
        default=None,
        min_length=7,
        max_length=20,
        pattern=r"^[0-9+ -]+$"
    )

    @model_validator(mode="after")
    def reject_empty_patch(self):

        if not self.model_fields_set:
            raise ValueError(
                "أرسل حقلاً واحداً على الأقل للتعديل"
            )

        if (
            "status" in self.model_fields_set
            and self.status is None
        ):
            raise ValueError(
                "الحالة الدراسية لا يمكن أن تكون فارغة"
            )

        return self


# البيانات التي يرجعها FastAPI
class StudentRead(StudentCreate):

    model_config = ConfigDict(
        from_attributes=True
    )

    id: int
    created_at: datetime
    updated_at: datetime


# قائمة الطلاب
class StudentList(BaseModel):

    items: list[StudentRead]
    total: int
    skip: int
