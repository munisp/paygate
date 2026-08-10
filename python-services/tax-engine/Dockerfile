FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
ENV PORT=9013
EXPOSE 9013
CMD ["gunicorn", "--bind", "0.0.0.0:9013", "--workers", "2", "--timeout", "30", "main:app"]
