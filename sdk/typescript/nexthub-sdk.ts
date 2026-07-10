/**
 * NextHub TypeScript SDK
 * For 3rd-party fintech, healthcare, insurance, government, and banking apps.
 *
 * Installation (when published):
 *   npm install @nexthub/sdk
 *   yarn add @nexthub/sdk
 *
 * Quick Start:
 *   import { NextHubClient } from '@nexthub/sdk';
 *   const client = new NextHubClient({ apiKey: 'YOUR_API_KEY', baseUrl: 'https://api.nexthub.io' });
 *   const claim = await client.healthcare.submitClaim({ ... });
 */

// ── Core Types ────────────────────────────────────────────────────────────────

export interface NextHubConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number;       // ms, default 30000
  retries?: number;       // default 3
  webhookSecret?: string; // For verifying incoming webhook signatures
}

export interface NextHubResponse<T> {
  data: T;
  requestId: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── Domain: Healthcare (FHIR R4 + NHIA) ──────────────────────────────────────

export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  identifier: Array<{ system: string; value: string }>;
  name: Array<{ family: string; given: string[] }>;
  birthDate: string;
  gender: 'male' | 'female' | 'other' | 'unknown';
}

export interface FHIRClaim {
  resourceType: 'Claim';
  id: string;
  status: 'active' | 'cancelled' | 'draft' | 'entered-in-error';
  type: { coding: Array<{ system: string; code: string; display: string }> };
  use: 'claim' | 'preauthorization' | 'predetermination';
  patient: { reference: string };
  created: string;
  insurer: { reference: string };
  provider: { reference: string };
  total: { value: number; currency: string };
}

export interface ClaimSubmitInput {
  policyNumber: string;
  beneficiaryId: string;
  beneficiaryName: string;
  providerId: string;
  providerName: string;
  claimType: 'INPATIENT' | 'OUTPATIENT' | 'DENTAL' | 'VISION' | 'PHARMACY' | 'MATERNITY';
  diagnosisCodes: string[];    // ICD-10 codes
  procedureCodes: string[];    // CPT/SNOMED codes
  claimAmount: number;
  currency?: string;           // default NGN
  serviceDate: string;         // ISO 8601
  fhirClaimResource?: FHIRClaim; // Optional: attach FHIR R4 Claim resource
}

export interface ClaimResult {
  id: string;
  nhiaClaimRef: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'PARTIAL' | 'DISBURSED';
  fhirClaimId?: string;        // Medplum FHIR resource ID
}

export interface EligibilityResult {
  isEligible: boolean;
  policyStatus: string;
  coverageLimit: number;
  deductibleMet: boolean;
  copayPercent: number;
  coveredServices: string[];
}

// ── Domain: Insurance (ACORD AL3) ─────────────────────────────────────────────

export interface PolicyCreateInput {
  holderName: string;
  holderFsp: string;
  holderAccount: string;
  insurerId: string;
  policyType: 'LIFE' | 'HEALTH' | 'MOTOR' | 'PROPERTY' | 'MICRO' | 'AGRI';
  premiumAmount: number;
  currency?: string;
  frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  coverageAmount: number;
  startDate: string;
  endDate: string;
  gracePeriodDays?: number;
  acordMessageType?: '103' | '121' | '261' | '282'; // ACORD AL3 message type
}

export interface PolicyResult {
  id: string;
  policyNumber: string;
  status: 'ACTIVE' | 'LAPSED' | 'CANCELLED' | 'EXPIRED';
  acordRef?: string;
}

export interface LapseRiskResult {
  policyId: string;
  lapseRiskScore: number;      // 0.0 – 1.0
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: string[];
  recommendedAction: string;
}

// ── Domain: Remittance (SWIFT gpi + ISO 20022) ────────────────────────────────

export interface CorridorRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  fromCountry: string;
  toCountry: string;
  exchangeRate: number;
  fee: number;
  feeType: 'FLAT' | 'PERCENT';
  minAmount: number;
  maxAmount: number;
  provider: string;
}

export interface TransferInitInput {
  corridorId: string;
  senderFsp: string;
  senderAccount: string;
  receiverFsp: string;
  receiverAccount: string;
  sendAmount: number;
  sendCurrency: string;
  receiverName: string;
  narration?: string;
  swiftGpiEnabled?: boolean;   // Attach SWIFT gpi tracker
  iso20022MessageType?: 'pain.001' | 'pacs.008'; // ISO 20022 message type
}

export interface TransferResult {
  id: string;
  receiveAmount: number;
  receiveCurrency: string;
  exchangeRate: number;
  fee: number;
  status: 'INITIATED' | 'VALIDATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  swiftGpiRef?: string;
  iso20022TxId?: string;
}

