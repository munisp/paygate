import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

// ─── Models ──────────────────────────────────────────────────────────────────

class VirtualCardFull {
  final String id;
  final String label;
  final String maskedNumber;
  final String cardholderName;
  final String expiryDate;
  final String status;
  final double balanceNgn;
  final double spendLimitNgn;
  final double spentThisMonthNgn;
  final List<CardTransaction> recentTransactions;
  final List<String> allowedMerchantCategories;
  final bool onlineTransactionsEnabled;
  final bool internationalEnabled;
  final bool contactlessEnabled;

  const VirtualCardFull({
    required this.id,
    required this.label,
    required this.maskedNumber,
    required this.cardholderName,
    required this.expiryDate,
    required this.status,
    required this.balanceNgn,
    required this.spendLimitNgn,
    required this.spentThisMonthNgn,
    required this.recentTransactions,
    required this.allowedMerchantCategories,
    required this.onlineTransactionsEnabled,
    required this.internationalEnabled,
    required this.contactlessEnabled,
  });
}

class CardTransaction {
  final String id;
  final String merchant;
  final double amountNgn;
  final String status;
  final DateTime date;

  const CardTransaction({
    required this.id,
    required this.merchant,
    required this.amountNgn,
    required this.status,
    required this.date,
  });
}

// ─── Provider ────────────────────────────────────────────────────────────────

final virtualCardFullProvider =
    FutureProvider.family<VirtualCardFull, String>((ref, cardId) async {
  await Future.delayed(const Duration(milliseconds: 500));
  return VirtualCardFull(
    id: cardId,
    label: 'Operations Card',
    maskedNumber: '**** **** **** 4242',
    cardholderName: 'MERCHANT ADMIN',
    expiryDate: '12/27',
    status: 'active',
    balanceNgn: 250_000,
    spendLimitNgn: 500_000,
    spentThisMonthNgn: 87_500,
    onlineTransactionsEnabled: true,
    internationalEnabled: false,
    contactlessEnabled: true,
    allowedMerchantCategories: ['Software', 'Cloud Services', 'Office Supplies'],
    recentTransactions: [
      CardTransaction(
        id: 'txn_1',
        merchant: 'AWS Nigeria',
        amountNgn: 45_000,
        status: 'completed',
        date: DateTime.now().subtract(const Duration(hours: 2)),
      ),
      CardTransaction(
        id: 'txn_2',
        merchant: 'Google Workspace',
        amountNgn: 12_500,
        status: 'completed',
        date: DateTime.now().subtract(const Duration(days: 1)),
      ),
      CardTransaction(
        id: 'txn_3',
        merchant: 'Zoom Video',
        amountNgn: 8_000,
        status: 'completed',
        date: DateTime.now().subtract(const Duration(days: 3)),
      ),
    ],
  );
});

// ─── Screen ──────────────────────────────────────────────────────────────────

class VirtualCardsFullScreen extends ConsumerStatefulWidget {
  final String cardId;
  const VirtualCardsFullScreen({super.key, required this.cardId});

  @override
  ConsumerState<VirtualCardsFullScreen> createState() =>
      _VirtualCardsFullScreenState();
}

class _VirtualCardsFullScreenState
    extends ConsumerState<VirtualCardsFullScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cardAsync =
        ref.watch(virtualCardFullProvider(widget.cardId));

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'Card Details',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        bottom: TabBar(
          controller: _tabs,
          labelColor: const Color(0xFF6366F1),
          unselectedLabelColor: const Color(0xFF64748B),
          indicatorColor: const Color(0xFF6366F1),
          tabs: const [
            Tab(text: 'Overview'),
            Tab(text: 'Transactions'),
            Tab(text: 'Controls'),
          ],
        ),
      ),
      body: cardAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Color(0xFF6366F1)),
        ),
        error: (e, _) => Center(
          child: Text('Error: $e', style: const TextStyle(color: Colors.red)),
        ),
        data: (card) => TabBarView(
          controller: _tabs,
          children: [
            _OverviewTab(card: card),
            _TransactionsTab(transactions: card.recentTransactions),
            _ControlsTab(card: card),
          ],
        ),
      ),
    );
  }
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

