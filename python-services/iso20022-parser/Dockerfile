FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libxml2-dev libxslt-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
ENV PORT=9014
EXPOSE 9014
CMD ["gunicorn", "--bind", "0.0.0.0:9014", "--workers", "2", "--timeout", "30", "main:app"]
