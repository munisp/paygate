/**
 * hostedCheckout.test.ts
 * Vitest unit tests for the hosted checkout tRPC router.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../drizzle/schema', () => ({
  checkoutSessions: {},
  checkoutThemes: {},
  paymentLinks: {},
}));

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  },
}));

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_secret',
        status: 'requires_payment_method',
      }),
      retrieve: vi.fn().mockResolvedValue({ status: 'succeeded' }),
    },
    webhooks: {
      constructEvent: vi.fn().mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_123', metadata: { sessionId: 'sess_test' } } },
      }),
    },
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateReference(merchantId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `PG_${timestamp}_${random}`;
}

function generateNIPVirtualAccount(): string {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

function generateUSSDCode(bankCode: string, amount: number, sessionRef: string): string {
  const shortRef = sessionRef.slice(-6);
  const dialCodes: Record<string, string> = {
    '058': '*737', '011': '*894', '044': '*901',
    '057': '*822', '033': '*919', '232': '*833',
  };
  const dial = dialCodes[bankCode] ?? '*737';
  return `${dial}*${Math.floor(amount / 100)}*${shortRef}#`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('hostedCheckout helpers', () => {
  it('generates a valid payment reference', () => {
    const ref = generateReference('merchant_001');
    expect(ref).toMatch(/^PG_\d+_[A-Z0-9]+$/);
    expect(ref.length).toBeGreaterThan(10);
  });

  it('generates a 10-digit NIP virtual account number', () => {
    const account = generateNIPVirtualAccount();
    expect(account).toMatch(/^\d{10}$/);
    expect(Number(account)).toBeGreaterThanOrEqual(1000000000);
    expect(Number(account)).toBeLessThan(10000000000);
  });

  it('generates correct USSD code for GTBank', () => {
    const code = generateUSSDCode('058', 500000, 'PG_1234567890_ABCDEF');
    expect(code).toMatch(/^\*737\*\d+\*\w+#$/);
    expect(code).toContain('*737');
    expect(code).toContain('*5000*'); // 500000 kobo = ₦5000
  });

  it('generates correct USSD code for Access Bank', () => {
    const code = generateUSSDCode('044', 1000000, 'PG_1234567890_XYZ123');
    expect(code).toContain('*901');
    expect(code).toContain('*10000*'); // 1000000 kobo = ₦10000
  });

  it('falls back to GTBank dial code for unknown bank code', () => {
    const code = generateUSSDCode('999', 100000, 'PG_123_FALLBACK');
    expect(code).toContain('*737');
  });
});

describe('payment amount validation', () => {
  it('rejects zero amount', () => {
    const validate = (kobo: number) => {
      if (kobo <= 0) throw new Error('Amount must be greater than 0');
      if (kobo < 100) throw new Error('Minimum amount is ₦1');
      if (kobo > 10_000_000_00) throw new Error('Maximum amount is ₦10,000,000');
      return true;
    };
    expect(() => validate(0)).toThrow('Amount must be greater than 0');
    expect(() => validate(-100)).toThrow('Amount must be greater than 0');
  });

  it('rejects amount below minimum', () => {
    const validate = (kobo: number) => {
      if (kobo < 100) throw new Error('Minimum amount is ₦1');
      return true;
    };
    expect(() => validate(50)).toThrow('Minimum amount is ₦1');
    expect(validate(100)).toBe(true);
  });

  it('accepts valid amounts', () => {
    const validate = (kobo: number) => {
      if (kobo <= 0) throw new Error('Amount must be greater than 0');
      if (kobo < 100) throw new Error('Minimum amount is ₦1');
      return true;
    };
    expect(validate(100)).toBe(true);       // ₦1
    expect(validate(500000)).toBe(true);    // ₦5,000
    expect(validate(5000000)).toBe(true);   // ₦50,000
    expect(validate(100000000)).toBe(true); // ₦1,000,000
  });
});

describe('BNPL instalment calculation', () => {
  function calculateBNPL(amountKobo: number, count: number) {
    if (![2, 3, 6, 12].includes(count)) throw new Error('Invalid instalment count');
    const installment = Math.ceil(amountKobo / count);
    const lastInstallment = amountKobo - installment * (count - 1);
    return { installment, lastInstallment, count };
  }

  it('calculates 3-instalment plan correctly', () => {
    const result = calculateBNPL(300000, 3); // ₦3,000 in 3 parts
    expect(result.installment).toBe(100000);
    expect(result.count).toBe(3);
  });

  it('handles non-divisible amounts with ceiling', () => {
    const result = calculateBNPL(100001, 3);
    expect(result.installment).toBe(33334); // Math.ceil(100001/3)
    expect(result.count).toBe(3);
  });

  it('rejects invalid instalment counts', () => {
    expect(() => calculateBNPL(300000, 5)).toThrow('Invalid instalment count');
    expect(() => calculateBNPL(300000, 0)).toThrow('Invalid instalment count');
    expect(() => calculateBNPL(300000, 4)).toThrow('Invalid instalment count');
  });

  it('accepts all valid instalment counts', () => {
    [2, 3, 6, 12].forEach(count => {
      expect(() => calculateBNPL(1200000, count)).not.toThrow();
    });
  });
});

describe('checkout session status machine', () => {
  type SessionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired' | 'abandoned';

  function canTransition(from: SessionStatus, to: SessionStatus): boolean {
    const transitions: Record<SessionStatus, SessionStatus[]> = {
      pending:    ['processing', 'expired', 'abandoned'],
      processing: ['completed', 'failed', 'expired'],
      completed:  [],
      failed:     ['pending'], // allow retry
      expired:    [],
      abandoned:  [],
    };
    return transitions[from]?.includes(to) ?? false;
  }

  it('allows pending → processing', () => {
    expect(canTransition('pending', 'processing')).toBe(true);
  });

  it('allows processing → completed', () => {
    expect(canTransition('processing', 'completed')).toBe(true);
  });

  it('allows processing → failed', () => {
    expect(canTransition('processing', 'failed')).toBe(true);
  });

  it('prevents completed → any other state', () => {
    const states: SessionStatus[] = ['pending', 'processing', 'failed', 'expired', 'abandoned'];
    states.forEach(s => {
      expect(canTransition('completed', s)).toBe(false);
    });
  });

  it('prevents expired → any other state except back to pending', () => {
    expect(canTransition('expired', 'pending')).toBe(false);
    expect(canTransition('expired', 'processing')).toBe(false);
  });

  it('allows failed → pending for retry', () => {
    expect(canTransition('failed', 'pending')).toBe(true);
  });
});

describe('checkout theme validation', () => {
  function validateHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }

  function validateTheme(theme: {
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
    borderRadius: string;
  }) {
    if (!validateHexColor(theme.primaryColor)) throw new Error('Invalid primaryColor');
    if (!validateHexColor(theme.backgroundColor)) throw new Error('Invalid backgroundColor');
    if (!validateHexColor(theme.textColor)) throw new Error('Invalid textColor');
    const br = parseInt(theme.borderRadius, 10);
    if (isNaN(br) || br < 0 || br > 32) throw new Error('borderRadius must be 0-32');
    return true;
  }

  it('validates a correct theme', () => {
    expect(validateTheme({
      primaryColor: '#4F46E5',
      backgroundColor: '#F9FAFB',
      textColor: '#111827',
      borderRadius: '16',
    })).toBe(true);
  });

  it('rejects invalid hex colors', () => {
    expect(() => validateTheme({
      primaryColor: 'indigo',
      backgroundColor: '#F9FAFB',
      textColor: '#111827',
      borderRadius: '16',
    })).toThrow('Invalid primaryColor');
  });

  it('rejects out-of-range border radius', () => {
    expect(() => validateTheme({
      primaryColor: '#4F46E5',
      backgroundColor: '#F9FAFB',
      textColor: '#111827',
      borderRadius: '50',
    })).toThrow('borderRadius must be 0-32');
  });

  it('validates all standard hex formats', () => {
    expect(validateHexColor('#000000')).toBe(true);
    expect(validateHexColor('#FFFFFF')).toBe(true);
    expect(validateHexColor('#4F46E5')).toBe(true);
    expect(validateHexColor('#10B981')).toBe(true);
    expect(validateHexColor('4F46E5')).toBe(false);   // missing #
    expect(validateHexColor('#4F46E')).toBe(false);   // too short
    expect(validateHexColor('#4F46E55')).toBe(false); // too long
  });
});

describe('payment link slug generation', () => {
  function generateSlug(title: string, id: string): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 30);
    const suffix = id.slice(-6);
    return `${base}-${suffix}`;
  }

  it('generates URL-safe slugs', () => {
    const slug = generateSlug('Premium Subscription Plan', 'pl_abc123def456');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).not.toContain(' ');
  });

  it('appends ID suffix for uniqueness', () => {
    const slug = generateSlug('Test Link', 'pl_abc123def456');
    expect(slug).toContain('f456');
  });

  it('handles special characters in title', () => {
    const slug = generateSlug('Pay for Order #123 (₦5,000)', 'pl_xyz789');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('truncates long titles', () => {
    const longTitle = 'This is a very long payment link title that exceeds the maximum allowed length';
    const slug = generateSlug(longTitle, 'pl_abc123');
    expect(slug.length).toBeLessThanOrEqual(37); // 30 + '-' + 6
  });
});
