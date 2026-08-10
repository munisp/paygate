// @ts-nocheck
/**
 * HostedCheckoutScreen — React Native
 *
 * The customer-facing hosted payment screen.
 * Supports: Card, Bank Transfer (NIP virtual account), USSD, BNPL, USDC.
 *
 * Usage: navigate('HostedCheckout', { slug: 'pl_abc123' })
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Clipboard,
  SafeAreaView, StatusBar, Modal, Linking, Animated,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  bg:       '#F9FAFB',
  card:     '#FFFFFF',
  border:   '#E5E7EB',
  text:     '#111827',
  muted:    '#6B7280',
  success:  '#10B981',
  error:    '#EF4444',
  warning:  '#F59E0B',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(kobo: number, currency = 'NGN') {
  const amount = kobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(amount);
}

function useCountdown(expiresAt: Date | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, expiresAt.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return {
    mins: Math.floor(remaining / 60000),
    secs: Math.floor((remaining % 60000) / 1000),
    expired: remaining === 0,
  };
}

// ─── Method Config ────────────────────────────────────────────────────────────

const METHODS = [
  { id: 'card',          label: 'Card Payment',    sub: 'Visa · Mastercard · Verve', icon: '💳' },
  { id: 'bank_transfer', label: 'Bank Transfer',   sub: 'Instant NIP virtual account', icon: '🏦' },
  { id: 'ussd',          label: 'USSD',            sub: '*737# and more', icon: '📱' },
  { id: 'bnpl',          label: 'Pay Later',       sub: 'Split into instalments', icon: '📅' },
  { id: 'usdc',          label: 'USDC',            sub: 'Pay with stablecoin', icon: '💰' },
];

const USSD_BANKS = [
  { code: '058', name: 'GTBank',      dial: '*737' },
  { code: '011', name: 'First Bank',  dial: '*894' },
  { code: '044', name: 'Access Bank', dial: '*901' },
  { code: '057', name: 'Zenith Bank', dial: '*822' },
  { code: '033', name: 'UBA',         dial: '*919' },
];

// ─── Sub-screens ──────────────────────────────────────────────────────────────

function CardPayScreen({ session, primaryColor, onConfirm, isLoading }: {
  session: any; primaryColor: string; onConfirm: () => void; isLoading: boolean;
}) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');

  const formatCard = (v: string) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  return (
    <ScrollView style={styles.methodContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.fieldLabel}>Card Number</Text>
      <TextInput
        style={styles.input}
        value={cardNumber}
        onChangeText={v => setCardNumber(formatCard(v))}
        placeholder="0000 0000 0000 0000"
        keyboardType="numeric"
        maxLength={19}
      />

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.fieldLabel}>Expiry</Text>
          <TextInput
            style={styles.input}
            value={expiry}
            onChangeText={v => setExpiry(formatExpiry(v))}
            placeholder="MM/YY"
            keyboardType="numeric"
            maxLength={5}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>CVV</Text>
          <TextInput
            style={styles.input}
            value={cvv}
            onChangeText={v => setCvv(v.replace(/\D/g, '').slice(0, 4))}
            placeholder="•••"
            keyboardType="numeric"
            secureTextEntry
            maxLength={4}
          />
        </View>
      </View>

      <Text style={styles.fieldLabel}>Cardholder Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="John Doe"
        autoCapitalize="words"
      />

      <View style={styles.securityNote}>
        <Text style={styles.securityText}>🔒 256-bit SSL · PCI DSS Level 1 · 3D Secure</Text>
      </View>

      <TouchableOpacity
        style={[styles.payBtn, { backgroundColor: primaryColor }, (!cardNumber || !expiry || !cvv || !name || isLoading) && styles.payBtnDisabled]}
        onPress={onConfirm}
        disabled={!cardNumber || !expiry || !cvv || !name || isLoading}
      >
        {isLoading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.payBtnText}>Pay {fmt(Number(session.amountKobo), session.currency)}</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

function BankTransferScreen({ session, primaryColor }: { session: any; primaryColor: string }) {
  const expiresAt = session.nipExpiresAt ? new Date(session.nipExpiresAt) : null;
  const { mins, secs, expired } = useCountdown(expiresAt);

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  return (
    <ScrollView style={styles.methodContainer} showsVerticalScrollIndicator={false}>
      <View style={[styles.infoCard, { backgroundColor: '#EFF6FF' }]}>
        <Text style={[styles.infoCardTitle, { color: '#1D4ED8' }]}>Transfer to this account</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Bank Name</Text>
          <Text style={styles.infoValue}>{session.nipBankName ?? 'PayGate Virtual Bank'}</Text>
        </View>

        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Account Number</Text>
            <Text style={[styles.infoValueLarge, { color: primaryColor }]}>
              {session.nipVirtualAccountNumber ?? '—'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.copyBtn, { borderColor: primaryColor }]}
            onPress={() => copyToClipboard(session.nipVirtualAccountNumber ?? '', 'Account number')}
          >
            <Text style={[styles.copyBtnText, { color: primaryColor }]}>Copy</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Amount (exact)</Text>
            <Text style={[styles.infoValueLarge, { color: primaryColor }]}>
              {fmt(Number(session.amountKobo), session.currency)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.copyBtn, { borderColor: primaryColor }]}
            onPress={() => copyToClipboard(String(Number(session.amountKobo) / 100), 'Amount')}
          >
            <Text style={[styles.copyBtnText, { color: primaryColor }]}>Copy</Text>
          </TouchableOpacity>
        </View>
      </View>

      {expiresAt && !expired && (
        <View style={[styles.alertBox, { backgroundColor: '#FFFBEB' }]}>
          <Text style={{ color: '#92400E', fontSize: 13 }}>
            ⏱ Account expires in {mins}:{String(secs).padStart(2, '0')}
          </Text>
        </View>
      )}
      {expired && (
        <View style={[styles.alertBox, { backgroundColor: '#FEF2F2' }]}>
          <Text style={{ color: '#991B1B', fontSize: 13 }}>
            ❌ Account expired. Please start a new payment.
          </Text>
        </View>
      )}

      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsTitle}>Instructions</Text>
        {[
          '1. Open your mobile banking app',
          '2. Transfer the exact amount to the account above',
          '3. Payment is confirmed automatically within seconds',
          '4. Do not close this screen until confirmation',
        ].map((step, i) => (
          <Text key={i} style={styles.instructionStep}>{step}</Text>
        ))}
      </View>

      <Text style={styles.poweredBy}>⚡ Powered by NIBSS NIP — instant settlement</Text>
    </ScrollView>
  );
}

function USSDScreen({ session, primaryColor }: { session: any; primaryColor: string }) {
  const dialCode = session.ussdCode ?? '*737*000*123456#';

  const dialNow = () => {
    Linking.openURL(`tel:${dialCode}`).catch(() =>
      Alert.alert('Error', 'Could not open dialler. Please dial manually.')
    );
  };

  return (
    <ScrollView style={styles.methodContainer} showsVerticalScrollIndicator={false}>
      <View style={[styles.infoCard, { backgroundColor: '#F5F3FF', alignItems: 'center' }]}>
        <Text style={[styles.infoCardTitle, { color: '#6D28D9' }]}>Dial this code</Text>
        <Text style={[styles.ussdCode, { color: primaryColor }]}>{dialCode}</Text>
        <TouchableOpacity
          style={[styles.dialBtn, { backgroundColor: primaryColor }]}
          onPress={dialNow}
        >
          <Text style={styles.dialBtnText}>📞 Dial Now</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsTitle}>How to pay</Text>
        {[
          `1. Open your phone dialler`,
          `2. Dial ${dialCode}`,
          `3. Follow the prompts and enter your PIN`,
          `4. Confirm the amount: ${fmt(Number(session.amountKobo), session.currency)}`,
          '5. Payment confirmed automatically',
        ].map((step, i) => (
          <Text key={i} style={styles.instructionStep}>{step}</Text>
        ))}
      </View>

      <Text style={styles.poweredBy}>📱 Works on all Nigerian networks — no internet required</Text>
    </ScrollView>
  );
}

function BNPLScreen({ session, primaryColor }: { session: any; primaryColor: string }) {
  const installmentKobo = Number(session.bnplInstallmentKobo ?? 0);
  const count = session.bnplInstallmentCount ?? 3;
  const schedule = Array.from({ length: count }, (_, i) => ({
    label: i === 0 ? 'Today' : `Month ${i + 1}`,
    date: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-NG', {
      day: 'numeric', month: 'short', year: 'numeric',
    }),
    amount: installmentKobo,
  }));

  return (
    <ScrollView style={styles.methodContainer} showsVerticalScrollIndicator={false}>
      <View style={[styles.infoCard, { backgroundColor: '#FFFBEB' }]}>
        <Text style={[styles.infoCardTitle, { color: '#92400E' }]}>Instalment Plan</Text>
        {schedule.map((s, i) => (
          <View key={i} style={[styles.bnplRow, i === 0 && { borderLeftColor: primaryColor, borderLeftWidth: 3 }]}>
            <View>
              <Text style={styles.bnplLabel}>{s.label}</Text>
              <Text style={styles.bnplDate}>{s.date}</Text>
            </View>
            <Text style={[styles.bnplAmount, { color: i === 0 ? primaryColor : C.text }]}>
              {fmt(s.amount, session.currency)}
            </Text>
          </View>
        ))}
        <View style={styles.bnplTotal}>
          <Text style={styles.bnplTotalLabel}>Total</Text>
          <Text style={styles.bnplTotalAmount}>{fmt(Number(session.amountKobo), session.currency)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.payBtn, { backgroundColor: primaryColor }]}
        onPress={() => Linking.openURL(session.bnplApprovalUrl ?? '#')}
      >
        <Text style={styles.payBtnText}>Continue with {session.bnplProvider ?? 'Carbon'} →</Text>
      </TouchableOpacity>

      <Text style={[styles.poweredBy, { marginTop: 8 }]}>Subject to credit check · 0% interest · No hidden fees</Text>
    </ScrollView>
  );
}

function USDCScreen({ session, primaryColor }: { session: any; primaryColor: string }) {
  const copyAddress = () => {
    Clipboard.setString(session.usdcWalletAddress ?? '');
    Alert.alert('Copied', 'Wallet address copied to clipboard');
  };

  return (
    <ScrollView style={styles.methodContainer} showsVerticalScrollIndicator={false}>
      <View style={[styles.infoCard, { backgroundColor: '#EEF2FF' }]}>
        <Text style={[styles.infoCardTitle, { color: '#4338CA' }]}>Send USDC to this address</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Network</Text>
          <Text style={styles.infoValue}>{session.usdcNetwork ?? 'Ethereum'}</Text>
        </View>

        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Wallet Address</Text>
            <Text style={styles.addressText} numberOfLines={2}>
              {session.usdcWalletAddress ?? '0x...'}
            </Text>
          </View>
          <TouchableOpacity style={[styles.copyBtn, { borderColor: primaryColor }]} onPress={copyAddress}>
            <Text style={[styles.copyBtnText, { color: primaryColor }]}>Copy</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Amount</Text>
          <Text style={[styles.infoValueLarge, { color: primaryColor }]}>
            {session.usdcAmountUsdc?.toFixed(2) ?? '0.00'} USDC
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HostedCheckoutScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { slug } = route.params ?? {};

  const [step, setStep] = useState<'info' | 'method' | 'pay' | 'done'>('info');
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [paymentState, setPaymentState] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [ussdBankCode, setUssdBankCode] = useState('058');
  const [bnplCount, setBnplCount] = useState(3);

  const { data: linkData, isLoading: linkLoading, error: linkError } =
    trpc.hostedCheckout.getPaymentLinkDetails.useQuery(
      { slug: slug ?? '' },
      { enabled: !!slug, retry: false },
    );

  const initiateMutation = trpc.hostedCheckout.initiatePayment.useMutation();
  const confirmMutation = trpc.hostedCheckout.confirmPayment.useMutation();

  const { data: statusData } = trpc.hostedCheckout.getStatus.useQuery(
    { sessionId: session?.id ?? '' },
    { enabled: !!session?.id && paymentState === 'processing', refetchInterval: 3000 },
  );

  useEffect(() => {
    if (!statusData) return;
    if (statusData.status === 'completed') {
      setPaymentState('success');
      setStep('done');
    } else if (statusData.status === 'failed' || statusData.status === 'expired') {
      setPaymentState('failed');
      Alert.alert('Payment Failed', 'Your payment could not be completed. Please try again.');
    }
  }, [statusData]);

  const link = linkData?.link;
  const theme = linkData?.theme;
  const primaryColor = theme?.primaryColor ?? '#4F46E5';
  const businessName = theme?.businessName ?? 'Merchant';
  const showMethods: string[] = (theme?.showPaymentMethods as string[]) ?? ['card', 'bank_transfer', 'ussd', 'bnpl'];

  const handleInitiate = async (method: string) => {
    if (!link) return;
    setSelectedMethod(method);
    setPaymentState('processing');
    try {
      const s = await initiateMutation.mutateAsync({
        paymentLinkId: link.id,
        merchantId: link.merchantId,
        tenantId: link.tenantId,
        amountKobo: Number(link.amount),
        currency: link.currency ?? 'NGN',
        description: link.description ?? undefined,
        paymentMethod: method as any,
        customerEmail: customerEmail || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        ussdBankCode: method === 'ussd' ? ussdBankCode : undefined,
        bnplInstallmentCount: method === 'bnpl' ? bnplCount : undefined,
      });
      setSession(s);
      setStep('pay');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to initiate payment');
      setPaymentState('idle');
    }
  };

  const handleCardConfirm = async () => {
    if (!session) return;
    setPaymentState('processing');
    try {
      await confirmMutation.mutateAsync({
        sessionId: session.id,
        stripePaymentIntentId: session.stripePaymentIntentId,
      });
      setPaymentState('success');
      setStep('done');
    } catch (err: any) {
      Alert.alert('Payment Failed', err?.message ?? 'Payment could not be completed');
      setPaymentState('failed');
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (linkLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.muted, { marginTop: 12 }]}>Loading payment…</Text>
      </SafeAreaView>
    );
  }

  if (linkError || !link) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={{ fontSize: 48 }}>❌</Text>
        <Text style={[styles.title, { textAlign: 'center', marginTop: 16 }]}>Payment Link Not Found</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>
          This payment link is invalid or has expired.
        </Text>
        <TouchableOpacity style={[styles.payBtn, { backgroundColor: primaryColor, marginTop: 24 }]} onPress={() => navigation.goBack()}>
          <Text style={styles.payBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <View style={[styles.successIcon, { backgroundColor: `${C.success}20` }]}>
          <Text style={{ fontSize: 40 }}>✅</Text>
        </View>
        <Text style={[styles.title, { textAlign: 'center', marginTop: 16 }]}>Payment Successful!</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>
          {fmt(Number(link.amount), link.currency ?? 'NGN')} paid to {businessName}
        </Text>
        {session?.reference && (
          <View style={styles.referenceCard}>
            <Text style={styles.referenceLabel}>Reference</Text>
            <Text style={[styles.referenceValue, { color: primaryColor }]}>{session.reference}</Text>
          </View>
        )}
        {customerEmail && (
          <Text style={[styles.muted, { marginTop: 8 }]}>Receipt sent to {customerEmail}</Text>
        )}
        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: primaryColor, marginTop: 24 }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.payBtnText}>Done</Text>
        </TouchableOpacity>
        <Text style={[styles.poweredBy, { marginTop: 16 }]}>
          Secured by <Text style={{ color: primaryColor, fontWeight: '700' }}>PayGate</Text>
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={primaryColor} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: '#fff', fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerBusiness}>{businessName}</Text>
          <Text style={styles.headerAmount}>{fmt(Number(link.amount), link.currency ?? 'NGN')}</Text>
          {link.description && (
            <Text style={styles.headerDesc}>{link.description}</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Step: Customer info */}
      {step === 'info' && (
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Your Details</Text>

          <Text style={styles.fieldLabel}>Email address</Text>
          <TextInput
            style={styles.input}
            value={customerEmail}
            onChangeText={setCustomerEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            style={styles.input}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="John Doe"
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={customerPhone}
            onChangeText={setCustomerPhone}
            placeholder="+234 801 234 5678"
            keyboardType="phone-pad"
          />

          <TouchableOpacity
            style={[styles.payBtn, { backgroundColor: primaryColor }, !customerEmail && styles.payBtnDisabled]}
            onPress={() => setStep('method')}
            disabled={!customerEmail}
          >
            <Text style={styles.payBtnText}>Continue →</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Step: Method selection */}
      {step === 'method' && (
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Choose payment method</Text>

          {METHODS.filter(m => showMethods.includes(m.id)).map(method => (
            <TouchableOpacity
              key={method.id}
              style={styles.methodCard}
              onPress={() => handleInitiate(method.id)}
              disabled={initiateMutation.isPending}
            >
              <Text style={styles.methodIcon}>{method.icon}</Text>
              <View style={styles.methodInfo}>
                <Text style={styles.methodLabel}>{method.label}</Text>
                <Text style={styles.methodSub}>{method.sub}</Text>
              </View>
              {initiateMutation.isPending && initiateMutation.variables?.paymentMethod === method.id
                ? <ActivityIndicator size="small" color={primaryColor} />
                : <Text style={styles.methodArrow}>›</Text>
              }
            </TouchableOpacity>
          ))}

          {showMethods.includes('ussd') && (
            <View style={styles.selectorContainer}>
              <Text style={styles.selectorLabel}>USSD Bank</Text>
              <View style={styles.bankSelector}>
                {USSD_BANKS.map(bank => (
                  <TouchableOpacity
                    key={bank.code}
                    style={[styles.bankOption, ussdBankCode === bank.code && { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }]}
                    onPress={() => setUssdBankCode(bank.code)}
                  >
                    <Text style={[styles.bankOptionText, ussdBankCode === bank.code && { color: primaryColor }]}>
                      {bank.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {showMethods.includes('bnpl') && (
            <View style={styles.selectorContainer}>
              <Text style={styles.selectorLabel}>BNPL Instalments</Text>
              <View style={styles.bankSelector}>
                {[2, 3, 6, 12].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.bankOption, bnplCount === n && { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }]}
                    onPress={() => setBnplCount(n)}
                  >
                    <Text style={[styles.bankOptionText, bnplCount === n && { color: primaryColor }]}>
                      {n}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Step: Pay */}
      {step === 'pay' && session && (
        <View style={styles.body}>
          <View style={styles.methodHeader}>
            <TouchableOpacity onPress={() => { setStep('method'); setSession(null); setPaymentState('idle'); }}>
              <Text style={{ color: C.muted, fontSize: 14 }}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>
              {METHODS.find(m => m.id === selectedMethod)?.label ?? 'Payment'}
            </Text>
          </View>

          {selectedMethod === 'card' && (
            <CardPayScreen session={session} primaryColor={primaryColor} onConfirm={handleCardConfirm} isLoading={confirmMutation.isPending} />
          )}
          {selectedMethod === 'bank_transfer' && (
            <BankTransferScreen session={session} primaryColor={primaryColor} />
          )}
          {selectedMethod === 'ussd' && (
            <USSDScreen session={session} primaryColor={primaryColor} />
          )}
          {selectedMethod === 'bnpl' && (
            <BNPLScreen session={session} primaryColor={primaryColor} />
          )}
          {selectedMethod === 'usdc' && (
            <USDCScreen session={session} primaryColor={primaryColor} />
          )}

          {['bank_transfer', 'ussd'].includes(selectedMethod ?? '') && paymentState === 'processing' && (
            <View style={styles.pollingIndicator}>
              <ActivityIndicator size="small" color={C.muted} />
              <Text style={styles.pollingText}>Waiting for payment confirmation…</Text>
            </View>
          )}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          🔒 Secured by <Text style={{ color: primaryColor, fontWeight: '700' }}>PayGate</Text> · CBN Licensed PSP
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: C.bg },
  header:            { paddingTop: 12, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  backBtn:           { width: 40, height: 40, justifyContent: 'center' },
  headerCenter:      { flex: 1, alignItems: 'center' },
  headerBusiness:    { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  headerAmount:      { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 2 },
  headerDesc:        { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  body:              { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle:      { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 },
  fieldLabel:        { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6 },
  input:             { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text, marginBottom: 12 },
  row:               { flexDirection: 'row' },
  payBtn:            { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  payBtnDisabled:    { opacity: 0.5 },
  payBtnText:        { color: '#fff', fontWeight: '700', fontSize: 15 },
  methodCard:        { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  methodIcon:        { fontSize: 24, marginRight: 14 },
  methodInfo:        { flex: 1 },
  methodLabel:       { fontSize: 14, fontWeight: '600', color: C.text },
  methodSub:         { fontSize: 12, color: C.muted, marginTop: 2 },
  methodArrow:       { fontSize: 20, color: C.muted },
  methodContainer:   { flex: 1 },
  methodHeader:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  infoCard:          { borderRadius: 16, padding: 16, marginBottom: 12 },
  infoCardTitle:     { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  infoRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  infoLabel:         { fontSize: 11, color: C.muted, marginBottom: 2 },
  infoValue:         { fontSize: 14, fontWeight: '600', color: C.text },
  infoValueLarge:    { fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  copyBtn:           { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  copyBtnText:       { fontSize: 12, fontWeight: '600' },
  alertBox:          { borderRadius: 12, padding: 12, marginBottom: 10 },
  instructionsCard:  { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 12 },
  instructionsTitle: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 8 },
  instructionStep:   { fontSize: 12, color: C.muted, marginBottom: 4 },
  poweredBy:         { fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 8 },
  securityNote:      { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'center' },
  securityText:      { fontSize: 11, color: C.muted },
  ussdCode:          { fontSize: 28, fontWeight: '800', letterSpacing: 2, marginVertical: 12, fontFamily: 'monospace' },
  dialBtn:           { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 4 },
  dialBtnText:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  bnplRow:           { backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingLeft: 12 },
  bnplLabel:         { fontSize: 13, fontWeight: '600', color: C.text },
  bnplDate:          { fontSize: 11, color: C.muted, marginTop: 2 },
  bnplAmount:        { fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  bnplTotal:         { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: '#FDE68A' },
  bnplTotalLabel:    { fontSize: 12, color: C.muted },
  bnplTotalAmount:   { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: 'monospace' },
  addressText:       { fontSize: 11, color: C.text, fontFamily: 'monospace', flex: 1, marginRight: 8 },
  selectorContainer: { marginTop: 8, marginBottom: 12 },
  selectorLabel:     { fontSize: 11, color: C.muted, marginBottom: 8 },
  bankSelector:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bankOption:        { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  bankOptionText:    { fontSize: 12, color: C.text },
  pollingIndicator:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  pollingText:       { fontSize: 12, color: C.muted },
  footer:            { padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: '#fff' },
  footerText:        { fontSize: 11, color: C.muted },
  title:             { fontSize: 22, fontWeight: '800', color: C.text },
  muted:             { fontSize: 13, color: C.muted },
  successIcon:       { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  referenceCard:     { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginTop: 16, alignItems: 'center' },
  referenceLabel:    { fontSize: 11, color: C.muted, marginBottom: 4 },
  referenceValue:    { fontSize: 16, fontWeight: '800', fontFamily: 'monospace' },
});
