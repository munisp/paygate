import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Placeholder for ConsumerLoan data model
class ConsumerLoan {
  final String id;
  final String customerName;
  final double amount;
  final String currency;
  final DateTime startDate;
  final String status;

  ConsumerLoan({
    required this.id,
    required this.customerName,
    required this.amount,
    required this.currency,
    required this.startDate,
    required this.status,
  });

  factory ConsumerLoan.fromJson(Map<String, dynamic> json) {
    return ConsumerLoan(
      id: json['id'],
      customerName: json['customerName'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      startDate: DateTime.parse(json['startDate']),
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerName': customerName,
        'amount': amount,
        'currency': currency,
        'startDate': startDate.toIso8601String(),
        'status': status,
      };

  ConsumerLoan copyWith({
    String? id,
    String? customerName,
    double? amount,
    String? currency,
    DateTime? startDate,
    String? status,
  }) {
    return ConsumerLoan(
      id: id ?? this.id,
      customerName: customerName ?? this.customerName,
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      startDate: startDate ?? this.startDate,
      status: status ?? this.status,
    );
  }
}

// State provider for search query
final searchQueryProvider = StateProvider<String>((ref) => '');

// Provider to fetch and filter consumer loans
final consumerLoansProvider = FutureProvider.autoDispose<List<ConsumerLoan>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final searchQuery = ref.watch(searchQueryProvider);

  try {
    // Simulate API call
    // In a real app, you'd fetch from a real endpoint and pass search params
    final response = await api.get('/trpc/consumerFinanceLoans.list', params: {'search': searchQuery});
    // Assuming response.data is a List<Map<String, dynamic>>
    List<ConsumerLoan> allLoans = (response.data as List).map((e) => ConsumerLoan.fromJson(e)).toList();

    // Client-side filtering for demonstration, ideally done server-side
    if (searchQuery.isEmpty) {
      return allLoans;
    } else {
      return allLoans.where((loan) =>
          loan.customerName.toLowerCase().contains(searchQuery.toLowerCase()) ||
          loan.status.toLowerCase().contains(searchQuery.toLowerCase())
      ).toList();
    }
  } catch (e) {
    throw Exception('Failed to load consumer loans: $e');
  }
});

class ConsumerLoansScreen extends ConsumerStatefulWidget {
  const ConsumerLoansScreen({super.key});

  @override
  ConsumerState<ConsumerLoansScreen> createState() => _ConsumerLoansScreenState();
}

