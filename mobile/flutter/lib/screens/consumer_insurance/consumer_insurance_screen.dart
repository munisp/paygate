import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Dummy data model for ConsumerInsurance
class ConsumerInsurance {
  final String id;
  final String policyNumber;
  final String customerName;
  final double amount;
  final String currency;
  final DateTime startDate;
  final DateTime endDate;
  final String status;

  ConsumerInsurance({
    required this.id,
    required this.policyNumber,
    required this.customerName,
    required this.amount,
    required this.currency,
    required this.startDate,
    required this.endDate,
    required this.status,
  });

  factory ConsumerInsurance.fromJson(Map<String, dynamic> json) {
    return ConsumerInsurance(
      id: json['id'],
      policyNumber: json['policyNumber'],
      customerName: json['customerName'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      startDate: DateTime.parse(json['startDate']),
      endDate: DateTime.parse(json['endDate']),
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'policyNumber': policyNumber,
        'customerName': customerName,
        'amount': amount,
        'currency': currency,
        'startDate': startDate.toIso8601String(),
        'endDate': endDate.toIso8601String(),
        'status': status,
      };
}

// Riverpod provider for fetching insurance list
final consumerInsuranceListProvider = FutureProvider.family<
    List<ConsumerInsurance>, String>((ref, searchTerm) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/consumerInsurance.list', params: {
    'search': searchTerm,
  });
  // Assuming response.data is a List<Map<String, dynamic>>
  return (response.data as List)
      .map((e) => ConsumerInsurance.fromJson(e))
      .toList();
});

class ConsumerInsuranceScreen extends ConsumerStatefulWidget {
  const ConsumerInsuranceScreen({super.key});

  @override
  ConsumerState<ConsumerInsuranceScreen> createState()
      => _ConsumerInsuranceScreenState();
}

