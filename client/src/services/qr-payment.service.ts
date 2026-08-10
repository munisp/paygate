/**
 * QR Payment Service
 * Adapted from PayGate PWA archive.
 */

export interface QRPaymentData {
  id: string;
  merchantId?: string;
  amount?: number;
  currency: string;
  description?: string;
  timestamp: number;
  version: string;
}

export interface QRScanRecord {
  id: string;
  data: QRPaymentData;
  scannedAt: number;
}

const RECENT_SCANS_KEY = "paygate_recent_qr_scans";
const MAX_RECENT = 10;

export function generateQRPaymentData(amount?: number, description?: string): QRPaymentData {
  return {
    id: `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    amount,
    currency: "USD",
    description,
    timestamp: Date.now(),
    version: "1.0",
  };
}

export function qrDataToString(data: QRPaymentData): string {
  return JSON.stringify(data);
}

export function parseQRCode(raw: string): QRPaymentData | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id && parsed.currency) return parsed as QRPaymentData;
    return null;
  } catch {
    return null;
  }
}

export function getRecentQRScans(): QRScanRecord[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SCANS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveQRScan(data: QRPaymentData): void {
  const existing = getRecentQRScans();
  const record: QRScanRecord = { id: `scan_${Date.now()}`, data, scannedAt: Date.now() };
  const updated = [record, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(updated));
}
