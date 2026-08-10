// hosted_checkout_screen.dart
// Customer-facing hosted payment screen for PayGate Flutter app.
// Supports: Card, Bank Transfer (NIP), USSD, BNPL, USDC.
//
// Usage: Navigator.push(context, MaterialPageRoute(
//   builder: (_) => HostedCheckoutScreen(slug: 'pl_abc123')));

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';

// ─── Colour Palette ───────────────────────────────────────────────────────────

class _C {
  static const bg      = Color(0xFFF9FAFB);
  static const card    = Color(0xFFFFFFFF);
  static const border  = Color(0xFFE5E7EB);
  static const text    = Color(0xFF111827);
  static const muted   = Color(0xFF6B7280);
  static const success = Color(0xFF10B981);
  static const error   = Color(0xFFEF4444);
  static const warning = Color(0xFFF59E0B);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

String fmtAmount(int kobo, {String currency = 'NGN'}) {
  final amount = kobo / 100;
  return '${currency} ${amount.toStringAsFixed(2).replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+\.)'),
    (m) => '${m[1]},',
  )}';
}

// ─── Payment Method Config ────────────────────────────────────────────────────

class _Method {
  final String id, label, sub, icon;
  const _Method(this.id, this.label, this.sub, this.icon);
}

const _methods = [
  _Method('card',          'Card Payment',    'Visa · Mastercard · Verve',        '💳'),
  _Method('bank_transfer', 'Bank Transfer',   'Instant NIP virtual account',      '🏦'),
  _Method('ussd',          'USSD',            '*737# and more',                   '📱'),
  _Method('bnpl',          'Pay Later',       'Split into instalments',           '📅'),
  _Method('usdc',          'USDC',            'Pay with stablecoin',              '💰'),
];

// ─── Countdown Widget ─────────────────────────────────────────────────────────

class _CountdownText extends StatefulWidget {
  final DateTime expiresAt;
  const _CountdownText({required this.expiresAt});

  @override
  State<_CountdownText> createState() => _CountdownTextState();
}

class _CountdownTextState extends State<_CountdownText> {
  late Timer _timer;
  Duration _remaining = Duration.zero;

  @override
  void initState() {
    super.initState();
    _tick();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _tick() {
    final r = widget.expiresAt.difference(DateTime.now());
    setState(() => _remaining = r.isNegative ? Duration.zero : r);
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_remaining == Duration.zero) {
      return const Text('Account expired', style: TextStyle(color: _C.error, fontSize: 13));
    }
    final m = _remaining.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = _remaining.inSeconds.remainder(60).toString().padLeft(2, '0');
    return Text('Account expires in $m:$s',
      style: const TextStyle(color: Color(0xFF92400E), fontSize: 13, fontWeight: FontWeight.w600));
  }
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

class _CopyButton extends StatefulWidget {
  final String text, label;
  final Color color;
  const _CopyButton({required this.text, required this.label, required this.color});

  @override
  State<_CopyButton> createState() => _CopyButtonState();
}

class _CopyButtonState extends State<_CopyButton> {
  bool _copied = false;

