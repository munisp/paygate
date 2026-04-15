FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2, pyarrow, duckdb
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8125

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8125"]