class _ConsumerLoansScreenState extends ConsumerState<ConsumerLoansScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshLoans() async {
    ref.invalidate(consumerLoansProvider);
  }

  Future<void> _createLoan() async {
    final newLoan = await showDialog<ConsumerLoan>(context: context, builder: (context) => _LoanFormDialog());
    if (newLoan != null) {
      try {
        final api = ref.read(apiServiceProvider);
        await api.post('/trpc/consumerFinanceLoans.create', body: newLoan.toJson());
        _refreshLoans();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Loan created successfully!')),);
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to create loan: $e')),);
        }
      }
    }
  }

  Future<void> _editLoan(ConsumerLoan loan) async {
    final updatedLoan = await showDialog<ConsumerLoan>(context: context, builder: (context) => _LoanFormDialog(loan: loan));
    if (updatedLoan != null) {
      try {
        final api = ref.read(apiServiceProvider);
        await api.post('/trpc/consumerFinanceLoans.update', body: updatedLoan.toJson());
        _refreshLoans();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Loan updated successfully!')),);
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to update loan: $e')),);
        }
      }
    }
  }

  Future<void> _deleteLoan(String loanId) async {
    final confirmDelete = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
      content: const Text('Are you sure you want to delete this loan?', style: TextStyle(color: Color(0xFFf1f5f9))),
      backgroundColor: const Color(0xFF1e293b),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1)))),
        TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Delete', style: TextStyle(color: Colors.redAccent))),
      ],
    ));

    if (confirmDelete == true) {
      try {
        final api = ref.read(apiServiceProvider);
        await api.post('/trpc/consumerFinanceLoans.delete', body: {'id': loanId});
        _refreshLoans();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Loan deleted successfully!')),);
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to delete loan: $e')),);
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final consumerLoansAsyncValue = ref.watch(consumerLoansProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Consumer Loans', style: TextStyle(color: Color(0xFFf1f5f9))), // Light text
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by customer name or status...', 
                hintStyle: const TextStyle(color: Color(0xFF94a3b8)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF94a3b8)),
                filled: true,
                fillColor: const Color(0xFF334155),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshLoans,
        child: consumerLoansAsyncValue.when(
          data: (loans) {
            if (loans.isEmpty) {
              return const Center(
                child: Text(
                  'No consumer loans found.',
                  style: TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            }
            return ListView.builder(
              itemCount: loans.length,
              itemBuilder: (context, index) {
                final loan = loans[index];
                return Card(
                  color: const Color(0xFF1e293b),
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Customer: ${loan.customerName}',
                          style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Amount: ${loan.currency == 'NGN' ? '₦' : '$'}${NumberFormat('#,##0.00').format(loan.amount)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Start Date: ${DateFormat('yyyy-MM-dd').format(loan.startDate)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 4),
                        _buildStatusBadge(loan.status),
                        Align(
                          alignment: Alignment.bottomRight,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _editLoan(loan),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _deleteLoan(loan.id),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color for spinner
          error: (error, stack) => Center(
            child: Text(
              'Error: ${error.toString()}',
              style: const TextStyle(color: Colors.redAccent),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createLoan,
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    Color textColor = Colors.white;

    switch (status.toLowerCase()) {
      case 'approved':
        badgeColor = Colors.green.shade700;
        break;
      case 'pending':
        badgeColor = Colors.orange.shade700;
        break;
      case 'rejected':
        badgeColor = Colors.red.shade700;
        break;
      default:
        badgeColor = const Color(0xFF94a3b8);
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(color: textColor, fontWeight: FontWeight.bold, fontSize: 12),
      ),
    );
  }
}

class _LoanFormDialog extends ConsumerStatefulWidget {
  final ConsumerLoan? loan;

  const _LoanFormDialog({super.key, this.loan});

  @override
  ConsumerState<_LoanFormDialog> createState() => _LoanFormDialogState();
}

class _LoanFormDialogState extends ConsumerState<_LoanFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _customerNameController;
  late TextEditingController _amountController;
  late TextEditingController _currencyController;
  late TextEditingController _startDateController;
  late String _selectedStatus;

  @override
  void initState() {
    super.initState();
    _customerNameController = TextEditingController(text: widget.loan?.customerName ?? '');
    _amountController = TextEditingController(text: widget.loan?.amount.toString() ?? '');
    _currencyController = TextEditingController(text: widget.loan?.currency ?? 'NGN');
    _startDateController = TextEditingController(text: widget.loan != null ? DateFormat('yyyy-MM-dd').format(widget.loan!.startDate) : DateFormat('yyyy-MM-dd').format(DateTime.now()));
    _selectedStatus = widget.loan?.status ?? 'Pending';
  }

  @override
  void dispose() {
    _customerNameController.dispose();
    _amountController.dispose();
    _currencyController.dispose();
    _startDateController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF1e293b),
      title: Text(widget.loan == null ? 'Create Loan' : 'Edit Loan', style: const TextStyle(color: Color(0xFFf1f5f9))),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _customerNameController,
                decoration: _inputDecoration('Customer Name'),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                validator: (value) => value!.isEmpty ? 'Please enter customer name' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _amountController,
                decoration: _inputDecoration('Amount'),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                keyboardType: TextInputType.number,
                validator: (value) => value!.isEmpty || double.tryParse(value) == null ? 'Please enter a valid amount' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _currencyController,
                decoration: _inputDecoration('Currency (e.g., NGN, USD)'),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                validator: (value) => value!.isEmpty ? 'Please enter currency' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _startDateController,
                decoration: _inputDecoration('Start Date (YYYY-MM-DD)'),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                readOnly: true,
                onTap: () async {
                  DateTime? pickedDate = await showDatePicker(
                    context: context,
                    initialDate: DateTime.tryParse(_startDateController.text) ?? DateTime.now(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2101),
                    builder: (context, child) {
                      return Theme(
                        data: ThemeData.dark().copyWith(
                          colorScheme: const ColorScheme.dark(
                            primary: Color(0xFF6366f1), // Accent color
                            onPrimary: Color(0xFFf1f5f9), // Light text
                            surface: Color(0xFF1e293b), // Card background
                            onSurface: Color(0xFFf1f5f9), // Light text
                          ),
                          dialogBackgroundColor: const Color(0xFF0f172a), // Dark background
                        ),
                        child: child!,
                      );
                    },
                  );
                  if (pickedDate != null) {
                    _startDateController.text = DateFormat('yyyy-MM-dd').format(pickedDate);
                  }
                },
                validator: (value) => value!.isEmpty || DateTime.tryParse(value) == null ? 'Please enter a valid date' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _selectedStatus,
                decoration: _inputDecoration('Status'),
                dropdownColor: const Color(0xFF1e293b),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                items: <String>['Pending', 'Approved', 'Rejected']
                    .map<DropdownMenuItem<String>>((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value, style: const TextStyle(color: Color(0xFFf1f5f9))),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  setState(() {
                    _selectedStatus = newValue!;
                  });
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
        ),
        TextButton(
          onPressed: () {
            if (_formKey.currentState!.validate()) {
              final loan = ConsumerLoan(
                id: widget.loan?.id ?? UniqueKey().toString(), // Generate new ID for create
                customerName: _customerNameController.text,
                amount: double.parse(_amountController.text),
                currency: _currencyController.text,
                startDate: DateTime.parse(_startDateController.text),
                status: _selectedStatus,
              );
              Navigator.of(context).pop(loan);
            }
          },
          child: Text(widget.loan == null ? 'Create' : 'Save', style: const TextStyle(color: Color(0xFF6366f1))),
        ),
      ],
    );
  }

  InputDecoration _inputDecoration(String labelText) {
    return InputDecoration(
      labelText: labelText,
      labelStyle: const TextStyle(color: Color(0xFF94a3b8)),
      filled: true,
      fillColor: const Color(0xFF334155),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: const BorderSide(color: Color(0xFF475569)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: const BorderSide(color: Color(0xFF6366f1)),
      ),
    );
  }
}
