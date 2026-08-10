import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

enum RefundStatus {
  pending,
  approved,
  rejected,
  failed,
  completed,
}

class Refund {
  final String id;
  final String transactionId;
  final double amount;
  final String currency;
  final String status;
  final DateTime createdAt;
  final String reason;

  Refund({
    required this.id,
    required this.transactionId,
    required this.amount,
    required this.currency,
    required this.status,
    required this.createdAt,
    required this.reason,
  });

  factory Refund.fromJson(Map<String, dynamic> json) {
    return Refund(
      id: json['id'],
      transactionId: json['transactionId'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      status: json['status'],
      createdAt: DateTime.parse(json['createdAt']),
      reason: json['reason'],
    );
  }
}

class RefundState {
  final bool isLoading;
  final String? errorMessage;
  final List<Refund> refunds;
  final String searchQuery;
  final RefundStatus? filterStatus;

  RefundState({
    this.isLoading = false,
    this.errorMessage,
    this.refunds = const [],
    this.searchQuery = '',
    this.filterStatus,
  });

  RefundState copyWith({
    bool? isLoading,
    String? errorMessage,
    List<Refund>? refunds,
    String? searchQuery,
    RefundStatus? filterStatus,
  }) {
    return RefundState(
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage ?? this.errorMessage,
      refunds: refunds ?? this.refunds,
      searchQuery: searchQuery ?? this.searchQuery,
      filterStatus: filterStatus ?? this.filterStatus,
    );
  }
}

class RefundsNotifier extends StateNotifier<RefundState> {
  final ApiService apiService;
  RefundsNotifier(this.apiService) : super(RefundState()) {
    fetchRefunds();
  }

  List<Refund> get filteredRefunds {
    List<Refund> currentRefunds = state.refunds;

    if (state.searchQuery.isNotEmpty) {
      currentRefunds = currentRefunds.where((refund) =>
          refund.id.toLowerCase().contains(state.searchQuery.toLowerCase()) ||
          refund.transactionId.toLowerCase().contains(state.searchQuery.toLowerCase()) ||
          refund.reason.toLowerCase().contains(state.searchQuery.toLowerCase())
      ).toList();
    }

    if (state.filterStatus != null) {
      currentRefunds = currentRefunds.where((refund) =>
          refund.status.toLowerCase() == state.filterStatus!.name.toLowerCase()
      ).toList();
    }
    return currentRefunds;
  }

  Future<void> fetchRefunds() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      // Simulate API call delay
      await Future.delayed(const Duration(seconds: 1));
      final response = await apiService.get('/trpc/refunds.list');
      final List<Refund> fetchedRefunds = (response as List)
          .map((json) => Refund.fromJson(json as Map<String, dynamic>))
          .toList();
      state = state.copyWith(isLoading: false, refunds: fetchedRefunds);
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: e.toString());
    }
  }

  Future<void> createRefund({required String transactionId, required double amount, required String currency, required String reason}) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final newRefundData = {
        'transactionId': transactionId,
        'amount': amount,
        'currency': currency,
        'reason': reason,
      };
      final response = await apiService.post('/trpc/refunds.create', body: newRefundData);
      final newRefund = Refund.fromJson(response as Map<String, dynamic>);
      state = state.copyWith(isLoading: false, refunds: [...state.refunds, newRefund]);
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: e.toString());
    }
  }

  Future<void> updateRefund({required String id, String? transactionId, double? amount, String? currency, String? status, String? reason}) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final updateData = {
        'id': id,
        if (transactionId != null) 'transactionId': transactionId,
        if (amount != null) 'amount': amount,
        if (currency != null) 'currency': currency,
        if (status != null) 'status': status,
        if (reason != null) 'reason': reason,
      };
      final response = await apiService.post('/trpc/refunds.update', body: updateData);
      final updatedRefund = Refund.fromJson(response as Map<String, dynamic>);
      state = state.copyWith(
        isLoading: false,
        refunds: state.refunds.map((r) => r.id == id ? updatedRefund : r).toList(),
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: e.toString());
    }
  }

  Future<void> deleteRefund(String id) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      await apiService.post('/trpc/refunds.delete', body: {'id': id});
      state = state.copyWith(
        isLoading: false,
        refunds: state.refunds.where((r) => r.id != id).toList(),
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: e.toString());
    }
  }

  void updateSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
  }

  void updateFilterStatus(RefundStatus? status) {
    state = state.copyWith(filterStatus: status);
  }
}

