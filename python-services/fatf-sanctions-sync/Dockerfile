FROM python:3.12-slim

WORKDIR /app

# System deps for lxml and asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev libxml2-dev libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8600

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8600", "--workers", "2"]
