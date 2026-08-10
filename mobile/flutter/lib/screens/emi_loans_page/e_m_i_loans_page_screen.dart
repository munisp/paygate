import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Data model for an EMI Loan
class EMILoan {
  final String id;
  final String customerName;
  final double amount;
  final String currency;
  final String status;
  final DateTime startDate;
  final DateTime endDate;
  final double interestRate;
  final double emiAmount;

  EMILoan({
    required this.id,
    required this.customerName,
    required this.amount,
    required this.currency,
    required this.status,
    required this.startDate,
    required this.endDate,
    required this.interestRate,
    required this.emiAmount,
  });

  factory EMILoan.fromJson(Map<String, dynamic> json) {
    return EMILoan(
      id: json['id'],
      customerName: json['customerName'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      status: json['status'],
      startDate: DateTime.parse(json['startDate']),
      endDate: DateTime.parse(json['endDate']),
      interestRate: (json['interestRate'] as num).toDouble(),
      emiAmount: (json['emiAmount'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerName': customerName,
        'amount': amount,
        'currency': currency,
        'status': status,
        'startDate': startDate.toIso8601String(),
        'endDate': endDate.toIso8601String(),
        'interestRate': interestRate,
        'emiAmount': emiAmount,
      };

  EMILoan copyWith({
    String? id,
    String? customerName,
    double? amount,
    String? currency,
    String? status,
    DateTime? startDate,
    DateTime? endDate,
    double? interestRate,
    double? emiAmount,
  }) {
    return EMILoan(
      id: id ?? this.id,
      customerName: customerName ?? this.customerName,
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      status: status ?? this.status,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      interestRate: interestRate ?? this.interestRate,
      emiAmount: emiAmount ?? this.emiAmount,
    );
  }
}

// Provider for EMI Loans
final emiLoansProvider = FutureProvider.family<List<EMILoan>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call delay
  await Future.delayed(const Duration(milliseconds: 500));
  try {
    final response = await api.get('/trpc/emiLoans.list', params: {'query': query});
    if (response.data is List) {
      return (response.data as List).map((e) => EMILoan.fromJson(e)).toList();
    } else {
      return [];
    }
  } catch (e) {
    print('Error fetching EMI loans: $e');
    rethrow;
  }
});

class EMILoansPageScreen extends ConsumerStatefulWidget {
  const EMILoansPageScreen({super.key});

  @override
  ConsumerState<EMILoansPageScreen> createState() => _EMILoansPageScreenState();
}

class _EMILoansPageScreenState extends ConsumerState<EMILoansPageScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchQuery = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _formatCurrency(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$');
    return format.format(amount);
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'completed':
        return Colors.blue;
      case 'defaulted':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Future<void> _createLoan(EMILoan newLoan) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/emiLoans.create', body: newLoan.toJson());
      ref.invalidate(emiLoansProvider(_searchQuery)); // Refresh list
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Loan created successfully!'))
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create loan: $e'))
        );
      }
    }
  }

  Future<void> _updateLoan(EMILoan updatedLoan) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/emiLoans.update', body: updatedLoan.toJson());
      ref.invalidate(emiLoansProvider(_searchQuery)); // Refresh list
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Loan updated successfully!'))
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update loan: $e'))
        );
      }
    }
  }

  Future<void> _deleteLoan(String loanId) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/emiLoans.delete', body: {'id': loanId});
      ref.invalidate(emiLoansProvider(_searchQuery)); // Refresh list
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Loan deleted successfully!'))
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete loan: $e'))
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: const Text('EMI Loans', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: textColor),
            onPressed: () {
              _showCreateLoanDialog(context);
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(emiLoansProvider(_searchQuery));
        },
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: textColor),
                decoration: InputDecoration(
                  hintText: 'Search loans...',
                  hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: textColor),
                  filled: true,
                  fillColor: cardColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Expanded(
              child: ref.watch(emiLoansProvider(_searchQuery)).when(
                data: (loans) {
                  if (loans.isEmpty) {
                    return const Center(
                      child: Text('No EMI loans found.', style: TextStyle(color: textColor)),
                    );
                  }
                  return ListView.builder(
                    itemCount: loans.length,
                    itemBuilder: (context, index) {
                      final loan = loans[index];
                      return Card(
                        color: cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(loan.customerName, style: const TextStyle(color: textColor)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Amount: ${_formatCurrency(loan.amount, loan.currency)} - EMI: ${_formatCurrency(loan.emiAmount, loan.currency)}',
                                style: TextStyle(color: textColor.withOpacity(0.8)),
                              ),
                              Text(
                                'Start: ${DateFormat('MMM dd, yyyy').format(loan.startDate)} - End: ${DateFormat('MMM dd, yyyy').format(loan.endDate)}',
                                style: TextStyle(color: textColor.withOpacity(0.8)),
                              ),
                              Row(
                                children: [
                                  const Text('Status: ', style: TextStyle(color: textColor)),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(loan.status),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      loan.status,
                                      style: const TextStyle(color: Colors.white, fontSize: 12),
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
                                icon: const Icon(Icons.edit, color: accentColor),
                                onPressed: () {
                                  _showEditLoanDialog(context, loan);
                                },
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () {
                                  _showDeleteConfirmationDialog(context, loan);
                                },
                              ),
                            ],
                          ),
                          onTap: () {
                            _showEditLoanDialog(context, loan);
                          },
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: accentColor)),
                error: (err, stack) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Text('Error loading EMI loans: ${err.toString()}',
                        style: const TextStyle(color: Colors.redAccent, fontSize: 16), textAlign: TextAlign.center),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showCreateLoanDialog(BuildContext context) {
    final _formKey = GlobalKey<FormState>();
    String _customerName = '';
    double _amount = 0.0;
    String _currency = 'NGN';
    String _status = 'pending';
    double _interestRate = 0.0;
    double _emiAmount = 0.0;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Loan', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Customer Name',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter customer name';
                      }
                      return null;
                    },
                    onSaved: (value) => _customerName = value!,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Amount',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (value) {
                      if (value == null || double.tryParse(value) == null) {
                        return 'Please enter a valid amount';
                      }
                      return null;
                    },
                    onSaved: (value) => _amount = double.parse(value!),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: _currency,
                    dropdownColor: const Color(0xFF1e293b),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Currency',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    items: ['NGN', 'USD'].map((String currency) {
                      return DropdownMenuItem(value: currency, child: Text(currency));
                    }).toList(),
                    onChanged: (String? newValue) {
                      if (newValue != null) {
                        _currency = newValue;
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: _status,
                    dropdownColor: const Color(0xFF1e293b),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Status',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    items: ['active', 'pending', 'completed', 'defaulted'].map((String status) {
                      return DropdownMenuItem(value: status, child: Text(status));
                    }).toList(),
                    onChanged: (String? newValue) {
                      if (newValue != null) {
                        _status = newValue;
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Interest Rate',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (value) {
                      if (value == null || double.tryParse(value) == null) {
                        return 'Please enter a valid interest rate';
                      }
                      return null;
                    },
                    onSaved: (value) => _interestRate = double.parse(value!),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'EMI Amount',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (value) {
                      if (value == null || double.tryParse(value) == null) {
                        return 'Please enter a valid EMI amount';
                      }
                      return null;
                    },
                    onSaved: (value) => _emiAmount = double.parse(value!),
                  ),
                ],
              ),
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                if (_formKey.currentState!.validate()) {
                  _formKey.currentState!.save();
                  final newLoan = EMILoan(
                    id: DateTime.now().millisecondsSinceEpoch.toString(), // Unique ID
                    customerName: _customerName,
                    amount: _amount,
                    currency: _currency,
                    status: _status,
                    startDate: DateTime.now(),
                    endDate: DateTime.now().add(const Duration(days: 365)), // Example end date
                    interestRate: _interestRate,
                    emiAmount: _emiAmount,
                  );
                  _createLoan(newLoan);
                  Navigator.of(context).pop();
                }
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditLoanDialog(BuildContext context, EMILoan loan) {
    final _formKey = GlobalKey<FormState>();
    String _customerName = loan.customerName;
    double _amount = loan.amount;
    String _currency = loan.currency;
    String _status = loan.status;
    double _interestRate = loan.interestRate;
    double _emiAmount = loan.emiAmount;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text('Edit Loan: ${loan.customerName}', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    initialValue: _customerName,
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Customer Name',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter customer name';
                      }
                      return null;
                    },
                    onSaved: (value) => _customerName = value!,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: _amount.toString(),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Amount',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (value) {
                      if (value == null || double.tryParse(value) == null) {
                        return 'Please enter a valid amount';
                      }
                      return null;
                    },
                    onSaved: (value) => _amount = double.parse(value!),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: _currency,
                    dropdownColor: const Color(0xFF1e293b),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Currency',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    items: ['NGN', 'USD'].map((String currency) {
                      return DropdownMenuItem(value: currency, child: Text(currency));
                    }).toList(),
                    onChanged: (String? newValue) {
                      if (newValue != null) {
                        setState(() {
                          _currency = newValue;
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    value: _status,
                    dropdownColor: const Color(0xFF1e293b),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Status',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    items: ['active', 'pending', 'completed', 'defaulted'].map((String status) {
                      return DropdownMenuItem(value: status, child: Text(status));
                    }).toList(),
                    onChanged: (String? newValue) {
                      if (newValue != null) {
                        setState(() {
                          _status = newValue;
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: _interestRate.toString(),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'Interest Rate',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (value) {
                      if (value == null || double.tryParse(value) == null) {
                        return 'Please enter a valid interest rate';
                      }
                      return null;
                    },
                    onSaved: (value) => _interestRate = double.parse(value!),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    initialValue: _emiAmount.toString(),
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                    decoration: const InputDecoration(
                      labelText: 'EMI Amount',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                      enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (value) {
                      if (value == null || double.tryParse(value) == null) {
                        return 'Please enter a valid EMI amount';
                      }
                      return null;
                    },
                    onSaved: (value) => _emiAmount = double.parse(value!),
                  ),
                ],
              ),
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                if (_formKey.currentState!.validate()) {
                  _formKey.currentState!.save();
                  final updatedLoan = loan.copyWith(
                    customerName: _customerName,
                    amount: _amount,
                    currency: _currency,
                    status: _status,
                    interestRate: _interestRate,
                    emiAmount: _emiAmount,
                  );
                  _updateLoan(updatedLoan);
                  Navigator.of(context).pop();
                }
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, EMILoan loan) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete the loan for ${loan.customerName}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                _deleteLoan(loan.id);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}