final refundsProvider = StateNotifierProvider<RefundsNotifier, RefundState>((ref) {
  return RefundsNotifier(ref.read(apiServiceProvider));
});

final filteredRefundsProvider = Provider<List<Refund>>((ref) {
  final refundsNotifier = ref.watch(refundsProvider.notifier);
  return refundsNotifier.filteredRefunds;
});

class RefundWorkflowScreen extends ConsumerStatefulWidget {
  const RefundWorkflowScreen({super.key});

  @override
  ConsumerState<RefundWorkflowScreen> createState() => _RefundWorkflowScreenState();
}

class _RefundWorkflowScreenState extends ConsumerState<RefundWorkflowScreen> {
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(refundsProvider.notifier).updateSearchQuery(_searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Widget _buildStatusBadge(RefundStatus status) {
    Color badgeColor;
    switch (status) {
      case RefundStatus.pending:
        badgeColor = Colors.orange;
        break;
      case RefundStatus.approved:
        badgeColor = Colors.green;
        break;
      case RefundStatus.rejected:
        badgeColor = Colors.red;
        break;
      case RefundStatus.failed:
        badgeColor = Colors.deepOrange;
        break;
      case RefundStatus.completed:
        badgeColor = Colors.blue;
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status.name.toUpperCase(),
        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }

  void _showCreateRefundDialog() {
    final _transactionIdController = TextEditingController();
    final _amountController = TextEditingController();
    final _currencyController = TextEditingController(text: 'NGN');
    final _reasonController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Create New Refund', style: TextStyle(color: _textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _transactionIdController,
                decoration: InputDecoration(
                  labelText: 'Transaction ID',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _currencyController,
                decoration: InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _reasonController,
                decoration: InputDecoration(
                  labelText: 'Reason',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
                maxLines: 3,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () {
              final transactionId = _transactionIdController.text;
              final amount = double.tryParse(_amountController.text) ?? 0.0;
              final currency = _currencyController.text;
              final reason = _reasonController.text;

              if (transactionId.isNotEmpty && amount > 0 && currency.isNotEmpty && reason.isNotEmpty) {
                ref.read(refundsProvider.notifier).createRefund(
                  transactionId: transactionId,
                  amount: amount,
                  currency: currency,
                  reason: reason,
                );
                Navigator.of(context).pop();
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
            child: const Text('Create', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showEditRefundDialog(Refund refund) {
    final _transactionIdController = TextEditingController(text: refund.transactionId);
    final _amountController = TextEditingController(text: refund.amount.toString());
    final _currencyController = TextEditingController(text: refund.currency);
    final _reasonController = TextEditingController(text: refund.reason);
    RefundStatus? _selectedStatus = RefundStatus.values.firstWhere(
            (e) => e.name.toLowerCase() == refund.status.toLowerCase(),
        orElse: () => RefundStatus.pending
    );

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Edit Refund', style: TextStyle(color: _textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _transactionIdController,
                decoration: InputDecoration(
                  labelText: 'Transaction ID',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _currencyController,
                decoration: InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<RefundStatus>(
                value: _selectedStatus,
                dropdownColor: _cardColor,
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                items: RefundStatus.values.map((status) => DropdownMenuItem(
                  value: status,
                  child: Text(status.name.capitalize(), style: const TextStyle(color: _textColor)),
                )).toList(),
                onChanged: (status) {
                  // This setState is inside a dialog, so it needs to be managed locally or passed up.
                  // For simplicity, we'll update the local variable and rely on the dialog rebuild.
                  _selectedStatus = status;
                },
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _reasonController,
                decoration: InputDecoration(
                  labelText: 'Reason',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
                maxLines: 3,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () {
              final transactionId = _transactionIdController.text;
              final amount = double.tryParse(_amountController.text);
              final currency = _currencyController.text;
              final reason = _reasonController.text;

              ref.read(refundsProvider.notifier).updateRefund(
                id: refund.id,
                transactionId: transactionId,
                amount: amount,
                currency: currency,
                status: _selectedStatus?.name,
                reason: reason,
              );
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
            child: const Text('Save', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmationDialog(Refund refund) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Delete Refund', style: TextStyle(color: _textColor)),
        content: Text('Are you sure you want to delete refund ${refund.id}?', style: const TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () {
              ref.read(refundsProvider.notifier).deleteRefund(refund.id);
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final refundState = ref.watch(refundsProvider);
    final filteredRefunds = ref.watch(filteredRefundsProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Refund Workflow', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          PopupMenuButton<RefundStatus?>(
            icon: const Icon(Icons.filter_list),
            onSelected: (RefundStatus? status) {
              ref.read(refundsProvider.notifier).updateFilterStatus(status);
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<RefundStatus?>>[
              const PopupMenuItem<RefundStatus?>(
                value: null,
                child: Text('All', style: TextStyle(color: _textColor)),
              ),
              ...RefundStatus.values.map((status) => PopupMenuItem<RefundStatus?>(
                value: status,
                child: Text(status.name.capitalize(), style: const TextStyle(color: _textColor)),
              )).toList(),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(refundsProvider.notifier).fetchRefunds(),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search refunds...', 
                  hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: _textColor),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: _cardColor,
                ),
                style: const TextStyle(color: _textColor),
              ),
            ),
            Expanded(
              child: Builder(
                builder: (context) {
                  if (refundState.isLoading) {
                    return const Center(
                      child: CircularProgressIndicator(color: _accentColor),
                    );
                  } else if (refundState.errorMessage != null) {
                    return Center(
                      child: Text(
                        'Error: ${refundState.errorMessage}',
                        style: const TextStyle(color: Colors.redAccent, fontSize: 16),
                      ),
                    );
                  } else if (filteredRefunds.isEmpty) {
                    return Center(
                      child: Text(
                        'No refunds found.',
                        style: TextStyle(color: _textColor, fontSize: 18),
                      ),
                    );
                  } else {
                    return ListView.builder(
                      itemCount: filteredRefunds.length,
                      itemBuilder: (context, index) {
                        final refund = filteredRefunds[index];
                        return Card(
                          color: _cardColor,
                          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      'Refund ID: ${refund.id}',
                                      style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold),
                                    ),
                                    _buildStatusBadge(RefundStatus.values.firstWhere(
                                            (e) => e.name.toLowerCase() == refund.status.toLowerCase(),
                                        orElse: () => RefundStatus.pending // Default status if not found
                                    )),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text('Transaction ID: ${refund.transactionId}', style: const TextStyle(color: _textColor)),
                                Text(
                                  'Amount: ${refund.currency == 'NGN' ? '₦' : '$'}${refund.amount.toStringAsFixed(2)}',
                                  style: const TextStyle(color: _textColor),
                                ),
                                Text(
                                  'Date: ${refund.createdAt.toLocal().toIso8601String().split('T')[0]}',
                                  style: const TextStyle(color: _textColor),
                                ),
                                Text('Reason: ${refund.reason}', style: const TextStyle(color: _textColor)),
                                const SizedBox(height: 8),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.edit, color: _accentColor),
                                      onPressed: () => _showEditRefundDialog(refund),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete, color: Colors.redAccent),
                                      onPressed: () => _showDeleteConfirmationDialog(refund),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    );
                  }
                },
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateRefundDialog,
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }
}

extension StringExtension on String {
  String capitalize() {
    return "${this[0].toUpperCase()}${substring(1).toLowerCase()}";
  }
}
