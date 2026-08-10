# PayGate DeepFace Sidecar

A Python FastAPI microservice that wraps [DeepFace](https://github.com/serengil/deepface) to provide neural face verification, anti-spoofing liveness detection, duplicate identity search, and facial attribute analysis for the PayGate Merchant Portal KYC/KYB subsystem.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness probe |
| `POST` | `/liveness` | Anti-spoofing check (1–5 base64 frames) |
| `POST` | `/verify-face` | ArcFace selfie-vs-ID document verification |
| `POST` | `/register` | Register face embedding (on KYC approval) |
| `POST` | `/search` | Duplicate identity detection (Facenet512) |
| `POST` | `/analyze` | Age / gender / emotion analysis |

## Quick Start (Local)

```bash
# 1. Create a virtual environment
python3 -m venv venv && source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the sidecar
uvicorn main:app --host 0.0.0.0 --port 5050 --reload
```

The sidecar runs on `http://localhost:5050` by default. The Node.js server calls it via `DEEPFACE_SIDECAR_URL` (default: `http://localhost:5050`).

## Docker

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f deepface-sidecar

# Health check
curl http://localhost:5050/health
```

## Mock Mode

If `deepface` is not installed, the sidecar runs in **mock mode** — all endpoints return plausible synthetic responses. This allows the Node.js server to start and function without the Python dependency, with graceful fallback to heuristic scoring.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPFACE_SIDECAR_PORT` | `5050` | Port to listen on |
| `DEEPFACE_LOG_LEVEL` | `INFO` | Log verbosity |
| `DEEPFACE_DB_URL` | — | PostgreSQL connection string for pgvector embedding store |

## Integration with Node.js Server

The Node.js tRPC procedures call the sidecar via the `deepfaceSidecar` helper in `server/deepfaceSidecar.ts`. If the sidecar is unavailable (connection refused, timeout), the helper falls back to the existing heuristic scoring so the KYC flow is never blocked.

## Model Configuration

| Task | Model | Detector | Accuracy |
|------|-------|----------|----------|
| Selfie vs. ID doc | ArcFace | RetinaFace | 99.4% (LFW) |
| Duplicate detection | Facenet512 | RetinaFace | 99.6% (LFW) |
| Liveness | Built-in anti-spoof | YOLOv8n | — |
| Age estimation | VGG-Face backbone | OpenCV | ±4.65 MAE |

## Production Deployment

For production, deploy the sidecar on the Manus persistent VM (see `references/persistent-computing.md`). Set `DEEPFACE_SIDECAR_URL` in the Node.js server secrets to point to the VM's internal IP.

For persistent embedding storage, enable the pgvector backend by setting `DEEPFACE_DB_URL` and running the migration in `deepface-sidecar/migrations/001_face_embeddings.sql`.
