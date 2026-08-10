FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 9053

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9053", "--workers", "2"]
