FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
ENV PORT=9010
EXPOSE 9010
CMD ["gunicorn", "--bind", "0.0.0.0:9010", "--workers", "2", "--timeout", "30", "main:app"]
