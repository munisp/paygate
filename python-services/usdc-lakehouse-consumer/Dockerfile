FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn[standard]==0.30.6 \
    pydantic==2.8.2 \
    confluent-kafka==2.5.0 \
    boto3==1.35.0 \
    prometheus-client==0.21.0 \
    pyiceberg[s3]==0.7.1 \
    pyarrow==17.0.0

COPY main.py .

EXPOSE 8099

CMD ["python", "main.py"]
