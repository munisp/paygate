import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

enum CarbonCreditStatus {
  active,
  retired,
  pending,
  rejected,
}

class CarbonCredit {
  final String id;
  final String name;
  final double amount;
  final String currency;
  final DateTime issueDate;
  final DateTime retirementDate;
  final CarbonCreditStatus status;

  CarbonCredit({
    required this.id,
    required this.name,
    required this.amount,
    required this.currency,
    required this.issueDate,
    required this.retirementDate,
    required this.status,
  });

  factory CarbonCredit.fromJson(Map<String, dynamic> json) {
    return CarbonCredit(
      id: json['id'] as String,
      name: json['name'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      issueDate: DateTime.parse(json['issueDate'] as String),
      retirementDate: DateTime.parse(json['retirementDate'] as String),
      status: CarbonCreditStatus.values.firstWhere(
          (e) => e.toString().split('.').last == json['status'] as String),
    );
  }
}

final carbonCreditsProvider = FutureProvider.family<
    List<CarbonCredit>, String>((ref, searchTerm) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get(
      '/trpc/carbonCredits.list', params: {'searchTerm': searchTerm});
  return (response['carbonCredits'] as List)
      .map((e) => CarbonCredit.fromJson(e))
      .toList();
});

class CarbonCreditsLedgerScreen extends ConsumerStatefulWidget {
  const CarbonCreditsLedgerScreen({super.key});

  @override
  ConsumerState<CarbonCreditsLedgerScreen> createState() =>
      _CarbonCreditsLedgerScreenState();
}

