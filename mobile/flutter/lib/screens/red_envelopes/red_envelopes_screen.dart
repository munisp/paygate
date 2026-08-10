import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart'; // For date and currency formatting
import '../../services/api_service.dart'; // Assuming this path is correct

// Define a data model for Red Envelopes (placeholder)
class RedEnvelope {
  final String id;
  final String title;
  final double amount;
  final String currency;
  final String status;
  final DateTime createdAt;

  RedEnvelope({
    required this.id,
    required this.title,
    required this.amount,
    required this.currency,
    required this.status,
    required this.createdAt,
  });

  factory RedEnvelope.fromJson(Map<String, dynamic> json) {
    return RedEnvelope(
      id: json['id'],
      title: json['title'],
      amount: json['amount'].toDouble(),
      currency: json['currency'],
      status: json['status'],
      createdAt: DateTime.parse(json['createdAt']), // Assuming ISO 8601 string
    );
  }
}

// Provider for fetching Red Envelopes data
final redEnvelopesProvider = FutureProvider.family<List<RedEnvelope>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call for listing Red Envelopes
  // In a real scenario, this would be: api.get('/trpc/redEnvelopes.list', params: {'query': query})
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay

  // Placeholder data
  final List<Map<String, dynamic>> data = [
    {
      'id': 're_001',
      'title': 'Birthday Bonus',
      'amount': 1500.00,
      'currency': 'NGN',
      'status': 'active',
      'createdAt': '2026-05-10T10:00:00Z'
    },
    {
      'id': 're_002',
      'title': 'Holiday Gift',
      'amount': 25.50,
      'currency': 'USD',
      'status': 'expired',
      'createdAt': '2026-04-20T15:30:00Z'
    },
    {
      'id': 're_003',
      'title': 'New Year Promo',
      'amount': 5000.00,
      'currency': 'NGN',
      'status': 'pending',
      'createdAt': '2026-01-01T08:00:00Z'
    },
    {
      'id': 're_004',
      'title': 'Loyalty Reward',
      'amount': 100.00,
      'currency': 'USD',
      'status': 'active',
      'createdAt': '2026-03-15T11:45:00Z'
    },
  ];

  // Filter data based on query (case-insensitive title search)
  final filteredData = data.where((item) =>
      item['title'].toLowerCase().contains(query.toLowerCase())).toList();

  return filteredData.map((json) => RedEnvelope.fromJson(json)).toList();
});

// Provider for creating a Red Envelope
final createRedEnvelopeProvider = FutureProvider.family<RedEnvelope, Map<String, dynamic>>((ref, newEnvelopeData) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call for creating a Red Envelope
  // In a real scenario, this would be: api.post('/trpc/redEnvelopes.create', body: newEnvelopeData)
  await Future.delayed(const Duration(seconds: 1));
  final newEnvelope = RedEnvelope(
    id: 're_${DateTime.now().millisecondsSinceEpoch}',
    title: newEnvelopeData['title'],
    amount: newEnvelopeData['amount'],
    currency: newEnvelopeData['currency'],
    status: 'active',
    createdAt: DateTime.now(),
  );
  return newEnvelope;
});

// Provider for updating a Red Envelope
final updateRedEnvelopeProvider = FutureProvider.family<RedEnvelope, Map<String, dynamic>>((ref, updatedEnvelopeData) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call for updating a Red Envelope
  // In a real scenario, this would be: api.post('/trpc/redEnvelopes.update', body: updatedEnvelopeData)
  await Future.delayed(const Duration(seconds: 1));
  final updatedEnvelope = RedEnvelope(
    id: updatedEnvelopeData['id'],
    title: updatedEnvelopeData['title'],
    amount: updatedEnvelopeData['amount'],
    currency: updatedEnvelopeData['currency'],
    status: updatedEnvelopeData['status'],
    createdAt: DateTime.parse(updatedEnvelopeData['createdAt']), // Assuming original createdAt is passed
  );
  return updatedEnvelope;
});

// Provider for deleting a Red Envelope
final deleteRedEnvelopeProvider = FutureProvider.family<void, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call for deleting a Red Envelope
  // In a real scenario, this would be: api.post('/trpc/redEnvelopes.delete', body: {'id': id})
  await Future.delayed(const Duration(seconds: 1));
  return;
});

class RedEnvelopesScreen extends ConsumerStatefulWidget {
  const RedEnvelopesScreen({super.key});

  @override
  ConsumerState<RedEnvelopesScreen> createState() => _RedEnvelopesScreenState();
}

class _RedEnvelopesScreenState extends ConsumerState<RedEnvelopesScreen> {
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

