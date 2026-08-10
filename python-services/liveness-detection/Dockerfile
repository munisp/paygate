FROM python:3.11-slim

# System dependencies for OpenCV, MediaPipe, InsightFace
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1-mesa-glx \
    libgstreamer1.0-0 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download InsightFace models
RUN python -c "from insightface.app import FaceAnalysis; app = FaceAnalysis(name='buffalo_s', providers=['CPUExecutionProvider']); app.prepare(ctx_id=-1)" || true

# Pre-download MediaPipe models
RUN python -c "import mediapipe as mp; mp.solutions.face_mesh.FaceMesh()" || true

COPY . .

# Create model directory
RUN mkdir -p /models

EXPOSE 8013

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD wget -qO- http://localhost:8013/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8013", "--workers", "2", "--log-level", "info"]
