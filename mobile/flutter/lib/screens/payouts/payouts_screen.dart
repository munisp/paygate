import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

// --- Theme Constants ---
const kBgColor = Color(0xFF0F172A);
const kSurfaceColor = Color(0xFF1E293B);
const kBorderColor = Color(0xFF334155);
const kPrimaryColor = Color(0xFF3B82F6);
const kTextColor = Color(0xFFF1F5F9);
const kMutedColor = Color(0xFF94A3B8);
const kSuccessColor = Color(0xFF10B981);
const kErrorColor = Color(0xFFEF4444);
const kWarningColor = Color(0xFFF59E0B);

// --- Models ---
enum PayoutStatus { all, pending, processing, completed, failed }

class Payout {
  final String id;
  final double amount;
  final String accountNumber;
  final String bankCode;
  final String narration;
  final PayoutStatus status;
  final DateTime createdAt;

  Payout({
    required this.id,
    required this.amount,
    required this.accountNumber,
    required this.bankCode,
    required this.narration,
    required this.status,
    required this.createdAt,
  });

  factory Payout.fromJson(Map<String, dynamic> json) {
    return Payout(
      id: json['id'],
      amount: (json['amount'] as num).toDouble(),
      accountNumber: json['account_number'],
      bankCode: json['bank_code'],
      narration: json['narration'],
      status: PayoutStatus.values.firstWhere(
        (e) => e.name == json['status'],
        orElse: () => PayoutStatus.pending,
      ),
      createdAt: DateTime.parse(json['created_at']),
    );
  }
}

class PayoutStats {
  final double totalPendingAmount;
  final int pendingCount;

  PayoutStats({required this.totalPendingAmount, required this.pendingCount});
}

// --- Mock API Service (Representing the real ApiService) ---
class ApiService {
  Future<List<Payout>> getPayouts({PayoutStatus? status, int page = 1}) async {
    await Future.delayed(const Duration(seconds: 1));
    // Mock data generation
    return List.generate(10, (index) => Payout(
      id: 'PAY-${1000 + index + (page * 10)}',
      amount: 500.0 + (index * 100),
      accountNumber: '012345678$index',
      bankCode: '044',
      narration: 'Payout for services $index',
      status: status == PayoutStatus.all || status == null 
          ? PayoutStatus.values[index % 4 + 1] 
          : status,
      createdAt: DateTime.now().subtract(Duration(days: index)),
    ));
  }

  Future<PayoutStats> getPayoutStats() async {
    await Future.delayed(const Duration(milliseconds: 500));
    return PayoutStats(totalPendingAmount: 12500.50, pendingCount: 12);
  }

  Future<void> createPayout(Map<String, dynamic> data) async {
    await Future.delayed(const Duration(seconds: 1));
  }

  Future<void> updatePayoutStatus(String id, String action) async {
    await Future.delayed(const Duration(milliseconds: 800));
  }
}

final apiServiceProvider = Provider((ref) => ApiService());

// --- State Management ---
final payoutStatusProvider = StateProvider<PayoutStatus>((ref) => PayoutStatus.all);

final payoutsProvider = FutureProvider.family<List<Payout>, int>((ref, page) async {
  final api = ref.watch(apiServiceProvider);
  final status = ref.watch(payoutStatusProvider);
  return api.getPayouts(status: status == PayoutStatus.all ? null : status, page: page);
});

final payoutStatsProvider = FutureProvider((ref) async {
  return ref.watch(apiServiceProvider).getPayoutStats();
});

// --- Main Screen ---
class PayoutsScreen extends ConsumerStatefulWidget {
  const PayoutsScreen({super.key});

  @override
  ConsumerState<PayoutsScreen> createState() => _PayoutsScreenState();
}