class _OverviewTab extends StatelessWidget {
  final VirtualCardFull card;
  const _OverviewTab({required this.card});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##0.00', 'en_NG');
    final spendPct = card.spendLimitNgn > 0
        ? card.spentThisMonthNgn / card.spendLimitNgn
        : 0.0;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Card Visual
          Container(
            height: 180,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(card.label,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold)),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        card.status.toUpperCase(),
                        style: const TextStyle(
                            color: Colors.white, fontSize: 10),
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                Text(card.maskedNumber,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        letterSpacing: 4,
                        fontFamily: 'monospace')),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(card.cardholderName,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 12)),
                    Text('EXP ${card.expiryDate}',
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 12)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Balance + Spend
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: 'Balance',
                  value: '₦${fmt.format(card.balanceNgn)}',
                  color: const Color(0xFF10B981),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  label: 'Spend Limit',
                  value: '₦${fmt.format(card.spendLimitNgn)}',
                  color: const Color(0xFF6366F1),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Spend progress
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Monthly Spend',
                        style: TextStyle(
                            color: Color(0xFF94A3B8), fontSize: 13)),
                    Text(
                      '₦${fmt.format(card.spentThisMonthNgn)} / ₦${fmt.format(card.spendLimitNgn)}',
                      style: const TextStyle(
                          color: Colors.white, fontSize: 13),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                LinearProgressIndicator(
                  value: spendPct.clamp(0.0, 1.0),
                  backgroundColor: const Color(0xFF334155),
                  valueColor: AlwaysStoppedAnimation<Color>(
                    spendPct > 0.8
                        ? const Color(0xFFEF4444)
                        : const Color(0xFF6366F1),
                  ),
                  minHeight: 8,
                  borderRadius: BorderRadius.circular(4),
                ),
                const SizedBox(height: 4),
                Text(
                  '${(spendPct * 100).toStringAsFixed(1)}% used',
                  style: const TextStyle(
                      color: Color(0xFF64748B), fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────

class _TransactionsTab extends StatelessWidget {
  final List<CardTransaction> transactions;
  const _TransactionsTab({required this.transactions});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##0.00', 'en_NG');

    if (transactions.isEmpty) {
      return const Center(
        child: Text('No transactions yet',
            style: TextStyle(color: Color(0xFF64748B))),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: transactions.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final txn = transactions[i];
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: const Color(0xFF6366F1).withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.shopping_bag_outlined,
                    color: Color(0xFF6366F1), size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(txn.merchant,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w500)),
                    Text(
                      '${txn.date.day}/${txn.date.month}/${txn.date.year}',
                      style: const TextStyle(
                          color: Color(0xFF64748B), fontSize: 12),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '-₦${fmt.format(txn.amountNgn)}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.bold),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      txn.status,
                      style: const TextStyle(
                          color: Color(0xFF10B981), fontSize: 10),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─── Controls Tab ─────────────────────────────────────────────────────────────

class _ControlsTab extends ConsumerStatefulWidget {
  final VirtualCardFull card;
  const _ControlsTab({required this.card});

  @override
  ConsumerState<_ControlsTab> createState() => _ControlsTabState();
}

class _ControlsTabState extends ConsumerState<_ControlsTab> {
  late bool _online;
  late bool _international;
  late bool _contactless;

  @override
  void initState() {
    super.initState();
    _online = widget.card.onlineTransactionsEnabled;
    _international = widget.card.internationalEnabled;
    _contactless = widget.card.contactlessEnabled;
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Transaction Controls',
              style: TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5)),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                _ControlToggle(
                  label: 'Online Transactions',
                  subtitle: 'Allow card to be used for online purchases',
                  value: _online,
                  icon: Icons.language,
                  onChanged: (v) => setState(() => _online = v),
                ),
                const Divider(color: Color(0xFF334155), height: 1),
                _ControlToggle(
                  label: 'International Transactions',
                  subtitle: 'Allow card to be used outside Nigeria',
                  value: _international,
                  icon: Icons.flight_outlined,
                  onChanged: (v) => setState(() => _international = v),
                ),
                const Divider(color: Color(0xFF334155), height: 1),
                _ControlToggle(
                  label: 'Contactless Payments',
                  subtitle: 'Allow tap-to-pay transactions',
                  value: _contactless,
                  icon: Icons.contactless_outlined,
                  onChanged: (v) => setState(() => _contactless = v),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Allowed categories
          const Text('Allowed Merchant Categories',
              style: TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: widget.card.allowedMerchantCategories
                .map((cat) => Chip(
                      label: Text(cat,
                          style: const TextStyle(
                              color: Color(0xFF6366F1), fontSize: 12)),
                      backgroundColor:
                          const Color(0xFF6366F1).withOpacity(0.1),
                      side: BorderSide(
                          color: const Color(0xFF6366F1).withOpacity(0.3)),
                    ))
                .toList(),
          ),
          const SizedBox(height: 24),

          // Danger zone
          const Text('Danger Zone',
              style: TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.pause_circle_outline,
                      color: Color(0xFFF59E0B)),
                  label: const Text('Freeze Card',
                      style: TextStyle(color: Color(0xFFF59E0B))),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Color(0xFFF59E0B)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onPressed: () {},
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.cancel_outlined,
                      color: Color(0xFFEF4444)),
                  label: const Text('Terminate',
                      style: TextStyle(color: Color(0xFFEF4444))),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Color(0xFFEF4444)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onPressed: () {},
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  color: Color(0xFF94A3B8), fontSize: 12)),
          const SizedBox(height: 4),
          Text(value,
              style: TextStyle(
                  color: color,
                  fontSize: 16,
                  fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

class _ControlToggle extends StatelessWidget {
  final String label;
  final String subtitle;
  final bool value;
  final IconData icon;
  final ValueChanged<bool> onChanged;

  const _ControlToggle({
    required this.label,
    required this.subtitle,
    required this.value,
    required this.icon,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF64748B), size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w500)),
                Text(subtitle,
                    style: const TextStyle(
                        color: Color(0xFF64748B), fontSize: 12)),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: const Color(0xFF6366F1),
          ),
        ],
      ),
    );
  }
}
