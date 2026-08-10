import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define data models for POS transactions
class POSTransaction {
  final String id;
  final String merchantId;
  final String customerName;
  final double amount;
  final String currency;
  final DateTime transactionDate;
  final String status;

  POSTransaction({
    required this.id,
    required this.merchantId,
    required this.customerName,
    required this.amount,
    required this.currency,
    required this.transactionDate,
    required this.status,
  });

  factory POSTransaction.fromJson(Map<String, dynamic> json) {
    return POSTransaction(
      id: json['id'],
      merchantId: json['merchantId'],
      customerName: json['customerName'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      transactionDate: DateTime.parse(json['transactionDate']),
      status: json['status'],
    );
  }
}

// Riverpod provider for fetching POS transactions
final posTransactionsProvider = FutureProvider.family<List<POSTransaction>, String>((ref, query) async {
  // Simulate API call
  await Future.delayed(const Duration(seconds: 1));
  // Replace with actual tRPC API call
  // final response = await ref.read(apiServiceProvider).get('/trpc/posTransactions.list', params: {'query': query});
  // return (response as List).map((e) => POSTransaction.fromJson(e)).toList();

  // Mock data for demonstration
  return [
    POSTransaction(id: '1', merchantId: 'm1', customerName: 'Alice', amount: 1500.00, currency: 'NGN', transactionDate: DateTime.now().subtract(const Duration(days: 1)), status: 'Completed'),
    POSTransaction(id: '2', merchantId: 'm1', customerName: 'Bob', amount: 25.50, currency: 'USD', transactionDate: DateTime.now().subtract(const Duration(days: 2)), status: 'Pending'),
    POSTransaction(id: '3', merchantId: 'm1', customerName: 'Charlie', amount: 500.00, currency: 'NGN', transactionDate: DateTime.now().subtract(const Duration(days: 3)), status: 'Failed'),
    POSTransaction(id: '4', merchantId: 'm1', customerName: 'David', amount: 100.00, currency: 'USD', transactionDate: DateTime.now().subtract(const Duration(days: 4)), status: 'Completed'),
  ];
});

// Riverpod provider for managing search query
final searchQueryProvider = StateProvider<String>((ref) => '');

class POSTransactionsScreen extends ConsumerStatefulWidget {
  const POSTransactionsScreen({super.key});

  @override
  ConsumerState<POSTransactionsScreen> createState() => _POSTransactionsScreenState();
}

class _POSTransactionsScreenState extends ConsumerState<POSTransactionsScreen> {
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

  @override
  Widget build(BuildContext context) {
    final searchQuery = ref.watch(searchQueryProvider);
    final posTransactionsAsyncValue = ref.watch(posTransactionsProvider(searchQuery));

    // Dark theme colors
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: const Text('POS Transactions', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: textColor),
            onPressed: () => _showCreateTransactionDialog(context, accentColor, textColor),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: textColor),
              decoration: InputDecoration(
                hintText: 'Search transactions...', 
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
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(posTransactionsProvider(searchQuery));
              },
              child: posTransactionsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: accentColor)),
                error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.red))),
                data: (transactions) {
                  if (transactions.isEmpty) {
                    return Center(
                      child: Text(
                        'No transactions found.',
                        style: TextStyle(color: textColor.withOpacity(0.7), fontSize: 16),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: transactions.length,
                    itemBuilder: (context, index) {
                      final transaction = transactions[index];
                      return Card(
                        color: cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(
                            '${transaction.customerName} - ${transaction.currency == 'NGN' ? '₦' : '$'}${transaction.amount.toStringAsFixed(2)}',
                            style: const TextStyle(color: textColor, fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            '${transaction.transactionDate.toLocal().toString().split(' ')[0]} - Status: ${transaction.status}',
                            style: TextStyle(color: textColor.withOpacity(0.8)),
                          ),
                          trailing: _buildStatusBadge(transaction.status),
                          onTap: () => _showEditTransactionDialog(context, transaction, accentColor, textColor),
                          leading: IconButton(
                            icon: const Icon(Icons.delete, color: Colors.redAccent),
                            onPressed: () => _confirmDeleteTransaction(context, transaction.id, accentColor, textColor),
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
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
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  void _showCreateTransactionDialog(BuildContext context, Color accentColor, Color textColor) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        String customerName = '';
        double amount = 0.0;
        String currency = 'NGN';
        String status = 'Pending';

        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create Transaction', style: TextStyle(color: Color(0xFFf1f5f9)))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  onChanged: (value) => customerName = value,
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: accentColor)),
                  ),
                  style: const TextStyle(color: textColor),
                ),
                TextField(
                  onChanged: (value) => amount = double.tryParse(value) ?? 0.0,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: accentColor)),
                  ),
                  style: const TextStyle(color: textColor),
                ),
                DropdownButtonFormField<String>(
                  value: currency,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: textColor),
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: accentColor)),
                  ),
                  items: <String>['NGN', 'USD'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      currency = newValue;
                    }
                  },
                ),
                DropdownButtonFormField<String>(
                  value: status,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: textColor),
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: accentColor)),
                  ),
                  items: <String>['Pending', 'Completed', 'Failed'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      status = newValue;
                    }
                  },
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: Text('Create', style: TextStyle(color: accentColor)),
              onPressed: () async {
                // Simulate API call for creating transaction
                // await ref.read(apiServiceProvider).post('/trpc/posTransactions.create', body: {
                //   'customerName': customerName,
                //   'amount': amount,
                //   'currency': currency,
                //   'status': status,
                // });
                ref.invalidate(posTransactionsProvider(searchQuery)); // Refresh list
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditTransactionDialog(BuildContext context, POSTransaction transaction, Color accentColor, Color textColor) {
    String customerName = transaction.customerName;
    double amount = transaction.amount;
    String currency = transaction.currency;
    String status = transaction.status;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Transaction', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: TextEditingController(text: customerName),
                  onChanged: (value) => customerName = value,
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: accentColor)),
                  ),
                  style: const TextStyle(color: textColor),
                ),
                TextField(
                  controller: TextEditingController(text: amount.toString()),
                  onChanged: (value) => amount = double.tryParse(value) ?? 0.0,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: accentColor)),
                  ),
                  style: const TextStyle(color: textColor),
                ),
                DropdownButtonFormField<String>(
                  value: currency,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: textColor),
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: accentColor)),
                  ),
                  items: <String>['NGN', 'USD'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      currency = newValue;
                    }
                  },
                ),
                DropdownButtonFormField<String>(
                  value: status,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: textColor),
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: accentColor)),
                  ),
                  items: <String>['Pending', 'Completed', 'Failed'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      status = newValue;
                    }
                  },
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: Text('Save', style: TextStyle(color: accentColor)),
              onPressed: () async {
                // Simulate API call for updating transaction
                // await ref.read(apiServiceProvider).post('/trpc/posTransactions.update', body: {
                //   'id': transaction.id,
                //   'customerName': customerName,
                //   'amount': amount,
                //   'currency': currency,
                //   'status': status,
                // });
                ref.invalidate(posTransactionsProvider(searchQuery)); // Refresh list
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _confirmDeleteTransaction(BuildContext context, String transactionId, Color accentColor, Color textColor) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this transaction?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                // Simulate API call for deleting transaction
                // await ref.read(apiServiceProvider).post('/trpc/posTransactions.delete', body: {'id': transactionId});
                ref.invalidate(posTransactionsProvider(searchQuery)); // Refresh list
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}