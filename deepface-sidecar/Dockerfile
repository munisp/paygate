# PayGate DeepFace Sidecar
# Build: docker build -t paygate-deepface-sidecar .
# Run:   docker run -p 5050:5050 --env-file .env paygate-deepface-sidecar

FROM python:3.11-slim

# System dependencies for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY main.py .

# Pre-download DeepFace models at build time to avoid cold-start latency.
# FAIL THE BUILD LOUDLY if model weights cannot be downloaded: shipping an
# image without weights previously resulted in a "healthy" container serving
# fabricated KYC results (mock mode). There is no `|| true` here on purpose.
RUN python -c "\
from deepface import DeepFace; \
import numpy as np; \
dummy = np.zeros((100,100,3), dtype=np.uint8); \
dummy[40:60,40:60] = 200; \
DeepFace.represent(img_path=dummy, model_name='ArcFace', detector_backend='opencv', enforce_detection=False); \
DeepFace.represent(img_path=dummy, model_name='Facenet512', detector_backend='opencv', enforce_detection=False); \
print('Models pre-loaded')"

EXPOSE 5050

ENV DEEPFACE_SIDECAR_PORT=5050
ENV DEEPFACE_LOG_LEVEL=INFO

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5050", "--workers", "2"]
