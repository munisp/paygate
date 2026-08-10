# ─── Stage 1: builder ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build
COPY requirements.txt .

# Install CPU-only TensorFlow + DeepFace; skip GPU packages to keep image small
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# Non-root user for security
RUN groupadd -r sidecar && useradd -r -g sidecar sidecar

WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY main.py .

# Pre-download DeepFace model weights at build time so the first request is fast
# (models are cached in ~/.deepface/weights)
RUN python -c "
try:
    from deepface import DeepFace
    # Warm up ArcFace and Facenet512 weights
    import numpy as np
    dummy = np.zeros((112, 112, 3), dtype=np.uint8)
    DeepFace.represent(img_path=dummy, model_name='ArcFace', enforce_detection=False)
    DeepFace.represent(img_path=dummy, model_name='Facenet512', enforce_detection=False)
    print('[deepface-sidecar] Model weights pre-loaded OK')
except Exception as e:
    print(f'[deepface-sidecar] Model pre-load skipped: {e}')
" || true

RUN chown -R sidecar:sidecar /app /root/.deepface 2>/dev/null || true
USER sidecar

EXPOSE 8001

ENV PORT=8001 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2", "--log-level", "info"]
