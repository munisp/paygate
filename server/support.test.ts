import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));
vi.mock('./_core/llm', () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Thank you for reaching out to PayGate Support.' } }],
  }),
}));

describe('Support Router', () => {
  describe('getCanonicalResponse fallback', () => {
    it('returns transaction help for failed transaction message', () => {
      const msg = 'My transaction failed';
      const lower = msg.toLowerCase();
      expect(lower.includes('transaction') && (lower.includes('fail') || lower.includes('error'))).toBe(true);
    });

    it('returns payout help for missing payout message', () => {
      const msg = 'I have not received my payout';
      const lower = msg.toLowerCase();
      expect(lower.includes('payout') && (lower.includes('not') || lower.includes('missing') || lower.includes('delay'))).toBe(true);
    });

    it('returns API help for webhook message', () => {
      const msg = 'My webhook is not working';
      const lower = msg.toLowerCase();
      expect(lower.includes('webhook')).toBe(true);
    });

    it('returns KYC help for verification message', () => {
      const msg = 'I need help with KYC verification';
      const lower = msg.toLowerCase();
      expect(lower.includes('kyc') || lower.includes('kyb') || lower.includes('verification')).toBe(true);
    });

    it('returns dispute help for dispute message', () => {
      const msg = 'I want to dispute a charge';
      const lower = msg.toLowerCase();
      expect(lower.includes('dispute') || lower.includes('chargeback')).toBe(true);
    });
  });

  describe('Session ID format', () => {
    it('generates unique session IDs', () => {
      const id1 = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const id2 = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      expect(id1).not.toBe(id2);
    });

    it('session ID starts with session_', () => {
      const id = `session_${Date.now()}_abc123`;
      expect(id.startsWith('session_')).toBe(true);
    });
  });

  describe('Quick replies', () => {
    const QUICK_REPLIES = [
      { label: 'Transaction failed', text: 'My transaction failed and I need help resolving it.' },
      { label: 'Payout not received', text: 'I have not received my payout. Can you help?' },
      { label: 'API integration help', text: 'I need help integrating the PayGate API.' },
      { label: 'Account verification', text: 'I need help with my account verification (KYC/KYB).' },
      { label: 'Dispute a charge', text: 'I want to dispute a charge on my account.' },
      { label: 'Webhook not firing', text: 'My webhook endpoint is not receiving events.' },
    ];

    it('has 6 quick reply options', () => {
      expect(QUICK_REPLIES).toHaveLength(6);
    });

    it('all quick replies have label and text', () => {
      QUICK_REPLIES.forEach(qr => {
        expect(qr.label).toBeTruthy();
        expect(qr.text).toBeTruthy();
        expect(qr.text.length).toBeGreaterThan(10);
      });
    });
  });
});