  Future<void> _refreshRedEnvelopes() async {
    ref.invalidate(redEnvelopesProvider(_searchQuery));
    await ref.read(redEnvelopesProvider(_searchQuery).future);
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'expired':
        return Colors.red;
      case 'pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(
      locale: 'en_US',
      symbol: currency == 'NGN' ? '₦' : '\$',
      decimalDigits: 2,
    );
    return format.format(amount);
  }

  Future<void> _showCreateEditDialog({RedEnvelope? redEnvelope}) async {
    final isEditing = redEnvelope != null;
    final titleController = TextEditingController(text: isEditing ? redEnvelope.title : '');
    final amountController = TextEditingController(text: isEditing ? redEnvelope.amount.toString() : '');
    String? selectedCurrency = isEditing ? redEnvelope.currency : 'NGN';

    await showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: const Color(0xFF1e293b), // Card color
        title: Text(isEditing ? 'Edit Red Envelope' : 'Create Red Envelope', style: const TextStyle(color: Color(0xFFf1f5f9))), // Text color
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleController,
              decoration: const InputDecoration(
                labelText: 'Title',
                labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
            const SizedBox(height: 16),
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
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: selectedCurrency,
              dropdownColor: const Color(0xFF1e293b),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
              decoration: const InputDecoration(
                labelText: 'Currency',
                labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
              ),
              items: <String>['NGN', 'USD'].map((String value) {
                return DropdownMenuItem<String>(
                  value: value,
                  child: Text(value),
                );
              }).toList(),
              onChanged: (String? newValue) {
                selectedCurrency = newValue;
              },
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () async {
              if (titleController.text.isEmpty || amountController.text.isEmpty || selectedCurrency == null) {
                // Show error or toast
                return;
              }
              final amount = double.tryParse(amountController.text);
              if (amount == null) {
                // Show error for invalid amount
                return;
              }

              final data = {
                'title': titleController.text,
                'amount': amount,
                'currency': selectedCurrency,
                'createdAt': isEditing ? redEnvelope!.createdAt.toIso8601String() : DateTime.now().toIso8601String(),
                if (isEditing) 'id': redEnvelope.id,
                if (isEditing) 'status': redEnvelope.status, // Preserve status on edit
              };

              if (isEditing) {
                await ref.read(updateRedEnvelopeProvider(data).future);
              } else {
                await ref.read(createRedEnvelopeProvider(data).future);
              }
              ref.invalidate(redEnvelopesProvider(_searchQuery)); // Refresh list
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      );
    });
  }

  Future<void> _confirmDelete(String id) async {
    final bool? confirm = await showDialog<bool>(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: const Color(0xFF1e293b), // Card color
        title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        content: const Text('Are you sure you want to delete this Red Envelope?', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      );
    });

    if (confirm == true) {
      await ref.read(deleteRedEnvelopeProvider(id).future);
      ref.invalidate(redEnvelopesProvider(_searchQuery)); // Refresh list
    }
  }

  @override
  Widget build(BuildContext context) {
    final redEnvelopesAsyncValue = ref.watch(redEnvelopesProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Background color
      appBar: AppBar(
        title: const Text('Red Envelopes', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        backgroundColor: const Color(0xFF1e293b), // Card color
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Back button color
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showCreateEditDialog(),
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
                hintText: 'Search Red Envelopes...', 
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: const BorderSide(color: Color(0xFF6366f1)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: const BorderSide(color: Color(0xFF6366f1)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: const BorderSide(color: Color(0xFF6366f1)),
                ),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshRedEnvelopes,
              color: const Color(0xFF6366f1), // Accent color for refresh indicator
              child: redEnvelopesAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color
                error: (err, stack) => Center(
                  child: Text('Error: \$err', style: const TextStyle(color: Colors.redAccent)),
                ),
                data: (redEnvelopes) {
                  if (redEnvelopes.isEmpty) {
                    return const Center(
                      child: Text('No Red Envelopes found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }
                  return ListView.builder(
                    itemCount: redEnvelopes.length,
                    itemBuilder: (context, index) {
                      final envelope = redEnvelopes[index];
                      return Card(
                        color: const Color(0xFF1e293b), // Card color
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(envelope.title, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Amount: \${_formatAmount(envelope.amount, envelope.currency)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Text('Created: \${DateFormat('yyyy-MM-dd HH:mm').format(envelope.createdAt)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Row(
                                children: [
                                  const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(envelope.status),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      envelope.status.toUpperCase(),
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
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _showCreateEditDialog(redEnvelope: envelope),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _confirmDelete(envelope.id),
                              ),
                            ],
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
}