class _PayoutsScreenState extends ConsumerState<PayoutsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  int _currentPage = 1;
  final List<Payout> _allPayouts = [];
  bool _isLoadingMore = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        ref.read(payoutStatusProvider.notifier).state = PayoutStatus.values[_tabController.index];
        _refresh();
      }
    });
  }

  Future<void> _refresh() async {
    setState(() {
      _currentPage = 1;
      _allPayouts.clear();
    });
    ref.invalidate(payoutsProvider);
    ref.invalidate(payoutStatsProvider);
  }

  Future<void> _loadMore() async {
    if (_isLoadingMore) return;
    setState(() => _isLoadingMore = true);
    _currentPage++;
    try {
      final newPayouts = await ref.read(payoutsProvider(_currentPage).future);
      setState(() {
        _allPayouts.addAll(newPayouts);
        _isLoadingMore = false;
      });
    } catch (e) {
      setState(() => _isLoadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statsAsync = ref.watch(payoutStatsProvider);
    final payoutsAsync = ref.watch(payoutsProvider(_currentPage));

    return Scaffold(
      backgroundColor: kBgColor,
      appBar: AppBar(
        backgroundColor: kBgColor,
        elevation: 0,
        title: const Text('Payouts', style: TextStyle(color: kTextColor, fontWeight: FontWeight.bold)),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: kPrimaryColor,
          labelColor: kPrimaryColor,
          unselectedLabelColor: kMutedColor,
          tabs: PayoutStatus.values.map((s) => Tab(text: s.name.toUpperCase())).toList(),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        color: kPrimaryColor,
        child: CustomScrollView(
          slivers: [
            // Stats Row
            SliverToBoxAdapter(
              child: statsAsync.when(
                data: (stats) => _buildStatsRow(stats),
                loading: () => const LinearProgressIndicator(backgroundColor: kBgColor, color: kPrimaryColor),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            
            // Payouts List
            payoutsAsync.when(
              data: (payouts) {
                if (_currentPage == 1 && _allPayouts.isEmpty) {
                  _allPayouts.addAll(payouts);
                }
                
                if (_allPayouts.isEmpty) {
                  return const SliverFillRemaining(
                    child: Center(child: Text('No payouts found', style: TextStyle(color: kMutedColor))),
                  );
                }

                return SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      if (index == _allPayouts.length) {
                        return _buildLoadMoreButton();
                      }
                      return _PayoutListItem(payout: _allPayouts[index]);
                    },
                    childCount: _allPayouts.length + 1,
                  ),
                );
              },
              loading: () => const SliverFillRemaining(
                child: Center(child: CircularProgressIndicator(color: kPrimaryColor)),
              ),
              error: (err, _) => SliverFillRemaining(
                child: Center(child: Text('Error: $err', style: const TextStyle(color: kErrorColor))),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreatePayoutSheet(context),
        backgroundColor: kPrimaryColor,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildStatsRow(PayoutStats stats) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kSurfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kBorderColor),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Total Pending', style: TextStyle(color: kMutedColor, fontSize: 12)),
              const SizedBox(height: 4),
              Text(
                NumberFormat.currency(symbol: '$').format(stats.totalPendingAmount),
                style: const TextStyle(color: kTextColor, fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: kPrimaryColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              '${stats.pendingCount} Pending',
              style: const TextStyle(color: kPrimaryColor, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadMoreButton() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Center(
        child: _isLoadingMore
            ? const CircularProgressIndicator(color: kPrimaryColor)
            : TextButton(
                onPressed: _loadMore,
                child: const Text('Load More', style: TextStyle(color: kPrimaryColor)),
              ),
      ),
    );
  }

  void _showCreatePayoutSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: kBgColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => _CreatePayoutForm(),
    );
  }
}

class _PayoutListItem extends ConsumerWidget {
  final Payout payout;
  const _PayoutListItem({required this.payout});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusColor = _getStatusColor(payout.status);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kSurfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kBorderColor),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(payout.id, style: const TextStyle(color: kMutedColor, fontSize: 12)),
                  const SizedBox(height: 4),
                  Text(
                    NumberFormat.currency(symbol: '$').format(payout.amount),
                    style: const TextStyle(color: kTextColor, fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  payout.status.name.toUpperCase(),
                  style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          const Divider(color: kBorderColor, height: 24),
          Row(
            children: [
              const Icon(Icons.account_balance, color: kMutedColor, size: 16),
              const SizedBox(width: 8),
              Text('${payout.bankCode} • ${payout.accountNumber}', style: const TextStyle(color: kTextColor, fontSize: 13)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.notes, color: kMutedColor, size: 16),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  payout.narration,
                  style: const TextStyle(color: kMutedColor, fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          if (payout.status == PayoutStatus.pending) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _handleAction(context, ref, 'reject'),
                    style: OutlinedButton.styleFrom(foregroundColor: kErrorColor, side: const BorderSide(color: kErrorColor)),
                    child: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _handleAction(context, ref, 'approve'),
                    style: ElevatedButton.styleFrom(backgroundColor: kSuccessColor, foregroundColor: Colors.white),
                    child: const Text('Approve'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Color _getStatusColor(PayoutStatus status) {
    switch (status) {
      case PayoutStatus.completed: return kSuccessColor;
      case PayoutStatus.pending: return kWarningColor;
      case PayoutStatus.processing: return kPrimaryColor;
      case PayoutStatus.failed: return kErrorColor;
      default: return kMutedColor;
    }
  }

  Future<void> _handleAction(BuildContext context, WidgetRef ref, String action) async {
    try {
      await ref.read(apiServiceProvider).updatePayoutStatus(payout.id, action);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Payout $action successfully')));
      ref.invalidate(payoutsProvider);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to $action payout'), backgroundColor: kErrorColor));
    }
  }
}

class _CreatePayoutForm extends ConsumerStatefulWidget {
  @override
  ConsumerState<_CreatePayoutForm> createState() => _CreatePayoutFormState();
}

class _CreatePayoutFormState extends ConsumerState<_CreatePayoutForm> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _accountController = TextEditingController();
  final _bankController = TextEditingController();
  final _narrationController = TextEditingController();
  bool _isSubmitting = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 20,
        right: 20,
        top: 20,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Create Payout', style: TextStyle(color: kTextColor, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 24),
              _buildTextField('Amount', _amountController, TextInputType.number, (v) => v!.isEmpty ? 'Required' : null),
              const SizedBox(height: 16),
              _buildTextField('Account Number', _accountController, TextInputType.number, (v) => v!.length < 10 ? 'Invalid account' : null),
              const SizedBox(height: 16),
              _buildTextField('Bank Code', _bankController, TextInputType.text, (v) => v!.isEmpty ? 'Required' : null),
              const SizedBox(height: 16),
              _buildTextField('Narration', _narrationController, TextInputType.text, (v) => v!.isEmpty ? 'Required' : null),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _submit,
                  style: ElevatedButton.styleFrom(backgroundColor: kPrimaryColor, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                  child: _isSubmitting 
                      ? const CircularProgressIndicator(color: Colors.white) 
                      : const Text('Submit Payout', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(String label, TextEditingController controller, TextInputType type, String? Function(String?)? validator) {
    return TextFormField(
      controller: controller,
      keyboardType: type,
      validator: validator,
      style: const TextStyle(color: kTextColor),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: kMutedColor),
        enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: kBorderColor), borderRadius: BorderRadius.circular(8)),
        focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: kPrimaryColor), borderRadius: BorderRadius.circular(8)),
        errorBorder: OutlineInputBorder(borderSide: const BorderSide(color: kErrorColor), borderRadius: BorderRadius.circular(8)),
        focusedErrorBorder: OutlineInputBorder(borderSide: const BorderSide(color: kErrorColor), borderRadius: BorderRadius.circular(8)),
        filled: true,
        fillColor: kSurfaceColor,
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSubmitting = true);
    try {
      await ref.read(apiServiceProvider).createPayout({
        'amount': double.parse(_amountController.text),
        'account_number': _accountController.text,
        'bank_code': _bankController.text,
        'narration': _narrationController.text,
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payout created successfully')));
        ref.invalidate(payoutsProvider);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: kErrorColor));
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}