  void _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.text));
    setState(() => _copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _copy,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: _copied ? _C.success : Colors.transparent,
          border: Border.all(color: _copied ? _C.success : widget.color),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          _copied ? '✓ Copied' : widget.label,
          style: TextStyle(
            color: _copied ? Colors.white : widget.color,
            fontSize: 12, fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

class HostedCheckoutScreen extends StatefulWidget {
  final String slug;
  const HostedCheckoutScreen({super.key, required this.slug});

  @override
  State<HostedCheckoutScreen> createState() => _HostedCheckoutScreenState();
}

class _HostedCheckoutScreenState extends State<HostedCheckoutScreen> {
  // Step management
  String _step = 'info'; // info | method | pay | done
  String? _selectedMethod;

  // Customer info
  final _emailCtrl = TextEditingController();
  final _nameCtrl  = TextEditingController();
  final _phoneCtrl = TextEditingController();

  // Card fields
  final _cardNumCtrl = TextEditingController();
  final _expiryCtrl  = TextEditingController();
  final _cvvCtrl     = TextEditingController();

  // USSD / BNPL options
  String _ussdBankCode = '058';
  int _bnplCount = 3;

  // Mock session data (replace with real tRPC call)
  Map<String, dynamic>? _session;
  bool _isLoading = false;
  bool _isConfirming = false;

  // Mock link data (replace with real tRPC call)
  final Map<String, dynamic> _link = {
    'id': 'pl_demo',
    'amount': 5000000, // kobo
    'currency': 'NGN',
    'description': 'Premium Subscription',
    'merchantId': 'merchant_001',
    'tenantId': 'tenant_001',
  };
  final Map<String, dynamic> _theme = {
    'primaryColor': 0xFF4F46E5,
    'businessName': 'Acme Corp',
    'showPaymentMethods': ['card', 'bank_transfer', 'ussd', 'bnpl'],
  };

  Color get _primaryColor => Color(_theme['primaryColor'] as int? ?? 0xFF4F46E5);
  String get _businessName => _theme['businessName'] as String? ?? 'Merchant';
  List<String> get _showMethods => (_theme['showPaymentMethods'] as List?)?.cast<String>() ?? ['card', 'bank_transfer', 'ussd', 'bnpl'];

  // ── Initiate payment ────────────────────────────────────────────────────
  Future<void> _initiatePayment(String method) async {
    setState(() { _isLoading = true; _selectedMethod = method; });
    try {
      // TODO: replace with real tRPC call
      await Future.delayed(const Duration(seconds: 1));
      setState(() {
        _session = {
          'id': 'sess_${DateTime.now().millisecondsSinceEpoch}',
          'reference': 'PG_${DateTime.now().millisecondsSinceEpoch}_DEMO',
          'amountKobo': _link['amount'],
          'currency': _link['currency'],
          'paymentMethod': method,
          'nipVirtualAccountNumber': '0123456789',
          'nipBankName': 'PayGate Virtual Bank',
          'nipExpiresAt': DateTime.now().add(const Duration(minutes: 30)),
          'ussdCode': '*737*000*123456#',
          'bnplInstallmentKobo': (_link['amount'] as int) ~/ _bnplCount,
          'bnplInstallmentCount': _bnplCount,
          'bnplProvider': 'Carbon',
          'bnplApprovalUrl': 'https://getcarbon.co',
          'usdcWalletAddress': '0x742d35Cc6634C0532925a3b8D4C9E3Db9f1B5c2',
          'usdcNetwork': 'Ethereum',
          'usdcAmountUsdc': 3.14,
          'stripeClientSecret': 'pi_demo_secret',
          'stripePaymentIntentId': 'pi_demo',
        };
        _step = 'pay';
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to initiate payment: $e'), backgroundColor: _C.error),
        );
      }
    }
  }

  // ── Confirm card payment ─────────────────────────────────────────────────
  Future<void> _confirmCardPayment() async {
    setState(() => _isConfirming = true);
    try {
      await Future.delayed(const Duration(seconds: 2));
      setState(() { _step = 'done'; _isConfirming = false; });
    } catch (e) {
      setState(() => _isConfirming = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Payment failed: $e'), backgroundColor: _C.error),
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  @override
  void dispose() {
    _emailCtrl.dispose(); _nameCtrl.dispose(); _phoneCtrl.dispose();
    _cardNumCtrl.dispose(); _expiryCtrl.dispose(); _cvvCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_step == 'done') return _buildSuccess();

    return Scaffold(
      backgroundColor: _C.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(child: _buildBody()),
            _buildFooter(),
          ],
        ),
      ),
    );
  }

  // ── Header ───────────────────────────────────────────────────────────────
  Widget _buildHeader() {
    return Container(
      color: _primaryColor,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: const Icon(Icons.arrow_back, color: Colors.white, size: 22),
          ),
          Expanded(
            child: Column(
              children: [
                Text(_businessName, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(
                  fmtAmount(_link['amount'] as int, currency: _link['currency'] as String),
                  style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800),
                ),
                if (_link['description'] != null)
                  Text(_link['description'] as String,
                    style: const TextStyle(color: Colors.white54, fontSize: 11)),
              ],
            ),
          ),
          const SizedBox(width: 22),
        ],
      ),
    );
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  Widget _buildBody() {
    switch (_step) {
      case 'info':   return _buildInfoStep();
      case 'method': return _buildMethodStep();
      case 'pay':    return _buildPayStep();
      default:       return const SizedBox.shrink();
    }
  }

  // ── Info step ────────────────────────────────────────────────────────────
  Widget _buildInfoStep() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('Your Details'),
          _field('Email address', _emailCtrl, TextInputType.emailAddress, 'you@example.com'),
          _field('Full name', _nameCtrl, TextInputType.name, 'John Doe'),
          _field('Phone number', _phoneCtrl, TextInputType.phone, '+234 801 234 5678'),
          const SizedBox(height: 8),
          _primaryButton('Continue →', _emailCtrl.text.isNotEmpty ? () => setState(() => _step = 'method') : null),
        ],
      ),
    );
  }

  // ── Method step ──────────────────────────────────────────────────────────
  Widget _buildMethodStep() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('Choose payment method'),
          ..._methods
            .where((m) => _showMethods.contains(m.id))
            .map((m) => _methodCard(m)),
          if (_showMethods.contains('ussd')) ...[
            const SizedBox(height: 12),
            _sectionTitle('USSD Bank'),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: [
                {'code': '058', 'name': 'GTBank'},
                {'code': '011', 'name': 'First Bank'},
                {'code': '044', 'name': 'Access'},
                {'code': '057', 'name': 'Zenith'},
                {'code': '033', 'name': 'UBA'},
              ].map((b) => _chipOption(b['code']!, b['name']!, _ussdBankCode, (v) => setState(() => _ussdBankCode = v))).toList(),
            ),
          ],
          if (_showMethods.contains('bnpl')) ...[
            const SizedBox(height: 12),
            _sectionTitle('BNPL Instalments'),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: [2, 3, 6, 12].map((n) =>
                _chipOption('$n', '${n}x', '$_bnplCount', (v) => setState(() => _bnplCount = int.parse(v)))
              ).toList(),
            ),
          ],
        ],
      ),
    );
  }

  // ── Pay step ─────────────────────────────────────────────────────────────
  Widget _buildPayStep() {
    final s = _session!;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Row(
            children: [
              GestureDetector(
                onTap: () => setState(() { _step = 'method'; _session = null; }),
                child: const Text('← Back', style: TextStyle(color: _C.muted, fontSize: 13)),
              ),
              const SizedBox(width: 12),
              Text(
                _methods.firstWhere((m) => m.id == _selectedMethod, orElse: () => const _Method('', 'Payment', '', '')).label,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _C.muted, letterSpacing: 0.5),
              ),
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: _buildPayMethod(s),
          ),
        ),
        if (['bank_transfer', 'ussd'].contains(_selectedMethod))
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: _C.muted)),
                SizedBox(width: 8),
                Text('Waiting for payment confirmation…', style: TextStyle(color: _C.muted, fontSize: 12)),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildPayMethod(Map<String, dynamic> s) {
    switch (_selectedMethod) {
      case 'card':          return _buildCardPay(s);
      case 'bank_transfer': return _buildBankTransfer(s);
      case 'ussd':          return _buildUSSD(s);
      case 'bnpl':          return _buildBNPL(s);
      case 'usdc':          return _buildUSDC(s);
      default:              return const SizedBox.shrink();
    }
  }

  // ── Card payment ─────────────────────────────────────────────────────────
  Widget _buildCardPay(Map<String, dynamic> s) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _field('Card Number', _cardNumCtrl, TextInputType.number, '0000 0000 0000 0000'),
        Row(
          children: [
            Expanded(child: _field('Expiry', _expiryCtrl, TextInputType.number, 'MM/YY')),
            const SizedBox(width: 12),
            Expanded(child: _field('CVV', _cvvCtrl, TextInputType.number, '•••', obscure: true)),
          ],
        ),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: const Color(0xFFF9FAFB), borderRadius: BorderRadius.circular(10)),
          child: const Center(child: Text('🔒 256-bit SSL · PCI DSS Level 1 · 3D Secure', style: TextStyle(fontSize: 11, color: _C.muted))),
        ),
        const SizedBox(height: 12),
        _primaryButton(
          _isConfirming ? 'Processing…' : 'Pay ${fmtAmount(s['amountKobo'] as int, currency: s['currency'] as String)}',
          _isConfirming ? null : _confirmCardPayment,
          loading: _isConfirming,
        ),
      ],
    );
  }

  // ── Bank Transfer ────────────────────────────────────────────────────────
  Widget _buildBankTransfer(Map<String, dynamic> s) {
    final expiresAt = s['nipExpiresAt'] as DateTime?;
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(16)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('TRANSFER TO THIS ACCOUNT', style: TextStyle(color: Color(0xFF1D4ED8), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
              const SizedBox(height: 12),
              _infoRow('Bank Name', s['nipBankName'] as String? ?? 'PayGate Virtual Bank'),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Account Number', style: TextStyle(fontSize: 11, color: _C.muted)),
                      Text(s['nipVirtualAccountNumber'] as String? ?? '—',
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: _primaryColor, letterSpacing: 2, fontFamily: 'monospace')),
                    ],
                  )),
                  _CopyButton(text: s['nipVirtualAccountNumber'] as String? ?? '', label: 'Copy', color: _primaryColor),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Amount (exact)', style: TextStyle(fontSize: 11, color: _C.muted)),
                      Text(fmtAmount(s['amountKobo'] as int, currency: s['currency'] as String),
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _primaryColor)),
                    ],
                  )),
                  _CopyButton(text: '${(s['amountKobo'] as int) / 100}', label: 'Copy', color: _primaryColor),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        if (expiresAt != null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(12)),
            child: Row(children: [const Text('⏱ ', style: TextStyle(fontSize: 14)), _CountdownText(expiresAt: expiresAt)]),
          ),
        const SizedBox(height: 10),
        _instructionsCard([
          '1. Open your mobile banking app',
          '2. Transfer the exact amount to the account above',
          '3. Payment is confirmed automatically within seconds',
          '4. Do not close this screen until confirmation',
        ]),
        const SizedBox(height: 8),
        const Text('⚡ Powered by NIBSS NIP — instant settlement', style: TextStyle(fontSize: 11, color: _C.muted), textAlign: TextAlign.center),
      ],
    );
  }

  // ── USSD ─────────────────────────────────────────────────────────────────
  Widget _buildUSSD(Map<String, dynamic> s) {
    final code = s['ussdCode'] as String? ?? '*737*000*123456#';
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: const Color(0xFFF5F3FF), borderRadius: BorderRadius.circular(16)),
          child: Column(
            children: [
              const Text('DIAL THIS CODE', style: TextStyle(color: Color(0xFF6D28D9), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
              const SizedBox(height: 12),
              Text(code, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: _primaryColor, letterSpacing: 2, fontFamily: 'monospace')),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => launchUrl(Uri.parse('tel:$code')),
                style: ElevatedButton.styleFrom(backgroundColor: _primaryColor, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: const Text('📞 Dial Now', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _instructionsCard([
          '1. Open your phone dialler',
          '2. Dial $code',
          '3. Follow the prompts and enter your PIN',
          '4. Confirm the amount: ${fmtAmount(s['amountKobo'] as int, currency: s['currency'] as String)}',
          '5. Payment confirmed automatically',
        ]),
        const SizedBox(height: 8),
        const Text('📱 Works on all Nigerian networks — no internet required', style: TextStyle(fontSize: 11, color: _C.muted), textAlign: TextAlign.center),
      ],
    );
  }

  // ── BNPL ─────────────────────────────────────────────────────────────────
  Widget _buildBNPL(Map<String, dynamic> s) {
    final installmentKobo = s['bnplInstallmentKobo'] as int? ?? 0;
    final count = s['bnplInstallmentCount'] as int? ?? 3;
    final schedule = List.generate(count, (i) => {
      'label': i == 0 ? 'Today' : 'Month ${i + 1}',
      'amount': installmentKobo,
    });

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(16)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('INSTALMENT PLAN', style: TextStyle(color: Color(0xFF92400E), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
              const SizedBox(height: 12),
              ...schedule.map((item) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(item['label'] as String, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    Text(fmtAmount(item['amount'] as int, currency: s['currency'] as String),
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: _primaryColor, fontFamily: 'monospace')),
                  ],
                ),
              )),
              Divider(color: const Color(0xFFFDE68A)),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total', style: TextStyle(fontSize: 12, color: _C.muted)),
                  Text(fmtAmount(s['amountKobo'] as int, currency: s['currency'] as String),
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, fontFamily: 'monospace')),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _primaryButton('Continue with ${s['bnplProvider'] ?? 'Carbon'} →',
          () => launchUrl(Uri.parse(s['bnplApprovalUrl'] as String? ?? 'https://getcarbon.co'))),
        const SizedBox(height: 8),
        const Text('Subject to credit check · 0% interest · No hidden fees', style: TextStyle(fontSize: 11, color: _C.muted), textAlign: TextAlign.center),
      ],
    );
  }

  // ── USDC ─────────────────────────────────────────────────────────────────
  Widget _buildUSDC(Map<String, dynamic> s) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(16)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('SEND USDC TO THIS ADDRESS', style: TextStyle(color: Color(0xFF4338CA), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
              const SizedBox(height: 12),
              _infoRow('Network', s['usdcNetwork'] as String? ?? 'Ethereum'),
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Wallet Address', style: TextStyle(fontSize: 11, color: _C.muted)),
                      Text(s['usdcWalletAddress'] as String? ?? '0x...',
                        style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: _C.text)),
                    ],
                  )),
                  const SizedBox(width: 8),
                  _CopyButton(text: s['usdcWalletAddress'] as String? ?? '', label: 'Copy', color: _primaryColor),
                ],
              ),
              const SizedBox(height: 8),
              _infoRow('Amount', '${(s['usdcAmountUsdc'] as double?)?.toStringAsFixed(2) ?? '0.00'} USDC'),
            ],
          ),
        ),
      ],
    );
  }

  // ── Success screen ───────────────────────────────────────────────────────
  Widget _buildSuccess() {
    return Scaffold(
      backgroundColor: _C.bg,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 80, height: 80,
                  decoration: BoxDecoration(color: _C.success.withOpacity(0.15), shape: BoxShape.circle),
                  child: const Center(child: Text('✅', style: TextStyle(fontSize: 36))),
                ),
                const SizedBox(height: 20),
                const Text('Payment Successful!', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: _C.text)),
                const SizedBox(height: 8),
                Text(
                  '${fmtAmount(_link['amount'] as int, currency: _link['currency'] as String)} paid to $_businessName',
                  style: const TextStyle(fontSize: 13, color: _C.muted),
                  textAlign: TextAlign.center,
                ),
                if (_session?['reference'] != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: const Color(0xFFF9FAFB), borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      children: [
                        const Text('Reference', style: TextStyle(fontSize: 11, color: _C.muted)),
                        const SizedBox(height: 4),
                        Text(_session!['reference'] as String,
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _primaryColor, fontFamily: 'monospace')),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                _primaryButton('Done', () => Navigator.pop(context)),
                const SizedBox(height: 16),
                Text('Secured by PayGate · CBN Licensed PSP', style: TextStyle(fontSize: 11, color: _primaryColor)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  Widget _buildFooter() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: _C.border)),
      ),
      child: Center(
        child: RichText(
          text: TextSpan(
            style: const TextStyle(fontSize: 11, color: _C.muted),
            children: [
              const TextSpan(text: '🔒 Secured by '),
              TextSpan(text: 'PayGate', style: TextStyle(color: _primaryColor, fontWeight: FontWeight.w700)),
              const TextSpan(text: ' · CBN Licensed PSP'),
            ],
          ),
        ),
      ),
    );
  }

  // ─── Shared Widgets ───────────────────────────────────────────────────────

  Widget _sectionTitle(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Text(text.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _C.muted, letterSpacing: 0.5)),
  );

  Widget _field(String label, TextEditingController ctrl, TextInputType type, String hint, {bool obscure = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _C.muted)),
        const SizedBox(height: 6),
        TextField(
          controller: ctrl,
          keyboardType: type,
          obscureText: obscure,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: _C.muted, fontSize: 13),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: _C.border)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: _C.border)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: _primaryColor, width: 2)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
          style: const TextStyle(fontSize: 14, color: _C.text),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _primaryButton(String label, VoidCallback? onTap, {bool loading = false}) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: onTap == null ? _primaryColor.withOpacity(0.5) : _primaryColor,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: loading
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
          : Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
      ),
    );
  }

  Widget _methodCard(_Method m) {
    return GestureDetector(
      onTap: _isLoading ? null : () => _initiatePayment(m.id),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _C.border),
        ),
        child: Row(
          children: [
            Text(m.icon, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 14),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _C.text)),
                Text(m.sub, style: const TextStyle(fontSize: 12, color: _C.muted)),
              ],
            )),
            if (_isLoading && _selectedMethod == m.id)
              const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
            else
              const Text('›', style: TextStyle(fontSize: 20, color: _C.muted)),
          ],
        ),
      ),
    );
  }

  Widget _chipOption(String value, String label, String selected, ValueChanged<String> onTap) {
    final isSelected = selected == value;
    return GestureDetector(
      onTap: () => onTap(value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? _primaryColor.withOpacity(0.1) : Colors.transparent,
          border: Border.all(color: isSelected ? _primaryColor : _C.border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(label, style: TextStyle(fontSize: 12, color: isSelected ? _primaryColor : _C.text, fontWeight: FontWeight.w600)),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: _C.muted)),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _C.text)),
      ],
    );
  }

  Widget _instructionsCard(List<String> steps) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: const Color(0xFFF9FAFB), borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Instructions', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _C.text)),
          const SizedBox(height: 8),
          ...steps.map((s) => Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(s, style: const TextStyle(fontSize: 12, color: _C.muted)),
          )),
        ],
      ),
    );
  }
}
