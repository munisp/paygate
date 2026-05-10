-- =============================================================================
-- Wave 123 Seed Data
-- Seeds: ai_model_registry, ai_audit_trail, gnn_training_jobs,
--        menu_categories, menu_items
-- =============================================================================
-- Prerequisites: seed-wave32-all-tables.sql must have been run first
--   (provides users 9001/9002/9003 and merchant_profiles)
-- =============================================================================

-- ─── AI Model Registry ────────────────────────────────────────────────────────
INSERT INTO ai_model_registry (
  id, name, model_type, version, status,
  accuracy, precision, recall, f1_score, auc_roc,
  feature_count, training_records,
  artifact_path, hyperparameters,
  trained_by, trained_at, deployed_at, notes, created_at
) VALUES
  (
    'model_gnn_fraud_v3_2',
    'GNN Fraud Detector v3.2',
    'gnn_fraud',
    '3.2.0',
    'deployed',
    0.9712, 0.9634, 0.9789, 0.9711, 0.9923,
    128, 4500000,
    's3://paygate-models/gnn_fraud/v3.2.0/model.pt',
    '{"hidden_dims":256,"num_layers":4,"dropout":0.3,"lr":0.001,"epochs":100}',
    'ml-pipeline@paygate.io',
    NOW() - INTERVAL '14 days',
    NOW() - INTERVAL '7 days',
    'Production GNN model for real-time fraud scoring. Replaces v3.1.0.',
    NOW() - INTERVAL '14 days'
  ),
  (
    'model_gnn_fraud_v3_1',
    'GNN Fraud Detector v3.1',
    'gnn_fraud',
    '3.1.0',
    'archived',
    0.9645, 0.9571, 0.9718, 0.9644, 0.9891,
    120, 4000000,
    's3://paygate-models/gnn_fraud/v3.1.0/model.pt',
    '{"hidden_dims":256,"num_layers":3,"dropout":0.3,"lr":0.001,"epochs":80}',
    'ml-pipeline@paygate.io',
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '38 days',
    'Previous production model. Archived after v3.2.0 deployment.',
    NOW() - INTERVAL '45 days'
  ),
  (
    'model_risk_scorer_v2_0',
    'Risk Scorer v2.0',
    'risk_scorer',
    '2.0.0',
    'deployed',
    0.9423, 0.9312, 0.9534, 0.9422, 0.9756,
    64, 2800000,
    's3://paygate-models/risk_scorer/v2.0.0/model.pkl',
    '{"n_estimators":500,"max_depth":8,"min_samples_leaf":50,"learning_rate":0.05}',
    'ml-pipeline@paygate.io',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '25 days',
    'XGBoost risk scorer for merchant-level risk assessment.',
    NOW() - INTERVAL '30 days'
  ),
  (
    'model_kyc_classifier_v1_5',
    'KYC Document Classifier v1.5',
    'kyc_classifier',
    '1.5.0',
    'training',
    NULL, NULL, NULL, NULL, NULL,
    32, NULL,
    NULL,
    '{"backbone":"efficientnet_b3","img_size":384,"epochs":50,"lr":0.0001}',
    'ml-pipeline@paygate.io',
    NULL, NULL,
    'Training on expanded KYC document dataset. ETA: 3 days.',
    NOW() - INTERVAL '2 days'
  ),
  (
    'model_churn_predictor_v1_0',
    'Merchant Churn Predictor v1.0',
    'churn_predictor',
    '1.0.0',
    'staging',
    0.8934, 0.8812, 0.9056, 0.8933, 0.9412,
    45, 150000,
    's3://paygate-models/churn_predictor/v1.0.0/model.pkl',
    '{"algorithm":"lightgbm","num_leaves":63,"max_depth":7,"learning_rate":0.05}',
    'ml-pipeline@paygate.io',
    NOW() - INTERVAL '5 days',
    NULL,
    'Predicts merchant churn 30 days ahead. Pending A/B test approval.',
    NOW() - INTERVAL '5 days'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── AI Audit Trail ───────────────────────────────────────────────────────────
INSERT INTO ai_audit_trail (
  id, transaction_id, merchant_id, model_id,
  decision, confidence, risk_score,
  features, explanation, latency_ms,
  created_at
) VALUES
  (
    'audit_001',
    'txn_paygate_001',
    '9001',
    'model_gnn_fraud_v3_2',
    'APPROVE',
    0.9823,
    0.0177,
    '{"amount_zscore":0.3,"velocity_1h":2,"device_age_days":180,"ip_reputation":0.95}',
    'Low risk: known device, normal velocity, trusted IP range',
    42,
    NOW() - INTERVAL '2 hours'
  ),
  (
    'audit_002',
    'txn_paygate_002',
    '9001',
    'model_gnn_fraud_v3_2',
    'REVIEW',
    0.7234,
    0.2766,
    '{"amount_zscore":2.1,"velocity_1h":8,"device_age_days":1,"ip_reputation":0.72}',
    'Medium risk: new device, elevated velocity. Manual review recommended.',
    55,
    NOW() - INTERVAL '90 minutes'
  ),
  (
    'audit_003',
    'txn_paygate_003',
    '9002',
    'model_gnn_fraud_v3_2',
    'BLOCK',
    0.9567,
    0.9567,
    '{"amount_zscore":4.5,"velocity_1h":25,"device_age_days":0,"ip_reputation":0.12}',
    'High risk: new device, extreme velocity, suspicious IP. Transaction blocked.',
    38,
    NOW() - INTERVAL '45 minutes'
  ),
  (
    'audit_004',
    'txn_paygate_004',
    '9002',
    'model_risk_scorer_v2_0',
    'APPROVE',
    0.9145,
    0.0855,
    '{"merchant_age_days":365,"monthly_volume_usd":45000,"dispute_rate":0.002}',
    'Established merchant with good standing. Low risk.',
    28,
    NOW() - INTERVAL '30 minutes'
  ),
  (
    'audit_005',
    'txn_paygate_005',
    '9001',
    'model_gnn_fraud_v3_2',
    'FLAG',
    0.8123,
    0.5432,
    '{"amount_zscore":1.8,"velocity_1h":6,"device_age_days":3,"ip_reputation":0.65}',
    'Borderline risk: slightly elevated amount and velocity. Flagged for monitoring.',
    47,
    NOW() - INTERVAL '15 minutes'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── GNN Training Jobs ────────────────────────────────────────────────────────
INSERT INTO gnn_training_jobs (
  id, model_type, status,
  epochs, hidden_dims, learning_rate, batch_size,
  current_epoch, train_loss, val_loss, best_accuracy,
  dataset_size, artifact_path,
  triggered_by, started_at, completed_at,
  created_at, updated_at
) VALUES
  (
    'job_gnn_001',
    'gnn_fraud',
    'completed',
    100, 256, 0.001, 256,
    100, 0.0312, 0.0389, 0.9712,
    4500000,
    's3://paygate-models/gnn_fraud/v3.2.0/model.pt',
    'ml-pipeline@paygate.io',
    NOW() - INTERVAL '16 days',
    NOW() - INTERVAL '14 days',
    NOW() - INTERVAL '16 days',
    NOW() - INTERVAL '14 days'
  ),
  (
    'job_gnn_002',
    'gnn_fraud',
    'completed',
    80, 256, 0.001, 256,
    80, 0.0421, 0.0498, 0.9645,
    4000000,
    's3://paygate-models/gnn_fraud/v3.1.0/model.pt',
    'ml-pipeline@paygate.io',
    NOW() - INTERVAL '47 days',
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '47 days',
    NOW() - INTERVAL '45 days'
  ),
  (
    'job_kyc_001',
    'kyc_classifier',
    'running',
    50, 128, 0.0001, 32,
    23, 0.1823, 0.2134, NULL,
    NULL, NULL,
    'ml-pipeline@paygate.io',
    NOW() - INTERVAL '2 days',
    NULL,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 hour'
  ),
  (
    'job_gnn_003',
    'gnn_fraud',
    'queued',
    120, 512, 0.0005, 512,
    0, NULL, NULL, NULL,
    NULL, NULL,
    'ml-pipeline@paygate.io',
    NULL, NULL,
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes'
  ),
  (
    'job_gnn_004',
    'gnn_fraud',
    'failed',
    100, 256, 0.001, 256,
    12, 0.4512, 0.5123, NULL,
    NULL, NULL,
    'ml-pipeline@paygate.io',
    NOW() - INTERVAL '20 days',
    NULL,
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '19 days'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Menu Categories ──────────────────────────────────────────────────────────
INSERT INTO menu_categories (id, merchant_id, name, display_order, created_at) VALUES
  ('mcat_9001_001', '9001', 'Starters',      1, NOW() - INTERVAL '30 days'),
  ('mcat_9001_002', '9001', 'Main Course',   2, NOW() - INTERVAL '30 days'),
  ('mcat_9001_003', '9001', 'Desserts',      3, NOW() - INTERVAL '30 days'),
  ('mcat_9001_004', '9001', 'Beverages',     4, NOW() - INTERVAL '30 days'),
  ('mcat_9001_005', '9001', 'Special Offers',5, NOW() - INTERVAL '7 days'),
  ('mcat_9002_001', '9002', 'Electronics',   1, NOW() - INTERVAL '60 days'),
  ('mcat_9002_002', '9002', 'Accessories',   2, NOW() - INTERVAL '60 days'),
  ('mcat_9002_003', '9002', 'Software',      3, NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Menu Items ───────────────────────────────────────────────────────────────
INSERT INTO menu_items (id, category_id, merchant_id, name, description, price_kobo, available, image_url, created_at) VALUES
  -- Alice Ventures (9001) — Restaurant menu
  ('mitm_9001_001', 'mcat_9001_001', '9001', 'Puff Puff',
   'Deep-fried dough balls, lightly sweetened', 150000, true,
   'https://cdn.paygate.io/menu/puff-puff.jpg', NOW() - INTERVAL '30 days'),
  ('mitm_9001_002', 'mcat_9001_001', '9001', 'Suya Skewers',
   'Spiced grilled beef skewers with peanut sauce', 350000, true,
   'https://cdn.paygate.io/menu/suya.jpg', NOW() - INTERVAL '30 days'),
  ('mitm_9001_003', 'mcat_9001_001', '9001', 'Moi Moi',
   'Steamed bean pudding with eggs and fish', 250000, true,
   NULL, NOW() - INTERVAL '30 days'),
  ('mitm_9001_004', 'mcat_9001_002', '9001', 'Jollof Rice + Chicken',
   'Party-style jollof rice with grilled chicken and plantain', 750000, true,
   'https://cdn.paygate.io/menu/jollof.jpg', NOW() - INTERVAL '30 days'),
  ('mitm_9001_005', 'mcat_9001_002', '9001', 'Egusi Soup + Eba',
   'Rich egusi soup with assorted meat, served with eba', 850000, true,
   NULL, NOW() - INTERVAL '30 days'),
  ('mitm_9001_006', 'mcat_9001_002', '9001', 'Pepper Soup',
   'Spicy catfish pepper soup with yam', 950000, true,
   'https://cdn.paygate.io/menu/pepper-soup.jpg', NOW() - INTERVAL '30 days'),
  ('mitm_9001_007', 'mcat_9001_003', '9001', 'Chin Chin',
   'Crispy fried snack, lightly sweetened', 200000, true,
   NULL, NOW() - INTERVAL '30 days'),
  ('mitm_9001_008', 'mcat_9001_003', '9001', 'Coconut Candy',
   'Traditional coconut sweets', 100000, false,
   NULL, NOW() - INTERVAL '30 days'),
  ('mitm_9001_009', 'mcat_9001_004', '9001', 'Zobo Drink',
   'Chilled hibiscus flower drink', 150000, true,
   NULL, NOW() - INTERVAL '30 days'),
  ('mitm_9001_010', 'mcat_9001_004', '9001', 'Kunu',
   'Fermented millet drink, lightly spiced', 120000, true,
   NULL, NOW() - INTERVAL '30 days'),
  ('mitm_9001_011', 'mcat_9001_005', '9001', 'Combo Meal Deal',
   'Jollof Rice + Chicken + Zobo Drink — Save 15%', 850000, true,
   NULL, NOW() - INTERVAL '7 days'),
  -- Bob Commerce (9002) — Electronics store
  ('mitm_9002_001', 'mcat_9002_001', '9002', 'Wireless Earbuds Pro',
   'Active noise cancellation, 30h battery life', 4500000, true,
   'https://cdn.paygate.io/menu/earbuds.jpg', NOW() - INTERVAL '60 days'),
  ('mitm_9002_002', 'mcat_9002_001', '9002', 'Smart Watch Series 5',
   'Health tracking, GPS, waterproof', 12000000, true,
   'https://cdn.paygate.io/menu/smartwatch.jpg', NOW() - INTERVAL '60 days'),
  ('mitm_9002_003', 'mcat_9002_001', '9002', 'Portable Power Bank 20000mAh',
   'Fast charge, dual USB-C, LED indicator', 2500000, true,
   NULL, NOW() - INTERVAL '60 days'),
  ('mitm_9002_004', 'mcat_9002_002', '9002', 'Phone Case (Universal)',
   'Shock-absorbing silicone, fits most phones', 350000, true,
   NULL, NOW() - INTERVAL '60 days'),
  ('mitm_9002_005', 'mcat_9002_002', '9002', 'USB-C Cable 2m',
   'Braided nylon, 100W fast charge', 250000, true,
   NULL, NOW() - INTERVAL '60 days'),
  ('mitm_9002_006', 'mcat_9002_003', '9002', 'Antivirus 1-Year License',
   'Covers 3 devices, auto-renewal', 1500000, true,
   NULL, NOW() - INTERVAL '60 days'),
  ('mitm_9002_007', 'mcat_9002_003', '9002', 'VPN Premium 6-Month',
   'Unlimited bandwidth, 50+ countries', 2000000, false,
   NULL, NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Verification ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  model_count   INT;
  audit_count   INT;
  job_count     INT;
  cat_count     INT;
  item_count    INT;
BEGIN
  SELECT COUNT(*) INTO model_count FROM ai_model_registry WHERE id LIKE 'model_%';
  SELECT COUNT(*) INTO audit_count FROM ai_audit_trail WHERE id LIKE 'audit_%';
  SELECT COUNT(*) INTO job_count   FROM gnn_training_jobs WHERE id LIKE 'job_%';
  SELECT COUNT(*) INTO cat_count   FROM menu_categories WHERE id LIKE 'mcat_%';
  SELECT COUNT(*) INTO item_count  FROM menu_items WHERE id LIKE 'mitm_%';

  RAISE NOTICE 'Wave 123 Seed Summary:';
  RAISE NOTICE '  ai_model_registry:  % rows', model_count;
  RAISE NOTICE '  ai_audit_trail:     % rows', audit_count;
  RAISE NOTICE '  gnn_training_jobs:  % rows', job_count;
  RAISE NOTICE '  menu_categories:    % rows', cat_count;
  RAISE NOTICE '  menu_items:         % rows', item_count;
END $$;