export interface TravelRuleResult {
  transferId: string;
  travelRuleRef: string;
  requiresTravelRule: boolean;
  riskScore: number;
  flags: string[];
  isCompliant: boolean;
  requiresManualReview: boolean;
}

// ── Domain: G2P (OpenG2P + MOSIP) ────────────────────────────────────────────

export interface G2PBatchInput {
  programType: 'NASIMS' | 'CCT' | 'N_POWER' | 'TRADER_MONI' | 'MARKET_MONI' | 'CUSTOM';
  programName: string;
  currency: string;
  disbursementItems: Array<{
    beneficiaryNin: string;
    beneficiaryName: string;
    amount: number;
    accountNumber?: string;
    bankCode?: string;
  }>;
}

export interface G2PBatchResult {
  batchId: string;
  totalItems: number;
  totalAmount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
  mosipBatchRef?: string;
}

export interface NINResolveResult {
  nin: string;
  bvn?: string;
  accountNumber?: string;
  bankCode?: string;
  isVerified: boolean;
  dfspId?: string;
}

// ── Domain: Energy (DLMS/COSEM + STS) ────────────────────────────────────────

export interface VendInput {
  meterNumber: string;
  discoCode: 'IKEDC' | 'EKEDC' | 'AEDC' | 'PHEDC' | 'EEDC' | 'KEDCO' | 'IBEDC' | 'BEDC';
  amount: number;
  currency?: string;
  phoneNumber: string;
  customerName?: string;
}

export interface VendResult {
  id: string;
  meterNumber: string;
  units: number;
  token: string;           // 20-digit STS token
  tokenType: 'STS_CREDIT' | 'STS_INFO' | 'STS_TAMPER_CLEAR';
  discoRef: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface MeterInfo {
  meterNumber: string;
  customerName: string;
  address: string;
  tariffClass: string;
  discoCode: string;
  isActive: boolean;
  lastVendDate?: string;
  outstandingDebt?: number;
}

// ── Domain: CBDC (ISO 20022 + mBridge) ───────────────────────────────────────

export interface CBDCTransferInput {
  rail: 'ENAIRA' | 'ECB_TIPS' | 'DCEP' | 'FEDNOW' | 'SAND';
  senderWallet: string;
  receiverWallet: string;
  amount: number;
  currency: string;
  narration?: string;
}

export interface AtomicSwapInput {
  swapType: 'CBDC_TO_FIAT' | 'FIAT_TO_CBDC' | 'CBDC_TO_CBDC';
  sourceRail: string;
  destRail: string;
  sourceAmount: number;
  destAmount: number;
  sourceCurrency?: string;
  destCurrency?: string;
  sourceAccountId: string;
  destAccountId: string;
  destBankCode?: string;
  fxRate?: number;
  idempotency?: string;
}

export interface AtomicSwapResult {
  swapId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'COMPENSATED';
  fxRate: number;
  fxRateExpiry: string;
  workflowId: string;
  message: string;
}

// ── Domain: Supply Chain Finance (GS1 + UBL) ─────────────────────────────────

export interface InvoiceSubmitInput {
  buyerId: string;
  supplierId: string;
  invoiceNumber: string;
  amount: number;
  currency?: string;
  dueDate: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  gs1Gtin?: string;          // GS1 Global Trade Item Number
  ublDocumentType?: string;  // UBL 2.1 document type
}

export interface DiscountRequestInput {
  invoiceId: string;
  financierId: string;
  requestedRate: number;     // Annual discount rate (e.g. 0.12 = 12%)
  requestedAmount: number;
}

// ── Webhook Types ─────────────────────────────────────────────────────────────

export interface WebhookEvent<T = unknown> {
  id: string;
  eventType: string;
  domain: string;
  occurredAt: string;
  data: T;
  apiVersion: string;
  source: 'nexthub';
}

export interface WebhookSubscription {
  id: string;
  appId: string;
  domain: string;
  eventTypes: string[];      // empty = all events in domain
  endpointUrl: string;
  isActive: boolean;
  createdAt: string;
}

// ── NextHub Client ────────────────────────────────────────────────────────────

export class NextHubClient {
  private config: Required<NextHubConfig>;
  public healthcare: HealthcareClient;
  public insurance: InsuranceClient;
  public remittance: RemittanceClient;
  public g2p: G2PClient;
  public energy: EnergyClient;
  public cbdc: CBDCClient;
  public scf: SCFClient;
  public webhooks: WebhookClient;

