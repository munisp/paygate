import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Dummy model for BNPL Repayment
class BnplRepayment {
  final String id;
  final String customerName;
  final String merchantName;
  final double amount;
  final String currency;
  final DateTime dueDate;
  final String status;
  final String repaymentPlanId;

  BnplRepayment({
    required this.id,
    required this.customerName,
    required this.merchantName,
    required this.amount,
    required this.currency,
    required this.dueDate,
    required this.status,
    required this.repaymentPlanId,
  });

  factory BnplRepayment.fromJson(Map<String, dynamic> json) {
    return BnplRepayment(
      id: json['id'],
      customerName: json['customerName'],
      merchantName: json['merchantName'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      dueDate: DateTime.parse(json['dueDate']),
      status: json['status'],
      repaymentPlanId: json['repaymentPlanId'],
    );
  }

  BnplRepayment copyWith({
    String? id,
    String? customerName,
    String? merchantName,
    double? amount,
    String? currency,
    DateTime? dueDate,
    String? status,
    String? repaymentPlanId,
  }) {
    return BnplRepayment(
      id: id ?? this.id,
      customerName: customerName ?? this.customerName,
      merchantName: merchantName ?? this.merchantName,
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      dueDate: dueDate ?? this.dueDate,
      status: status ?? this.status,
      repaymentPlanId: repaymentPlanId ?? this.repaymentPlanId,
    );
  }
}

// Provider for fetching BNPL repayments
final bnplRepaymentsProvider = AsyncNotifierProvider<BnplRepaymentsNotifier, List<BnplRepayment>>(() {
  return BnplRepaymentsNotifier();
});

class BnplRepaymentsNotifier extends AsyncNotifier<List<BnplRepayment>> {
  String _searchQuery = '';
  String? _statusFilter;

  @override
  Future<List<BnplRepayment>> build() async {
    return _fetchBnplRepayments();
  }

  Future<List<BnplRepayment>> _fetchBnplRepayments() async {
    try {
      final api = ref.read(apiServiceProvider);
      // Assuming a tRPC procedure 'bnplRepayments.list' for fetching repayments
      final response = await api.get('/trpc/bnplRepayments.list', params: {});
      // Dummy data for now, replace with actual parsing of response
      final List<BnplRepayment> allRepayments = [
        BnplRepayment(
          id: '1',
          customerName: 'John Doe',
          merchantName: 'Fashion Hub',
          amount: 15000.00,
          currency: '₦',
          dueDate: DateTime.now().add(const Duration(days: 7)),
          status: 'Pending',
          repaymentPlanId: 'RP001',
        ),
        BnplRepayment(
          id: '2',
          customerName: 'Jane Smith',
          merchantName: 'Tech Gadgets',
          amount: 250.50,
          currency: '$',
          dueDate: DateTime.now().subtract(const Duration(days: 3)),
          status: 'Overdue',
          repaymentPlanId: 'RP002',
        ),
        BnplRepayment(
          id: '3',
          customerName: 'Peter Jones',
          merchantName: 'Home Decor',
          amount: 5000.00,
          currency: '₦',
          dueDate: DateTime.now().add(const Duration(days: 14)),
          status: 'Paid',
          repaymentPlanId: 'RP003',
        ),
        BnplRepayment(
          id: '4',
          customerName: 'Alice Brown',
          merchantName: 'Bookworm',
          amount: 75.00,
          currency: '$',
          dueDate: DateTime.now().add(const Duration(days: 1)),
          status: 'Pending',
          repaymentPlanId: 'RP004',
        ),
        BnplRepayment(
          id: '5',
          customerName: 'Bob White',
          merchantName: 'Auto Parts',
          amount: 12000.00,
          currency: '₦',
          dueDate: DateTime.now().subtract(const Duration(days: 10)),
          status: 'Overdue',
          repaymentPlanId: 'RP005',
        ),
      ];

      return allRepayments.where((repayment) {
        final matchesSearch = _searchQuery.isEmpty ||
            repayment.customerName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
            repayment.merchantName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
            repayment.repaymentPlanId.toLowerCase().contains(_searchQuery.toLowerCase());
        final matchesStatus = _statusFilter == null || repayment.status == _statusFilter;
        return matchesSearch && matchesStatus;
      }).toList();
    } catch (e, st) {
      debugPrint('Error fetching BNPL repayments: $e\n$st');
      throw Exception('Failed to load BNPL repayments');
    }
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    ref.invalidateSelf();
  }

  void setStatusFilter(String? status) {
    _statusFilter = status;
    ref.invalidateSelf();
  }

