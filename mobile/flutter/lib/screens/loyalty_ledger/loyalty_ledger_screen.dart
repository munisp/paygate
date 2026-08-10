import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Data Model for Loyalty Ledger Entry
class LoyaltyLedgerEntry {
  final String id;
  final String customerName;
  final String type;
  final double amount;
  final String currency;
  final DateTime date;
  final String status;

  LoyaltyLedgerEntry({
    required this.id,
    required this.customerName,
    required this.type,
    required this.amount,
    required this.currency,
    required this.date,
    required this.status,
  });

  factory LoyaltyLedgerEntry.fromJson(Map<String, dynamic> json) {
    return LoyaltyLedgerEntry(
      id: json['id'],
      customerName: json['customerName'],
      type: json['type'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      date: DateTime.parse(json['date']),
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerName': customerName,
        'type': type,
        'amount': amount,
        'currency': currency,
        'date': date.toIso8601String(),
        'status': status,
      };
}

// Riverpod provider for fetching loyalty ledger data
final loyaltyLedgerProvider = FutureProvider.family<
    List<LoyaltyLedgerEntry>, String>((ref, searchTerm) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/loyalty.list', params: {'searchTerm': searchTerm});
    return (response.data as List)
        .map((e) => LoyaltyLedgerEntry.fromJson(e))
        .toList();
  } catch (e) {
    // Mock data for demonstration if API fails or is not yet implemented
    final mockData = [
      {
        'id': '1',
        'customerName': 'Alice Smith',
        'type': 'Earned',
        'amount': 100.0,
        'currency': 'NGN',
        'date': '2026-05-10T10:00:00Z',
        'status': 'Completed'
      },
      {
        'id': '2',
        'customerName': 'Bob Johnson',
        'type': 'Redeemed',
        'amount': 50.0,
        'currency': 'USD',
        'date': '2026-05-09T15:30:00Z',
        'status': 'Pending'
      },
      {
        'id': '3',
        'customerName': 'Charlie Brown',
        'type': 'Earned',
        'amount': 200.0,
        'currency': 'NGN',
        'date': '2026-05-08T09:00:00Z',
        'status': 'Completed'
      },
      {
        'id': '4',
        'customerName': 'Diana Prince',
        'type': 'Adjusted',
        'amount': -25.0,
        'currency': 'USD',
        'date': '2026-05-07T11:45:00Z',
        'status': 'Failed'
      },
    ];

    final filteredData = mockData.where((entry) {
      final name = entry['customerName'] as String;
      final type = entry['type'] as String;
      final status = entry['status'] as String;
      return name.toLowerCase().contains(searchTerm.toLowerCase()) ||
          type.toLowerCase().contains(searchTerm.toLowerCase()) ||
          status.toLowerCase().contains(searchTerm.toLowerCase());
    }).toList();
    return filteredData.map((e) => LoyaltyLedgerEntry.fromJson(e)).toList();
  }
});

class LoyaltyLedgerScreen extends ConsumerStatefulWidget {
  const LoyaltyLedgerScreen({super.key});

  @override
  ConsumerState<LoyaltyLedgerScreen> createState() => _LoyaltyLedgerScreenState();
}

class _LoyaltyLedgerScreenState extends ConsumerState<LoyaltyLedgerScreen> {
  // Define colors for the dark theme
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  final TextEditingController _searchController = TextEditingController();
  String _searchTerm = '';

