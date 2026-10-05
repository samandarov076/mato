# Backend tasviri (prod): ko'p bosqichli — bog'liqliklar alohida qatlamda, kod o'zgarganda qayta o'rnatilmaydi.
# Ishga tushirish buyrug'i docker-compose.prod.yml da (uvicorn yoki arq). Root bo'lmagan `app` foydalanuvchisi.

FROM python:3.12-slim AS deps
RUN pip install --no-cache-dir uv
WORKDIR /build
COPY pyproject.toml ./
# Faqat bog'liqliklar (paketning o'zi emas): pyproject'dan ro'yxat olinadi, /venv ga o'rnatiladi
RUN uv venv /venv \
 && uv pip install --python /venv/bin/python --no-cache \
      $(python -c "import tomllib;print(' '.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))")

FROM python:3.12-slim
ENV PATH=/venv/bin:$PATH \
    PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
# UID 1000 qat'iy: zaxiradan tiklangan media fayllari shu egaga o'tkaziladi (deploy/backup/restore.sh)
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --home /app --shell /usr/sbin/nologin app \
 && mkdir -p /data/media && chown -R app:app /data
WORKDIR /app
COPY --from=deps /venv /venv
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app app ./app
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