  Future<void> refreshRepayments() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchBnplRepayments());
  }

  Future<void> createRepayment(BnplRepayment newRepayment) async {
    try {
      final api = ref.read(apiServiceProvider);
      // Assuming a tRPC procedure 'bnplRepayments.create'
      await api.post('/trpc/bnplRepayments.create', body: newRepayment.toJson());
      await refreshRepayments();
    } catch (e) {
      throw Exception('Failed to create repayment: $e');
    }
  }

  Future<void> updateRepayment(BnplRepayment updatedRepayment) async {
    try {
      final api = ref.read(apiServiceProvider);
      // Assuming a tRPC procedure 'bnplRepayments.update'
      await api.post('/trpc/bnplRepayments.update', body: updatedRepayment.toJson());
      await refreshRepayments();
    } catch (e) {
      throw Exception('Failed to update repayment: $e');
    }
  }

  Future<void> deleteRepayment(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      // Assuming a tRPC procedure 'bnplRepayments.delete'
      await api.post('/trpc/bnplRepayments.delete', body: {'id': id});
      await refreshRepayments();
    } catch (e) {
      throw Exception('Failed to delete repayment: $e');
    }
  }
}

extension on BnplRepayment {
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'customerName': customerName,
      'merchantName': merchantName,
      'amount': amount,
      'currency': currency,
      'dueDate': dueDate.toIso8601String(),
      'status': status,
      'repaymentPlanId': repaymentPlanId,
    };
  }
}

class BnplRepaymentTrackerScreen extends ConsumerStatefulWidget {
  const BnplRepaymentTrackerScreen({super.key});

  @override
  ConsumerState<BnplRepaymentTrackerScreen> createState() => _BnplRepaymentTrackerScreenState();
}

