import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart'; // For date and currency formatting
import '../../services/api_service.dart';

// Placeholder for PIX Gateway data model
class PixGatewayEntry {
  final String id;
  final String name;
  final String status;
  final double amount;
  final DateTime transactionDate;

  PixGatewayEntry({
    required this.id,
    required this.name,
    required this.status,
    required this.amount,
    required this.transactionDate,
  });

  factory PixGatewayEntry.fromJson(Map<String, dynamic> json) {
    return PixGatewayEntry(
      id: json['id'] as String,
      name: json['name'] as String,
      status: json['status'] as String,
      amount: (json['amount'] as num).toDouble(),
      transactionDate: DateTime.parse(json['transactionDate'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'status': status,
        'amount': amount,
        'transactionDate': transactionDate.toIso8601String(),
      };
}

// Riverpod provider for PIX Gateway data with search functionality
final pixGatewayProvider = FutureProvider.family<List<PixGatewayEntry>, String>((ref, searchQuery) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/pixGateway.list', params: {'search': searchQuery});
    // Assuming response.data is a List<Map<String, dynamic>>
    return (response.data as List)
        .map((e) => PixGatewayEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (e) {
    throw Exception('Failed to load PIX Gateway data: $e');
  }
});

class PIXGatewayScreen extends ConsumerStatefulWidget {
  const PIXGatewayScreen({super.key});

  @override
  ConsumerState<PIXGatewayScreen> createState() => _PIXGatewayScreenState();
}

class _PIXGatewayScreenState extends ConsumerState<PIXGatewayScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _currentSearchQuery = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _currentSearchQuery = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'completed':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'failed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _formatAmount(double amount) {
    final formatCurrency = NumberFormat.currency(locale: 'en_US', symbol: '$'); // Default to USD
    // For Naira: NumberFormat.currency(locale: 'en_NG', symbol: '₦');
    return formatCurrency.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('yyyy-MM-dd HH:mm').format(date);
  }

  Future<void> _createEntry() async {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController statusController = TextEditingController();
    final TextEditingController amountController = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Entry', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16.0),
              TextField(
                controller: statusController,
                decoration: const InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16.0),
              TextField(
                controller: amountController,
                keyboardType: TextInputType.number, // Ensure numeric input
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ],
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () { Navigator.of(context).pop(); },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/pixGateway.create', body: {
                    'name': nameController.text,
                    'status': statusController.text,
                    'amount': double.tryParse(amountController.text) ?? 0.0,
                    'transactionDate': DateTime.now().toIso8601String(),
                  });
                  ref.invalidate(pixGatewayProvider(_currentSearchQuery));
                  Navigator.of(context).pop();
                } catch (e) {
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

  Future<void> _editEntry(PixGatewayEntry entry) async {
    final TextEditingController nameController = TextEditingController(text: entry.name);
    final TextEditingController statusController = TextEditingController(text: entry.status);
    final TextEditingController amountController = TextEditingController(text: entry.amount.toString());

    await showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Entry', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16.0),
              TextField(
                controller: statusController,
                decoration: const InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16.0),
              TextField(
                controller: amountController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ],
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () { Navigator.of(context).pop(); },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/pixGateway.update', body: {
                    'id': entry.id,
                    'name': nameController.text,
                    'status': statusController.text,
                    'amount': double.tryParse(amountController.text) ?? 0.0,
                    'transactionDate': entry.transactionDate.toIso8601String(), // Keep original date for update
                  });
                  ref.invalidate(pixGatewayProvider(_currentSearchQuery));
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

  Future<void> _deleteEntry(String id) async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this entry?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () { Navigator.of(context).pop(false); },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.red)),
              onPressed: () { Navigator.of(context).pop(true); },
            ),
          ],
        );
      },
    );

    if (confirm == true) {
      final api = ref.read(apiServiceProvider);
      try {
        await api.post('/trpc/pixGateway.delete', body: {'id': id});
        ref.invalidate(pixGatewayProvider(_currentSearchQuery));
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete entry: $e'))
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pixGatewayAsyncValue = ref.watch(pixGatewayProvider(_currentSearchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'PIX Gateway',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Light text
        ),
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight + 16.0), // Increased height for padding
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search PIX Gateway entries...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF0f172a),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(pixGatewayProvider(_currentSearchQuery));
          await ref.read(pixGatewayProvider(_currentSearchQuery).future);
        },
        child: pixGatewayAsyncValue.when(
          data: (entries) {
            if (entries.isEmpty) {
              return LayoutBuilder(
                builder: (context, constraints) {
                  return SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(minHeight: constraints.maxHeight),
                      child: const Center(
                        child: Text(
                          'No PIX Gateway entries found.',
                          style: TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                      ),
                    ),
                  );
                },
              );
            }
            return ListView.builder(
              itemCount: entries.length,
              itemBuilder: (context, index) {
                final entry = entries[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card background
                  margin: const EdgeInsets.all(8.0),
                  child: ListTile(
                    title: Text(
                      entry.name,
                      style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4.0),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6.0, vertical: 2.0),
                              decoration: BoxDecoration(
                                color: _getStatusColor(entry.status),
                                borderRadius: BorderRadius.circular(4.0),
                              ),
                              child: Text(
                                entry.status.toUpperCase(),
                                style: const TextStyle(color: Colors.white, fontSize: 10.0),
                              ),
                            ),
                            const SizedBox(width: 8.0),
                            Text(
                              _formatAmount(entry.amount),
                              style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 14.0),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4.0),
                        Text(
                          'Date: ${_formatDate(entry.transactionDate)}',
                          style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7), fontSize: 12.0),
                        ),
                      ],
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                          onPressed: () => _editEntry(entry),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.redAccent),
                          onPressed: () => _deleteEntry(entry.id),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(
            child: CircularProgressIndicator(color: Color(0xFF6366f1)), // Accent color
          ),
          error: (error, stack) => LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Center(
                    child: Text(
                      'Error: ${error.toString()}',
                      style: const TextStyle(color: Colors.red), // Error text
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createEntry,
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}
