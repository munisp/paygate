FROM bitnami/spark:3.5.3

USER root

# Install delta-spark and boto3 for S3 access
RUN pip3 install --no-cache-dir \
    delta-spark==3.2.0 \
    pyspark==3.5.3 \
    boto3==1.35.0

WORKDIR /app
COPY compact.py /app/compact.py

ENV PYTHONUNBUFFERED=1

CMD ["python3", "/app/compact.py"]