class _BnplRepaymentTrackerScreenState extends ConsumerState<BnplRepaymentTrackerScreen> {
  final TextEditingController _searchController = TextEditingController();
  String? _selectedStatusFilter;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(bnplRepaymentsProvider.notifier).setSearchQuery(_searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bnplRepaymentsAsyncValue = ref.watch(bnplRepaymentsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'BNPL Repayment Tracker',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Light text
        ),
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showCreateRepaymentDialog(context),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by customer, merchant, or plan ID',
                hintStyle: const TextStyle(color: Color(0xFF94a3b8)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF94a3b8)),
                filled: true,
                fillColor: const Color(0xFF1e293b),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8.0),
            child: DropdownButtonFormField<String>(
              value: _selectedStatusFilter,
              decoration: InputDecoration(
                hintText: 'Filter by Status',
                hintStyle: const TextStyle(color: Color(0xFF94a3b8)),
                filled: true,
                fillColor: const Color(0xFF1e293b),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              dropdownColor: const Color(0xFF1e293b),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
              items: <String?>['All', 'Pending', 'Overdue', 'Paid']
                  .map<DropdownMenuItem<String?>>((String? value) {
                return DropdownMenuItem<String?>(
                  value: value == 'All' ? null : value,
                  child: Text(value ?? 'All'),
                );
              }).toList(),
              onChanged: (String? newValue) {
                setState(() {
                  _selectedStatusFilter = newValue;
                });
                ref.read(bnplRepaymentsProvider.notifier).setStatusFilter(newValue);
              },
            ),
          ),
          Expanded(
            child: bnplRepaymentsAsyncValue.when(
              data: (repayments) {
                return RefreshIndicator(
                  onRefresh: () => ref.read(bnplRepaymentsProvider.notifier).refreshRepayments(),
                  color: const Color(0xFF6366f1), // Accent color for refresh indicator
                  child: repayments.isEmpty
                      ? const Center(
                          child: Text(
                            'No BNPL repayments found.',
                            style: TextStyle(color: Color(0xFFf1f5f9)),
                          ),
                        )
                      : ListView.builder(
                          itemCount: repayments.length,
                          itemBuilder: (context, index) {
                            final repayment = repayments[index];
                            return _buildRepaymentCard(context, repayment);
                          },
                        ),
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
        ],
      ),
    );
  }

  Widget _buildRepaymentCard(BuildContext context, BnplRepayment repayment) {
    return Card(
      color: const Color(0xFF1e293b), // Card background
      margin: const EdgeInsets.all(8.0),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Repayment Plan ID: ${repayment.repaymentPlanId}',
              style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 8),
            Text(
              'Customer: ${repayment.customerName}',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
            Text(
              'Merchant: ${repayment.merchantName}',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
            Text(
              'Amount: ${repayment.currency}${NumberFormat('#,##0.00').format(repayment.amount)}',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
            Text(
              'Due Date: ${DateFormat('MMM dd, yyyy').format(repayment.dueDate)}',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
            Row(
              children: [
                const Text(
                  'Status: ',
                  style: TextStyle(color: Color(0xFFf1f5f9)),
                ),
                _buildStatusBadge(repayment.status),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                  onPressed: () => _showEditRepaymentDialog(context, repayment),
                ),
                IconButton(
                  icon: const Icon(Icons.delete, color: Colors.redAccent),
                  onPressed: () => _confirmDeleteRepayment(context, repayment.id),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    Color textColor = Colors.white;

    switch (status) {
      case 'Pending':
        badgeColor = Colors.orange;
        break;
      case 'Overdue':
        badgeColor = Colors.red;
        break;
      case 'Paid':
        badgeColor = Colors.green;
        break;
      default:
        badgeColor = Colors.grey;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: TextStyle(color: textColor, fontSize: 12),
      ),
    );
  }

  void _showCreateRepaymentDialog(BuildContext context) {
    final _formKey = GlobalKey<FormState>();
    String _customerName = '';
    String _merchantName = '';
    String _amount = '';
    String _currency = '₦';
    DateTime _dueDate = DateTime.now();
    String _status = 'Pending';
    String _repaymentPlanId = '';

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Repayment', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    decoration: _inputDecoration('Customer Name'),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    onSaved: (value) => _customerName = value!,
                    validator: (value) => value!.isEmpty ? 'Please enter customer name' : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    decoration: _inputDecoration('Merchant Name'),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    onSaved: (value) => _merchantName = value!,
                    validator: (value) => value!.isEmpty ? 'Please enter merchant name' : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    decoration: _inputDecoration('Amount'),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    keyboardType: TextInputType.number,
                    onSaved: (value) => _amount = value!,
                    validator: (value) => value!.isEmpty || double.tryParse(value) == null ? 'Please enter a valid amount' : null,
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: _currency,
                    decoration: _inputDecoration('Currency'),
                    dropdownColor: const Color(0xFF1e293b),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    items: <String>['₦', '$']
                        .map<DropdownMenuItem<String>>((String value) {
                      return DropdownMenuItem<String>(
                        value: value,
                        child: Text(value),
                      );
                    }).toList(),
                    onChanged: (String? newValue) {
                      if (newValue != null) {
                        _currency = newValue;
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  ListTile(
                    title: Text('Due Date: ${DateFormat('MMM dd, yyyy').format(_dueDate)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                    trailing: const Icon(Icons.calendar_today, color: Color(0xFFf1f5f9)),
                    onTap: () async {
                      DateTime? picked = await showDatePicker(
                        context: context,
                        initialDate: _dueDate,
                        firstDate: DateTime.now(),
                        lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
                        builder: (context, child) {
                          return Theme(
                            data: ThemeData.dark().copyWith(
                              colorScheme: const ColorScheme.dark(
                                primary: Color(0xFF6366f1), // Accent color
                                onPrimary: Colors.white,
                                surface: Color(0xFF1e293b),
                                onSurface: Color(0xFFf1f5f9),
                              ),
                              dialogBackgroundColor: const Color(0xFF0f172a),
                            ),
                            child: child!,
                          );
                        },
                      );
                      if (picked != null && picked != _dueDate) {
                        setState(() {
                          _dueDate = picked;
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: _status,
                    decoration: _inputDecoration('Status'),
                    dropdownColor: const Color(0xFF1e293b),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    items: <String>['Pending', 'Overdue', 'Paid']
                        .map<DropdownMenuItem<String>>((String value) {
                      return DropdownMenuItem<String>(
                        value: value,
                        child: Text(value),
                      );
                    }).toList(),
                    onChanged: (String? newValue) {
                      if (newValue != null) {
                        _status = newValue;
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    decoration: _inputDecoration('Repayment Plan ID'),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    onSaved: (value) => _repaymentPlanId = value!,
                    validator: (value) => value!.isEmpty ? 'Please enter repayment plan ID' : null,
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                if (_formKey.currentState!.validate()) {
                  _formKey.currentState!.save();
                  final newRepayment = BnplRepayment(
                    id: DateTime.now().millisecondsSinceEpoch.toString(), // Dummy ID
                    customerName: _customerName,
                    merchantName: _merchantName,
                    amount: double.parse(_amount),
                    currency: _currency,
                    dueDate: _dueDate,
                    status: _status,
                    repaymentPlanId: _repaymentPlanId,
                  );
                  ref.read(bnplRepaymentsProvider.notifier).createRepayment(newRepayment);
                  Navigator.of(context).pop();
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showEditRepaymentDialog(BuildContext context, BnplRepayment repayment) {
    final _formKey = GlobalKey<FormState>();
    String _customerName = repayment.customerName;
    String _merchantName = repayment.merchantName;
    String _amount = repayment.amount.toString();
    String _currency = repayment.currency;
    DateTime _dueDate = repayment.dueDate;
    String _status = repayment.status;
    String _repaymentPlanId = repayment.repaymentPlanId;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Repayment', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    initialValue: _customerName,
                    decoration: _inputDecoration('Customer Name'),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    onSaved: (value) => _customerName = value!,
                    validator: (value) => value!.isEmpty ? 'Please enter customer name' : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: _merchantName,
                    decoration: _inputDecoration('Merchant Name'),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    onSaved: (value) => _merchantName = value!,
                    validator: (value) => value!.isEmpty ? 'Please enter merchant name' : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: _amount,
                    decoration: _inputDecoration('Amount'),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    keyboardType: TextInputType.number,
                    onSaved: (value) => _amount = value!,
                    validator: (value) => value!.isEmpty || double.tryParse(value) == null ? 'Please enter a valid amount' : null,
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: _currency,
                    decoration: _inputDecoration('Currency'),
                    dropdownColor: const Color(0xFF1e293b),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    items: <String>['₦', '$']
                        .map<DropdownMenuItem<String>>((String value) {
                      return DropdownMenuItem<String>(
                        value: value,
                        child: Text(value),
                      );
                    }).toList(),
                    onChanged: (String? newValue) {
                      if (newValue != null) {
                        _currency = newValue;
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  ListTile(
                    title: Text('Due Date: ${DateFormat('MMM dd, yyyy').format(_dueDate)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                    trailing: const Icon(Icons.calendar_today, color: Color(0xFFf1f5f9)),
                    onTap: () async {
                      DateTime? picked = await showDatePicker(
                        context: context,
                        initialDate: _dueDate,
                        firstDate: DateTime.now(),
                        lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
                        builder: (context, child) {
                          return Theme(
                            data: ThemeData.dark().copyWith(
                              colorScheme: const ColorScheme.dark(
                                primary: Color(0xFF6366f1), // Accent color
                                onPrimary: Colors.white,
                                surface: Color(0xFF1e293b),
                                onSurface: Color(0xFFf1f5f9),
                              ),
                              dialogBackgroundColor: const Color(0xFF0f172a),
                            ),
                            child: child!,
                          );
                        },
                      );
                      if (picked != null && picked != _dueDate) {
                        setState(() {
                          _dueDate = picked;
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: _status,
                    decoration: _inputDecoration('Status'),
                    dropdownColor: const Color(0xFF1e293b),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    items: <String>['Pending', 'Overdue', 'Paid']
                        .map<DropdownMenuItem<String>>((String value) {
                      return DropdownMenuItem<String>(
                        value: value,
                        child: Text(value),
                      );
                    }).toList(),
                    onChanged: (String? newValue) {
                      if (newValue != null) {
                        _status = newValue;
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: _repaymentPlanId,
                    decoration: _inputDecoration('Repayment Plan ID'),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    onSaved: (value) => _repaymentPlanId = value!,
                    validator: (value) => value!.isEmpty ? 'Please enter repayment plan ID' : null,
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                if (_formKey.currentState!.validate()) {
                  _formKey.currentState!.save();
                  final updatedRepayment = repayment.copyWith(
                    customerName: _customerName,
                    merchantName: _merchantName,
                    amount: double.parse(_amount),
                    currency: _currency,
                    dueDate: _dueDate,
                    status: _status,
                    repaymentPlanId: _repaymentPlanId,
                  );
                  ref.read(bnplRepaymentsProvider.notifier).updateRepayment(updatedRepayment);
                  Navigator.of(context).pop();
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Update', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _confirmDeleteRepayment(BuildContext context, String id) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this repayment?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                ref.read(bnplRepaymentsProvider.notifier).deleteRepayment(id);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  InputDecoration _inputDecoration(String labelText) {
    return InputDecoration(
      labelText: labelText,
      labelStyle: const TextStyle(color: Color(0xFF94a3b8)),
      enabledBorder: OutlineInputBorder(
        borderSide: const BorderSide(color: Color(0xFF475569)),
        borderRadius: BorderRadius.circular(8.0),
      ),
      focusedBorder: OutlineInputBorder(
        borderSide: const BorderSide(color: Color(0xFF6366f1)),
        borderRadius: BorderRadius.circular(8.0),
      ),
      fillColor: const Color(0xFF1e293b),
      filled: true,
    );
  }
}