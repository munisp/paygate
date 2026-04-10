FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
ENV PORT=9012
EXPOSE 9012
CMD ["gunicorn", "--bind", "0.0.0.0:9012", "--workers", "2", "--timeout", "30", "main:app"]