  constructor(config: NextHubConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      webhookSecret: '',
      ...config,
    };
    const fetch = this.createFetch();
    this.healthcare = new HealthcareClient(fetch);
    this.insurance   = new InsuranceClient(fetch);
    this.remittance  = new RemittanceClient(fetch);
    this.g2p         = new G2PClient(fetch);
    this.energy      = new EnergyClient(fetch);
    this.cbdc        = new CBDCClient(fetch);
    this.scf         = new SCFClient(fetch);
    this.webhooks    = new WebhookClient(fetch);
  }

  private createFetch() {
    const { apiKey, baseUrl, timeout } = this.config;
    return async <T>(path: string, options: RequestInit = {}): Promise<NextHubResponse<T>> => {
      const url = `${baseUrl}${path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const resp = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'X-NextHub-SDK-Version': '1.0.0',
            ...(options.headers ?? {}),
          },
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ message: resp.statusText }));
          throw new NextHubError(resp.status, (err as any).message ?? resp.statusText);
        }
        return resp.json() as Promise<NextHubResponse<T>>;
      } finally {
        clearTimeout(timer);
      }
    };
  }

  /** Verify an incoming webhook signature (HMAC-SHA256). */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) return false;
    // In Node.js: use crypto.createHmac('sha256', secret).update(payload).digest('hex')
    // In browser: use SubtleCrypto
    const expected = `sha256=${this.hmacSha256(payload, this.config.webhookSecret)}`;
    return expected === signature;
  }

  private hmacSha256(_payload: string, _secret: string): string {
    // Placeholder — implement using Node.js crypto or SubtleCrypto
    return '';
  }
}

export class NextHubError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'NextHubError';
  }
}

type FetchFn = <T>(path: string, options?: RequestInit) => Promise<NextHubResponse<T>>;

// ── Domain Clients ────────────────────────────────────────────────────────────

export class HealthcareClient {
  constructor(private fetch: FetchFn) {}

  async submitClaim(input: ClaimSubmitInput): Promise<ClaimResult> {
    const r = await this.fetch<ClaimResult>('/v1/healthcare/claims', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }

  async checkEligibility(policyNumber: string, beneficiaryId: string): Promise<EligibilityResult> {
    const r = await this.fetch<EligibilityResult>(
      `/v1/healthcare/eligibility?policyNumber=${policyNumber}&beneficiaryId=${beneficiaryId}`
    );
    return r.data;
  }

  async getClaimStatus(claimId: string): Promise<ClaimResult> {
    const r = await this.fetch<ClaimResult>(`/v1/healthcare/claims/${claimId}`);
    return r.data;
  }

  async getFHIRPatient(patientId: string): Promise<FHIRPatient> {
    const r = await this.fetch<FHIRPatient>(`/v1/healthcare/fhir/Patient/${patientId}`);
    return r.data;
  }
}

export class InsuranceClient {
  constructor(private fetch: FetchFn) {}

  async createPolicy(input: PolicyCreateInput): Promise<PolicyResult> {
    const r = await this.fetch<PolicyResult>('/v1/insurance/policies', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }

  async scoreLapseRisk(policyId: string): Promise<LapseRiskResult> {
    const r = await this.fetch<LapseRiskResult>(`/v1/insurance/policies/${policyId}/lapse-risk`);
    return r.data;
  }
}

export class RemittanceClient {
  constructor(private fetch: FetchFn) {}

  async getCorridors(fromCurrency?: string, toCurrency?: string): Promise<CorridorRate[]> {
    const params = new URLSearchParams();
    if (fromCurrency) params.set('fromCurrency', fromCurrency);
    if (toCurrency) params.set('toCurrency', toCurrency);
    const r = await this.fetch<CorridorRate[]>(`/v1/remittance/corridors?${params}`);
    return r.data;
  }

  async initiateTransfer(input: TransferInitInput): Promise<TransferResult> {
    const r = await this.fetch<TransferResult>('/v1/remittance/transfers', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }

  async screenTravelRule(transferId: string, payload: object): Promise<TravelRuleResult> {
    const r = await this.fetch<TravelRuleResult>(`/v1/remittance/transfers/${transferId}/travel-rule`, {
      method: 'POST', body: JSON.stringify(payload),
    });
    return r.data;
  }
}

export class G2PClient {
  constructor(private fetch: FetchFn) {}

  async createBatch(input: G2PBatchInput): Promise<G2PBatchResult> {
    const r = await this.fetch<G2PBatchResult>('/v1/g2p/batches', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }

  async resolveNIN(nin: string): Promise<NINResolveResult> {
    const r = await this.fetch<NINResolveResult>(`/v1/g2p/nin/resolve?nin=${nin}`);
    return r.data;
  }
}

export class EnergyClient {
  constructor(private fetch: FetchFn) {}

  async vendElectricity(input: VendInput): Promise<VendResult> {
    const r = await this.fetch<VendResult>('/v1/energy/vend', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }

  async getMeterInfo(meterNumber: string): Promise<MeterInfo> {
    const r = await this.fetch<MeterInfo>(`/v1/energy/meters/${meterNumber}`);
    return r.data;
  }
}

export class CBDCClient {
  constructor(private fetch: FetchFn) {}

  async initiateTransfer(input: CBDCTransferInput): Promise<{ id: string; status: string; railRef: string }> {
    const r = await this.fetch<{ id: string; status: string; railRef: string }>('/v1/cbdc/transfers', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }

  async initiateAtomicSwap(input: AtomicSwapInput): Promise<AtomicSwapResult> {
    const r = await this.fetch<AtomicSwapResult>('/v1/cbdc/atomic-swap', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }

  async getRailHealth(): Promise<Array<{ rail: string; status: string; latencyMs: number }>> {
    const r = await this.fetch<Array<{ rail: string; status: string; latencyMs: number }>>('/v1/cbdc/rails/health');
    return r.data;
  }
}

export class SCFClient {
  constructor(private fetch: FetchFn) {}

  async submitInvoice(input: InvoiceSubmitInput): Promise<{ id: string; status: string }> {
    const r = await this.fetch<{ id: string; status: string }>('/v1/scf/invoices', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }

  async requestDiscount(input: DiscountRequestInput): Promise<{ id: string; status: string; approvedRate?: number }> {
    const r = await this.fetch<{ id: string; status: string; approvedRate?: number }>('/v1/scf/discount-requests', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }
}

export class WebhookClient {
  constructor(private fetch: FetchFn) {}

  async subscribe(input: Omit<WebhookSubscription, 'id' | 'createdAt'>): Promise<WebhookSubscription> {
    const r = await this.fetch<WebhookSubscription>('/v1/webhooks/subscriptions', {
      method: 'POST', body: JSON.stringify(input),
    });
    return r.data;
  }

  async listSubscriptions(): Promise<WebhookSubscription[]> {
    const r = await this.fetch<WebhookSubscription[]>('/v1/webhooks/subscriptions');
    return r.data;
  }

  async deleteSubscription(id: string): Promise<void> {
    await this.fetch<void>(`/v1/webhooks/subscriptions/${id}`, { method: 'DELETE' });
  }
}

// ── Usage Examples ────────────────────────────────────────────────────────────
/*
// Example 1: Healthcare app submits a claim and gets paid
const client = new NextHubClient({ apiKey: 'YOUR_API_KEY', baseUrl: 'https://api.nexthub.io' });

// Step 1: Check eligibility
const eligibility = await client.healthcare.checkEligibility('POL-001', 'BEN-12345');
if (!eligibility.isEligible) throw new Error('Beneficiary not eligible');

// Step 2: Submit FHIR R4 claim
const claim = await client.healthcare.submitClaim({
  policyNumber: 'POL-001',
  beneficiaryId: 'BEN-12345',
  beneficiaryName: 'John Doe',
  providerId: 'PROV-001',
  providerName: 'Lagos General Hospital',
  claimType: 'INPATIENT',
  diagnosisCodes: ['J18.9'],   // ICD-10: Pneumonia
  procedureCodes: ['99213'],   // CPT: Office visit
  claimAmount: 150000,
  currency: 'NGN',
  serviceDate: '2024-01-15',
});

// Step 3: NextHub orchestrates: NHIA adjudication → TigerBeetle debit → NIP credit to hospital
// Payment is automatic — no additional code needed

// Example 2: Insurance app creates a policy and handles premium collection
const policy = await client.insurance.createPolicy({
  holderName: 'Jane Smith',
  holderFsp: 'ACCESS_BANK',
  holderAccount: '0123456789',
  insurerId: 'AIICO',
  policyType: 'MICRO',
  premiumAmount: 500,
  frequency: 'MONTHLY',
  coverageAmount: 100000,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});
// NextHub's PremiumCollectionWorkflow handles monthly debits automatically

// Example 3: Subscribe to events
const sub = await client.webhooks.subscribe({
  appId: 'my-healthcare-app',
  domain: 'healthcare',
  eventTypes: ['healthcare.claim.adjudicated', 'healthcare.claim.disbursed'],
  endpointUrl: 'https://my-app.example.com/webhooks/nexthub',
  isActive: true,
});
*/