  final _customerNameController = TextEditingController();
  final _typeController = TextEditingController();
  final _amountController = TextEditingController();
  final _currencyController = TextEditingController();
  final _statusController = TextEditingController();

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
    _customerNameController.dispose();
    _typeController.dispose();
    _amountController.dispose();
    _currencyController.dispose();
    _statusController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Loyalty Ledger', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _textColor),
            onPressed: () {
              _showCreateDialog(context);
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(loyaltyLedgerProvider(_searchTerm));
        },
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search by customer name, type, or status',
                  hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
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
              child: _buildContent(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    final loyaltyLedgerAsyncValue = ref.watch(loyaltyLedgerProvider(_searchTerm));

    return loyaltyLedgerAsyncValue.when(
      loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
      error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.red))),
      data: (entries) {
        if (entries.isEmpty) {
          return Center(
            child: Text(
              'No loyalty ledger entries found.',
              style: TextStyle(color: _textColor.withOpacity(0.7)),
            ),
          );
        }
        return ListView.builder(
          itemCount: entries.length,
          itemBuilder: (context, index) {
            final entry = entries[index];
            return Card(
              color: _cardColor,
              margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
              child: ListTile(
                title: Text(entry.customerName, style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold)),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Type: ${entry.type}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                    Text(
                      'Amount: ${entry.currency == 'NGN' ? '₦' : '$'}${NumberFormat('#,##0.00').format(entry.amount)}',
                      style: TextStyle(color: _textColor.withOpacity(0.8)),
                    ),
                    Text('Date: ${DateFormat('yyyy-MM-dd HH:mm').format(entry.date)}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                    _buildStatusBadge(entry.status),
                  ],
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.edit, color: _accentColor),
                      onPressed: () {
                        _showEditDialog(context, entry);
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete, color: Colors.redAccent),
                      onPressed: () {
                        _showDeleteConfirmationDialog(context, entry);
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status) {
      case 'Completed':
        badgeColor = Colors.green;
        break;
      case 'Pending':
        badgeColor = Colors.orange;
        break;
      case 'Failed':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6.0, vertical: 2.0),
      margin: const EdgeInsets.only(top: 4.0),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4.0),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12.0),
      ),
    );
  }

  void _showCreateDialog(BuildContext context) {
    _customerNameController.clear();
    _typeController.clear();
    _amountController.clear();
    _currencyController.clear();
    _statusController.clear();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Create Loyalty Entry', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: _customerNameController,
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _typeController,
                  decoration: InputDecoration(
                    labelText: 'Type (Earned, Redeemed, Adjusted)',
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
                    labelText: 'Currency (NGN, USD)',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _statusController,
                  decoration: InputDecoration(
                    labelText: 'Status (Completed, Pending, Failed)',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                try {
                  final api = ref.read(apiServiceProvider);
                  await api.post('/trpc/loyalty.create', body: {
                    'customerName': _customerNameController.text,
                    'type': _typeController.text,
                    'amount': double.parse(_amountController.text),
                    'currency': _currencyController.text,
                    'date': DateTime.now().toIso8601String(), // Auto-set current date
                    'status': _statusController.text,
                  });
                  ref.invalidate(loyaltyLedgerProvider(_searchTerm)); // Refresh data
                  Navigator.of(context).pop();
                } catch (e) {
                  // Handle error, e.g., show a SnackBar
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create entry: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(BuildContext context, LoyaltyLedgerEntry entry) {
    _customerNameController.text = entry.customerName;
    _typeController.text = entry.type;
    _amountController.text = entry.amount.toString();
    _currencyController.text = entry.currency;
    _statusController.text = entry.status;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Edit Loyalty Entry ${entry.id}', style: const TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: _customerNameController,
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _typeController,
                  decoration: InputDecoration(
                    labelText: 'Type (Earned, Redeemed, Adjusted)',
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
                    labelText: 'Currency (NGN, USD)',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _statusController,
                  decoration: InputDecoration(
                    labelText: 'Status (Completed, Pending, Failed)',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                try {
                  final api = ref.read(apiServiceProvider);
                  await api.post('/trpc/loyalty.update', body: {
                    'id': entry.id,
                    'customerName': _customerNameController.text,
                    'type': _typeController.text,
                    'amount': double.parse(_amountController.text),
                    'currency': _currencyController.text,
                    'date': entry.date.toIso8601String(), // Keep original date
                    'status': _statusController.text,
                  });
                  ref.invalidate(loyaltyLedgerProvider(_searchTerm)); // Refresh data
                  Navigator.of(context).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update entry: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, LoyaltyLedgerEntry entry) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Delete Loyalty Entry', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete entry for ${entry.customerName}?', style: const TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                try {
                  final api = ref.read(apiServiceProvider);
                  await api.post('/trpc/loyalty.delete', body: {'id': entry.id});
                  ref.invalidate(loyaltyLedgerProvider(_searchTerm)); // Refresh data
                  Navigator.of(context).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete entry: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }
}
