FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
ENV PORT=9011
EXPOSE 9011
CMD ["gunicorn", "--bind", "0.0.0.0:9011", "--workers", "2", "--timeout", "30", "main:app"]