class _ConsumerInsuranceScreenState
    extends ConsumerState<ConsumerInsuranceScreen> {
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

  Future<void> _refreshList() async {
    ref.invalidate(consumerInsuranceListProvider(_searchTerm));
  }

  // CRUD Operations
  Future<void> _createInsurance(ConsumerInsurance newInsurance) async {
    final api = ref.read(apiServiceProvider);
    try {
      await api.post('/trpc/consumerInsurance.create',
          body: newInsurance.toJson());
      _refreshList();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Insurance created successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create insurance: $e')),
        );
      }
    }
  }

  Future<void> _updateInsurance(ConsumerInsurance updatedInsurance) async {
    final api = ref.read(apiServiceProvider);
    try {
      await api.post('/trpc/consumerInsurance.update',
          body: updatedInsurance.toJson());
      _refreshList();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Insurance updated successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update insurance: $e')),
        );
      }
    }
  }

  Future<void> _deleteInsurance(String id) async {
    final api = ref.read(apiServiceProvider);
    try {
      await api.post('/trpc/consumerInsurance.delete', body: {'id': id});
      _refreshList();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Insurance deleted successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete insurance: $e')),
        );
      }
    }
  }

  // Helper for currency formatting
  String _formatAmount(double amount, String currency) {
    final String symbol = currency == 'NGN' ? '₦' : '$'; // Naira or Dollar
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  // Helper for date formatting
  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  // Widget for status badge
  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'active':
        color = Colors.green;
        break;
      case 'pending':
        color = Colors.orange;
        break;
      case 'expired':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: TextStyle(color: color, fontSize: 12),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<ConsumerInsurance>> insuranceListAsync =
        ref.watch(consumerInsuranceListProvider(_searchTerm));

    // Dark theme colors
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: const Text('Consumer Insurance', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: textColor),
              decoration: InputDecoration(
                hintText: 'Search by policy number or customer name...', 
                hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: textColor),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: cardColor,
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshList,
              color: accentColor,
              backgroundColor: cardColor,
              child: insuranceListAsync.when(
                data: (insuranceList) {
                  if (insuranceList.isEmpty) {
                    return Center(
                      child: Text(
                        'No insurance policies found.',
                        style: TextStyle(color: textColor.withOpacity(0.7)),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: insuranceList.length,
                    itemBuilder: (context, index) {
                      final insurance = insuranceList[index];
                      return Card(
                        color: cardColor,
                        margin: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Policy: ${insurance.policyNumber}',
                                style: const TextStyle(
                                    color: textColor, 
                                    fontWeight: FontWeight.bold,
                                    fontSize: 16),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Customer: ${insurance.customerName}',
                                style: const TextStyle(color: textColor),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Amount: ${_formatAmount(insurance.amount, insurance.currency)}',
                                style: const TextStyle(color: textColor),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Period: ${_formatDate(insurance.startDate)} - ${_formatDate(insurance.endDate)}',
                                style: const TextStyle(color: textColor),
                              ),
                              const SizedBox(height: 8),
                              _buildStatusBadge(insurance.status),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.edit, color: accentColor),
                                    onPressed: () => _showEditDialog(insurance),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete, color: Colors.redAccent),
                                    onPressed: () => _confirmDelete(insurance.id),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(
                    child: CircularProgressIndicator(color: accentColor)),
                error: (err, stack) => Center(
                  child: Text(
                    'Error: $err',
                    style: TextStyle(color: Colors.redAccent),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateDialog,
        backgroundColor: accentColor,
        child: const Icon(Icons.add, color: textColor),
      ),
    );
  }

  void _showCreateDialog() {
    final TextEditingController policyController = TextEditingController();
    final TextEditingController customerController = TextEditingController();
    final TextEditingController amountController = TextEditingController();
    String? selectedCurrency = 'NGN'; // Default currency
    String? selectedStatus = 'active'; // Default status
    DateTime? startDate = DateTime.now();
    DateTime? endDate = DateTime.now().add(const Duration(days: 365));

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: Color(0xFF1e293b),
          title: const Text('Create New Insurance', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: policyController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Policy Number',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: customerController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: amountController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: <String>['NGN', 'USD']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedCurrency = newValue;
                  },
                ),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: <String>['active', 'pending', 'expired']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedStatus = newValue;
                  },
                ),
                // Date pickers for start and end dates
                ListTile(
                  title: Text('Start Date: ${_formatDate(startDate!)}', style: const TextStyle(color: Color(0xFFf1f5f9))), 
                  trailing: const Icon(Icons.calendar_today, color: Color(0xFF6366f1)),
                  onTap: () async {
                    final DateTime? picked = await showDatePicker(
                      context: context,
                      initialDate: startDate!,
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2101),
                      builder: (context, child) {
                        return Theme(
                          data: ThemeData.dark().copyWith(
                            colorScheme: const ColorScheme.dark(
                              primary: Color(0xFF6366f1), // header background color
                              onPrimary: Color(0xFFf1f5f9), // header text color
                              onSurface: Color(0xFFf1f5f9), // body text color
                              surface: Color(0xFF1e293b), // dialog background
                            ),
                            textButtonTheme: TextButtonThemeData(
                              style: TextButton.styleFrom(foregroundColor: Color(0xFF6366f1)), // button text color
                            ),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (picked != null && picked != startDate) {
                      setState(() {
                        startDate = picked;
                      });
                    }
                  },
                ),
                ListTile(
                  title: Text('End Date: ${_formatDate(endDate!)}', style: const TextStyle(color: Color(0xFFf1f5f9))), 
                  trailing: const Icon(Icons.calendar_today, color: Color(0xFF6366f1)),
                  onTap: () async {
                    final DateTime? picked = await showDatePicker(
                      context: context,
                      initialDate: endDate!,
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2101),
                       builder: (context, child) {
                        return Theme(
                          data: ThemeData.dark().copyWith(
                            colorScheme: const ColorScheme.dark(
                              primary: Color(0xFF6366f1), // header background color
                              onPrimary: Color(0xFFf1f5f9), // header text color
                              onSurface: Color(0xFFf1f5f9), // body text color
                              surface: Color(0xFF1e293b), // dialog background
                            ),
                            textButtonTheme: TextButtonThemeData(
                              style: TextButton.styleFrom(foregroundColor: Color(0xFF6366f1)), // button text color
                            ),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (picked != null && picked != endDate) {
                      setState(() {
                        endDate = picked;
                      });
                    }
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () {
                final newInsurance = ConsumerInsurance(
                  id: DateTime.now().millisecondsSinceEpoch.toString(), // Dummy ID
                  policyNumber: policyController.text,
                  customerName: customerController.text,
                  amount: double.tryParse(amountController.text) ?? 0.0,
                  currency: selectedCurrency!,
                  startDate: startDate!,
                  endDate: endDate!,
                  status: selectedStatus!,
                );
                _createInsurance(newInsurance);
                Navigator.of(context).pop();
              },
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(ConsumerInsurance insurance) {
    final TextEditingController policyController = TextEditingController(text: insurance.policyNumber);
    final TextEditingController customerController = TextEditingController(text: insurance.customerName);
    final TextEditingController amountController = TextEditingController(text: insurance.amount.toString());
    String? selectedCurrency = insurance.currency;
    String? selectedStatus = insurance.status;
    DateTime? startDate = insurance.startDate;
    DateTime? endDate = insurance.endDate;

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: Color(0xFF1e293b),
          title: const Text('Edit Insurance', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: policyController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Policy Number',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: customerController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: amountController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: <String>['NGN', 'USD']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedCurrency = newValue;
                  },
                ),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: <String>['active', 'pending', 'expired']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedStatus = newValue;
                  },
                ),
                ListTile(
                  title: Text('Start Date: ${_formatDate(startDate!)}', style: const TextStyle(color: Color(0xFFf1f5f9))), 
                  trailing: const Icon(Icons.calendar_today, color: Color(0xFF6366f1)),
                  onTap: () async {
                    final DateTime? picked = await showDatePicker(
                      context: context,
                      initialDate: startDate!,
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2101),
                      builder: (context, child) {
                        return Theme(
                          data: ThemeData.dark().copyWith(
                            colorScheme: const ColorScheme.dark(
                              primary: Color(0xFF6366f1), // header background color
                              onPrimary: Color(0xFFf1f5f9), // header text color
                              onSurface: Color(0xFFf1f5f9), // body text color
                              surface: Color(0xFF1e293b), // dialog background
                            ),
                            textButtonTheme: TextButtonThemeData(
                              style: TextButton.styleFrom(foregroundColor: Color(0xFF6366f1)), // button text color
                            ),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (picked != null && picked != startDate) {
                      setState(() {
                        startDate = picked;
                      });
                    }
                  },
                ),
                ListTile(
                  title: Text('End Date: ${_formatDate(endDate!)}', style: const TextStyle(color: Color(0xFFf1f5f9))), 
                  trailing: const Icon(Icons.calendar_today, color: Color(0xFF6366f1)),
                  onTap: () async {
                    final DateTime? picked = await showDatePicker(
                      context: context,
                      initialDate: endDate!,
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2101),
                       builder: (context, child) {
                        return Theme(
                          data: ThemeData.dark().copyWith(
                            colorScheme: const ColorScheme.dark(
                              primary: Color(0xFF6366f1), // header background color
                              onPrimary: Color(0xFFf1f5f9), // header text color
                              onSurface: Color(0xFFf1f5f9), // body text color
                              surface: Color(0xFF1e293b), // dialog background
                            ),
                            textButtonTheme: TextButtonThemeData(
                              style: TextButton.styleFrom(foregroundColor: Color(0xFF6366f1)), // button text color
                            ),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (picked != null && picked != endDate) {
                      setState(() {
                        endDate = picked;
                      });
                    }
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () {
                final updatedInsurance = ConsumerInsurance(
                  id: insurance.id,
                  policyNumber: policyController.text,
                  customerName: customerController.text,
                  amount: double.tryParse(amountController.text) ?? 0.0,
                  currency: selectedCurrency!,
                  startDate: startDate!,
                  endDate: endDate!,
                  status: selectedStatus!,
                );
                _updateInsurance(updatedInsurance);
                Navigator.of(context).pop();
              },
              child: const Text('Update', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _confirmDelete(String id) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this insurance policy?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () {
                _deleteInsurance(id);
                Navigator.of(context).pop();
              },
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
            ),
          ],
        );
      },
    );
  }
}
