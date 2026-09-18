/**
 * seed-ai-tables.mjs — Seeds aiModelRegistry, aiAuditTrail, and gnnTrainingJobs
 */
import pg from 'pg';
const { Pool } = pg;

const rawUrl = process.env.DATABASE_URL ?? '';
const dbUrl = (rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://')) ? rawUrl : // NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
(process.env.PG_DATABASE_URL ?? 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev');
const pool = new Pool({ connectionString: dbUrl, ssl: false });

async function main() {
  const client = await pool.connect();
  try {
    console.log('[seed-ai-tables] Starting...');

    // 1. AI Model Registry
    const models = [
      {
        id: 'model-gnn-v3-2-1',
        name: 'GNN Fraud Detector v3',
        model_type: 'gnn_fraud',
        version: '3.2.1',
        status: 'active',
        accuracy: 0.943,
        precision: 0.921,
        recall: 0.967,
        f1_score: 0.943,
        auc_roc: 0.989,
        feature_count: 30,
        training_records: 2400000,
        artifact_path: 's3://paygate-models/gnn-fraud/v3.2.1/model.pt',
        hyperparameters: JSON.stringify({ hidden_dims: 256, layers: 4, dropout: 0.3, lr: 0.001, batch_size: 256 }),
        trained_by: 'system',
        trained_at: new Date('2026-04-18T10:00:00Z'),
        deployed_at: new Date('2026-04-18T12:00:00Z'),
        notes: 'Production GNN model with 4-layer GraphSAGE architecture. Trained on 2.4M transaction graph edges.',
      },
      {
        id: 'model-gnn-v2-8-0',
        name: 'GNN Fraud Detector v2',
        model_type: 'gnn_fraud',
        version: '2.8.0',
        status: 'archived',
        accuracy: 0.921,
        precision: 0.898,
        recall: 0.944,
        f1_score: 0.920,
        auc_roc: 0.975,
        feature_count: 28,
        training_records: 1800000,
        artifact_path: 's3://paygate-models/gnn-fraud/v2.8.0/model.pt',
        hyperparameters: JSON.stringify({ hidden_dims: 128, layers: 3, dropout: 0.2, lr: 0.001, batch_size: 128 }),
        trained_by: 'system',
        trained_at: new Date('2026-03-01T10:00:00Z'),
        deployed_at: new Date('2026-03-01T12:00:00Z'),
        archived_at: new Date('2026-04-18T12:00:00Z'),
        notes: 'Archived after v3 deployment. Retained for rollback capability.',
      },
      {
        id: 'model-credit-v1-4-2',
        name: 'Credit Scoring Model v1',
        model_type: 'credit_scoring',
        version: '1.4.2',
        status: 'active',
        accuracy: 0.887,
        precision: 0.871,
        recall: 0.903,
        f1_score: 0.887,
        auc_roc: 0.941,
        feature_count: 22,
        training_records: 950000,
        artifact_path: 's3://paygate-models/credit-scoring/v1.4.2/model.pkl',
        hyperparameters: JSON.stringify({ n_estimators: 500, max_depth: 8, learning_rate: 0.05, subsample: 0.8 }),
        trained_by: 'system',
        trained_at: new Date('2026-02-15T10:00:00Z'),
        deployed_at: new Date('2026-02-15T14:00:00Z'),
        notes: 'XGBoost credit scoring model. Uses bureau data + transaction history features.',
      },
      {
        id: 'model-anomaly-v1-1-0',
        name: 'Anomaly Detector v1',
        model_type: 'anomaly_detection',
        version: '1.1.0',
        status: 'active',
        accuracy: 0.912,
        precision: 0.889,
        recall: 0.937,
        f1_score: 0.912,
        auc_roc: 0.963,
        feature_count: 18,
        training_records: 1200000,
        artifact_path: 's3://paygate-models/anomaly/v1.1.0/model.pkl',
        hyperparameters: JSON.stringify({ contamination: 0.05, n_estimators: 200, max_samples: 256 }),
        trained_by: 'system',
        trained_at: new Date('2026-04-01T10:00:00Z'),
        deployed_at: new Date('2026-04-01T14:00:00Z'),
        notes: 'Isolation Forest for unsupervised anomaly detection on transaction velocity and amount patterns.',
      },
      {
        id: 'model-aml-v1-0-0',
        name: 'AML Detection Model v1',
        model_type: 'aml_detection',
        version: '1.0.0',
        status: 'active',
        accuracy: 0.934,
        precision: 0.918,
        recall: 0.951,
        f1_score: 0.934,
        auc_roc: 0.978,
        feature_count: 35,
        training_records: 750000,
        artifact_path: 's3://paygate-models/aml/v1.0.0/model.pt',
        hyperparameters: JSON.stringify({ hidden_dims: 512, layers: 5, dropout: 0.4, lr: 0.0005 }),
        trained_by: 'system',
        trained_at: new Date('2026-03-20T10:00:00Z'),
        deployed_at: new Date('2026-03-20T14:00:00Z'),
        notes: 'Deep learning AML model. Detects structuring, layering, and integration patterns.',
      },
    ];

    for (const m of models) {
      await client.query(`
        INSERT INTO ai_model_registry (id, name, model_type, version, status, accuracy, precision, recall, f1_score, auc_roc, feature_count, training_records, artifact_path, hyperparameters, trained_by, trained_at, deployed_at, archived_at, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (id) DO NOTHING
      `, [m.id, m.name, m.model_type, m.version, m.status, m.accuracy, m.precision, m.recall, m.f1_score, m.auc_roc, m.feature_count, m.training_records, m.artifact_path, m.hyperparameters, m.trained_by, m.trained_at, m.deployed_at, m.archived_at ?? null, m.notes]);
    }
    console.log(`[seed-ai-tables] Inserted ${models.length} model registry entries`);

    // 2. AI Audit Trail — 60 realistic decision records
    const decisions = ['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE', 'APPROVE', 'REVIEW', 'REVIEW', 'BLOCK', 'FLAG'];
    const tools = ['Qdrant Similarity', 'FalkorDB Graph', 'ART Reasoning', 'Ollama LLM', 'EPR-KGQA'];
    const explanations = [
      'Known merchant pattern, device fingerprint matches 18-month history',
      'Low-risk corridor, amount within 2σ of customer baseline',
      'Card present transaction, EMV chip verified, no velocity flags',
      'Unusual velocity: 12 transactions in 3 minutes from new device',
      'Cross-border anomaly: first transaction to high-risk corridor',
      'Fraud ring detected: 3 shared devices with 8 flagged merchants',
      'AML pattern: structuring detected across 5 accounts in 24h',
      'Card-not-present with mismatched billing address and high-value item',
      'New account with immediate high-value transaction — manual review required',
    ];
    const merchants_sample = ['mer_001', 'mer_002', 'mer_003', 'mer_004', 'mer_005'];
    const modelIds = ['model-gnn-v3-2-1', 'model-anomaly-v1-1-0', 'model-aml-v1-0-0'];

    for (let i = 0; i < 60; i++) {
      const decision = decisions[Math.floor(Math.random() * decisions.length)];
      const confidence = decision === 'APPROVE' ? 0.85 + Math.random() * 0.14 :
                         decision === 'BLOCK' ? 0.88 + Math.random() * 0.11 :
                         0.55 + Math.random() * 0.3;
      const artSteps = decision === 'BLOCK' ? 4 + Math.floor(Math.random() * 5) :
                       decision === 'REVIEW' ? 3 + Math.floor(Math.random() * 3) : null;
      const usedTools = [tools[0]];
      if (Math.random() > 0.7) usedTools.push(tools[1]);
      if (artSteps) { usedTools.push(tools[2]); usedTools.push(tools[3]); }
      if (Math.random() > 0.85) usedTools.push(tools[4]);
      const createdAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);

      await client.query(`
        INSERT INTO ai_audit_trail (id, transaction_id, merchant_id, model_id, decision, confidence, risk_score, explanation, latency_ms, tools_used, art_steps, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO NOTHING
      `, [
        `audit-${Date.now()}-${i}`,
        `txn_${Math.random().toString(36).slice(2, 8)}`,
        merchants_sample[Math.floor(Math.random() * merchants_sample.length)],
        modelIds[Math.floor(Math.random() * modelIds.length)],
        decision,
        Math.round(confidence * 1000) / 1000,
        Math.round((1 - confidence + Math.random() * 0.1) * 1000) / 1000,
        explanations[Math.floor(Math.random() * explanations.length)],
        100 + Math.floor(Math.random() * 2000),
        JSON.stringify(usedTools),
        artSteps,
        createdAt,
      ]);
    }
    console.log('[seed-ai-tables] Inserted 60 AI audit trail records');

    // 3. GNN Training Jobs
    const jobs = [
      {
        id: 'job-gnn-001',
        model_type: 'gnn_fraud',
        status: 'completed',
        epochs: 50,
        hidden_dims: 256,
        learning_rate: 0.001,
        batch_size: 256,
        current_epoch: 50,
        train_loss: 0.0423,
        val_loss: 0.0487,
        best_accuracy: 0.943,
        dataset_size: 2400000,
        artifact_path: 's3://paygate-models/gnn-fraud/v3.2.1/model.pt',
        triggered_by: 'admin',
        started_at: new Date('2026-04-18T08:00:00Z'),
        completed_at: new Date('2026-04-18T10:00:00Z'),
      },
      {
        id: 'job-gnn-002',
        model_type: 'gnn_fraud',
        status: 'completed',
        epochs: 50,
        hidden_dims: 128,
        learning_rate: 0.001,
        batch_size: 128,
        current_epoch: 50,
        train_loss: 0.0612,
        val_loss: 0.0689,
        best_accuracy: 0.921,
        dataset_size: 1800000,
        artifact_path: 's3://paygate-models/gnn-fraud/v2.8.0/model.pt',
        triggered_by: 'system',
        started_at: new Date('2026-03-01T08:00:00Z'),
        completed_at: new Date('2026-03-01T10:00:00Z'),
      },
      {
        id: 'job-credit-001',
        model_type: 'credit_scoring',
        status: 'completed',
        epochs: 100,
        hidden_dims: 256,
        learning_rate: 0.0005,
        batch_size: 512,
        current_epoch: 100,
        train_loss: 0.0891,
        val_loss: 0.0934,
        best_accuracy: 0.887,
        dataset_size: 950000,
        artifact_path: 's3://paygate-models/credit-scoring/v1.4.2/model.pkl',
        triggered_by: 'admin',
        started_at: new Date('2026-02-15T08:00:00Z'),
        completed_at: new Date('2026-02-15T10:00:00Z'),
      },
      {
        id: 'job-anomaly-001',
        model_type: 'anomaly_detection',
        status: 'completed',
        epochs: 30,
        hidden_dims: 128,
        learning_rate: 0.002,
        batch_size: 256,
        current_epoch: 30,
        train_loss: 0.0534,
        val_loss: 0.0578,
        best_accuracy: 0.912,
        dataset_size: 1200000,
        artifact_path: 's3://paygate-models/anomaly/v1.1.0/model.pkl',
        triggered_by: 'system',
        started_at: new Date('2026-04-01T08:00:00Z'),
        completed_at: new Date('2026-04-01T10:00:00Z'),
      },
      {
        id: 'job-gnn-003',
        model_type: 'gnn_fraud',
        status: 'queued',
        epochs: 50,
        hidden_dims: 512,
        learning_rate: 0.0005,
        batch_size: 256,
        current_epoch: 0,
        train_loss: null,
        val_loss: null,
        best_accuracy: null,
        dataset_size: null,
        artifact_path: null,
        triggered_by: 'admin',
        started_at: null,
        completed_at: null,
      },
    ];

    for (const j of jobs) {
      await client.query(`
        INSERT INTO gnn_training_jobs (id, model_type, status, epochs, hidden_dims, learning_rate, batch_size, current_epoch, train_loss, val_loss, best_accuracy, dataset_size, artifact_path, triggered_by, started_at, completed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO NOTHING
      `, [j.id, j.model_type, j.status, j.epochs, j.hidden_dims, j.learning_rate, j.batch_size, j.current_epoch, j.train_loss, j.val_loss, j.best_accuracy, j.dataset_size, j.artifact_path, j.triggered_by, j.started_at, j.completed_at]);
    }
    console.log(`[seed-ai-tables] Inserted ${jobs.length} GNN training job records`);

    console.log('[seed-ai-tables] Done!');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