class _CarbonCreditsLedgerScreenState
    extends ConsumerState<CarbonCreditsLedgerScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchTerm = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchTerm = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshCarbonCredits() async {
    ref.refresh(carbonCreditsProvider(_searchTerm));
  }

  Color _getStatusColor(CarbonCreditStatus status) {
    switch (status) {
      case CarbonCreditStatus.active:
        return Colors.green;
      case CarbonCreditStatus.retired:
        return Colors.blueGrey;
      case CarbonCreditStatus.pending:
        return Colors.orange;
      case CarbonCreditStatus.rejected:
        return Colors.red;
    }
  }

  String _formatAmount(double amount, String currency) {
    final String symbol = currency == 'NGN' ? '₦' : '$';
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final carbonCreditsAsyncValue = ref.watch(carbonCreditsProvider(_searchTerm));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('Carbon Credits Ledger'),
        backgroundColor: const Color(0xFF1e293b),
        foregroundColor: const Color(0xFFf1f5f9),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshCarbonCredits,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search carbon credits...', 
                  hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: const Color(0xFF1e293b),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            Expanded(
              child: carbonCreditsAsyncValue.when(
                data: (carbonCredits) {
                  if (carbonCredits.isEmpty) {
                    return const Center(
                      child: Text(
                        'No carbon credits found.',
                        style: TextStyle(color: Color(0xFFf1f5f9)),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: carbonCredits.length,
                    itemBuilder: (context, index) {
                      final credit = carbonCredits[index];
                      return Card(
                        color: const Color(0xFF1e293b),
                        margin: const EdgeInsets.symmetric(
                            vertical: 4.0, horizontal: 8.0),
                        child: ListTile(
                          title: Text(credit.name,
                              style: const TextStyle(
                                  color: Color(0xFFf1f5f9),
                                  fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                  'Amount: ${_formatAmount(credit.amount, credit.currency)}',
                                  style: const TextStyle(
                                      color: Color(0xFFf1f5f9))),
                              Text('Issue Date: ${_formatDate(credit.issueDate)}',
                                  style: const TextStyle(
                                      color: Color(0xFFf1f5f9))),
                              Text(
                                  'Retirement Date: ${_formatDate(credit.retirementDate)}',
                                  style: const TextStyle(
                                      color: Color(0xFFf1f5f9))),
                              Row(
                                children: [
                                  const Text('Status: ',
                                      style: TextStyle(
                                          color: Color(0xFFf1f5f9))),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(credit.status),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      credit.status.toString().split('.').last,
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 12),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit,
                                    color: Color(0xFF6366f1)),
                                onPressed: () => _showEditDialog(context, credit),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete,
                                    color: Colors.redAccent),
                                onPressed: () =>
                                    _showDeleteConfirmationDialog(context, credit.id),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(
                    child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(
                    child: Text('Error: $err',
                        style: const TextStyle(color: Colors.redAccent))),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDialog(context),
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  void _showCreateDialog(BuildContext context) {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController amountController = TextEditingController();
    final TextEditingController currencyController = TextEditingController(text: 'USD');
    CarbonCreditStatus? selectedStatus = CarbonCreditStatus.active;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create Carbon Credit',
              style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: _inputDecoration('Credit Name'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: amountController,
                  decoration: _inputDecoration('Amount'),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: currencyController,
                  decoration: _inputDecoration('Currency (e.g., USD, NGN)'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<CarbonCreditStatus>(
                  value: selectedStatus,
                  decoration: _inputDecoration('Status'),
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  items: CarbonCreditStatus.values.map((status) {
                    return DropdownMenuItem(
                      value: status,
                      child: Text(status.toString().split('.').last,
                          style: const TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }).toList(),
                  onChanged: (CarbonCreditStatus? newValue) {
                    selectedStatus = newValue;
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel',
                  style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/carbonCredits.create', body: {
                    'name': nameController.text,
                    'amount': double.parse(amountController.text),
                    'currency': currencyController.text,
                    'status': selectedStatus.toString().split('.').last,
                  });
                  _refreshCarbonCredits();
                  if (context.mounted) Navigator.of(context).pop();
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to create credit: $e')),
                    );
                  }
                }
              },
              child: const Text('Create',
                  style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(BuildContext context, CarbonCredit credit) {
    final TextEditingController nameController = TextEditingController(text: credit.name);
    final TextEditingController amountController = TextEditingController(text: credit.amount.toString());
    final TextEditingController currencyController = TextEditingController(text: credit.currency);
    CarbonCreditStatus? selectedStatus = credit.status;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Carbon Credit',
              style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: _inputDecoration('Credit Name'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: amountController,
                  decoration: _inputDecoration('Amount'),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: currencyController,
                  decoration: _inputDecoration('Currency (e.g., USD, NGN)'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<CarbonCreditStatus>(
                  value: selectedStatus,
                  decoration: _inputDecoration('Status'),
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  items: CarbonCreditStatus.values.map((status) {
                    return DropdownMenuItem(
                      value: status,
                      child: Text(status.toString().split('.').last,
                          style: const TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }).toList(),
                  onChanged: (CarbonCreditStatus? newValue) {
                    selectedStatus = newValue;
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel',
                  style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/carbonCredits.update', body: {
                    'id': credit.id,
                    'name': nameController.text,
                    'amount': double.parse(amountController.text),
                    'currency': currencyController.text,
                    'status': selectedStatus.toString().split('.').last,
                  });
                  _refreshCarbonCredits();
                  if (context.mounted) Navigator.of(context).pop();
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to update credit: $e')),
                    );
                  }
                }
              },
              child: const Text('Save',
                  style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, String creditId) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete Carbon Credit',
              style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this carbon credit?',
              style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel',
                  style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/carbonCredits.delete', body: {'id': creditId});
                  _refreshCarbonCredits();
                  if (context.mounted) Navigator.of(context).pop();
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to delete credit: $e')),
                    );
                  }
                }
              },
              child: const Text('Delete',
                  style: TextStyle(color: Colors.redAccent))),
            ),
          ],
        );
      },
    );
  }

  InputDecoration _inputDecoration(String hintText) {
    return InputDecoration(
      hintText: hintText,
      hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
      filled: true,
      fillColor: const Color(0xFF0f172a),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: const BorderSide(color: Color(0xFF6366f1), width: 1.0),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: const BorderSide(color: Color(0xFF6366f1), width: 2.0),
      ),
    );
  }
}
