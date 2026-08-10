import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class QuickPayScreen extends ConsumerStatefulWidget {
  const QuickPayScreen({super.key});

  @override
  ConsumerState<QuickPayScreen> createState() => _QuickPayScreenState();
}

class _QuickPayScreenState extends ConsumerState<QuickPayScreen> {
  bool _isLoading = false;
  String? _error;
  List<dynamic> _quickPayItems = [];

  @override
  void initState() {
    super.initState();
    _fetchQuickPayItems();
  }

  Future<void> _fetchQuickPayItems() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      // Assuming 'quickPay' is the tRPC router namespace for QuickPay
      final response = await ref.read(apiServiceProvider).get('/trpc/quickPay.list', params: {});
      setState(() {
        _quickPayItems = response['items']; // Adjust based on actual API response structure
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
      });
    }
    finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('QuickPay', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchQuickPayItems,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))) // Accent color
            : _error != null
                ? Center(
                    child: Text('Error: $_error', style: const TextStyle(color: Color(0xFFf1f5f9))),
                  )
                : _quickPayItems.isEmpty
                    ? const Center(
                        child: Text('No QuickPay items found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                      )
                    : ListView.builder(
                        itemCount: _quickPayItems.length,
                        itemBuilder: (context, index) {
                          final item = _quickPayItems[index];
                          return Card(
                            color: const Color(0xFF1e293b), // Card background
                            margin: const EdgeInsets.all(8.0),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item['name'] ?? 'N/A', style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 18, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 8),
                                  Text('Amount: ${item['currency'] == 'NGN' ? '₦' : '$'}${item['amount']?.toStringAsFixed(2) ?? '0.00'}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                                  Text.rich(
                                    TextSpan(
                                      text: 'Status: ',
                                      style: const TextStyle(color: Color(0xFFf1f5f9)),
                                      children: [
                                        TextSpan(
                                          text: item['status'] ?? 'Unknown',
                                          style: TextStyle(
                                            color: _getStatusColor(item['status']),
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text('Date: ${_formatDate(item['createdAt'])}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      IconButton(
                                        icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                        onPressed: () => _editQuickPayItem(item),
                                      ),
                                      IconButton(
                                        icon: const Icon(Icons.delete, color: Colors.redAccent),
                                        onPressed: () => _confirmDeleteQuickPayItem(item),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createQuickPayItem,
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Color _getStatusColor(String? status) {
    switch (status?.toLowerCase()) {
      case 'completed':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'failed':
        return Colors.red;
      default:
        return const Color(0xFFf1f5f9);
    }
  }

  String _formatDate(String? dateString) {
    if (dateString == null) return 'N/A';
    try {
      final dateTime = DateTime.parse(dateString);
      return '${dateTime.day}/${dateTime.month}/${dateTime.year} ${dateTime.hour}:${dateTime.minute}';
    } catch (e) {
      return 'Invalid Date';
    }
  }

  void _createQuickPayItem() {
    // Implement create dialog
    showDialog(
      context: context,
      builder: (BuildContext context) {
        String name = '';
        double amount = 0.0;
        String currency = 'NGN';

        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create QuickPay Item', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                onChanged: (value) => name = value,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              TextField(
                onChanged: (value) => amount = double.tryParse(value) ?? 0.0,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              DropdownButtonFormField<String>(
                value: currency,
                dropdownColor: const Color(0xFF1e293b),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: const InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
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
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                Navigator.pop(context);
                // Call tRPC API to create item
                try {
                  await ref.read(apiServiceProvider).post(
                    '/trpc/quickPay.create',
                    body: {'name': name, 'amount': amount, 'currency': currency},
                  );
                  _fetchQuickPayItems(); // Refresh list
                } catch (e) {
                  // Handle error
                  setState(() {
                    _error = 'Failed to create item: ${e.toString()}';
                  });
                }
              },
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _editQuickPayItem(dynamic item) {
    // Implement edit dialog
    showDialog(
      context: context,
      builder: (BuildContext context) {
        String name = item['name'] ?? '';
        double amount = item['amount'] ?? 0.0;
        String currency = item['currency'] ?? 'NGN';

        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit QuickPay Item', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: TextEditingController(text: name),
                onChanged: (value) => name = value,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              TextField(
                controller: TextEditingController(text: amount.toStringAsFixed(2)),
                onChanged: (value) => amount = double.tryParse(value) ?? 0.0,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              DropdownButtonFormField<String>(
                value: currency,
                dropdownColor: const Color(0xFF1e293b),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: const InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
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
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                Navigator.pop(context);
                // Call tRPC API to update item
                try {
                  await ref.read(apiServiceProvider).post(
                    '/trpc/quickPay.update',
                    body: {'id': item['id'], 'name': name, 'amount': amount, 'currency': currency},
                  );
                  _fetchQuickPayItems(); // Refresh list
                } catch (e) {
                  // Handle error
                  setState(() {
                    _error = 'Failed to update item: ${e.toString()}';
                  });
                }
              },
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _confirmDeleteQuickPayItem(dynamic item) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete ${item['name']}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                Navigator.pop(context);
                // Call tRPC API to delete item
                try {
                  await ref.read(apiServiceProvider).post(
                    '/trpc/quickPay.delete',
                    body: {'id': item['id']},
                  );
                  _fetchQuickPayItems(); // Refresh list
                } catch (e) {
                  // Handle error
                  setState(() {
                    _error = 'Failed to delete item: ${e.toString()}';
                  });
                }
              },
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
            ),
          ],
        );
      },
    );
  }
}