import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class FxHedgingWorkflowScreen extends ConsumerStatefulWidget {
  const FxHedgingWorkflowScreen({super.key});

  @override
  ConsumerState<FxHedgingWorkflowScreen> createState() => _FxHedgingWorkflowScreenState();
}

class _FxHedgingWorkflowScreenState extends ConsumerState<FxHedgingWorkflowScreen> {
  bool _isLoading = true;
  String? _error;
  List<dynamic> _data = [];

  @override
  void initState() {
    super.initState();
    _fetchData();
  }

  Future<void> _fetchData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      // Example tRPC API call for listing data
      final response = await ref.read(apiServiceProvider).get('/trpc/fxHedgingWorkflow.list', params: {'search': ''});
      setState(() {
        _data = response['data']; // Assuming response has a 'data' key
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  // Helper for currency formatting
  String _formatAmount(double amount, String currency) {
    if (currency == 'NGN') {
      return '₦${amount.toStringAsFixed(2)}';
    } else if (currency == 'USD') {
      return '$${amount.toStringAsFixed(2)}';
    }
    return amount.toStringAsFixed(2);
  }

  // Helper for date formatting
  String _formatDate(String dateString) {
    final dateTime = DateTime.parse(dateString);
    return '${dateTime.day}/${dateTime.month}/${dateTime.year}';
  }

  // Helper for status badge color
  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'rejected':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('FX Hedging Workflow', style: TextStyle(color: Color(0xFFf1f5f9))), 
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchData,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1)))
            : _error != null
                ? Center(
                    child: Text('Error: $_error', style: const TextStyle(color: Color(0xFFf1f5f9))),
                  )
                : _data.isEmpty
                    ? Center(
                        child: Text('No FX Hedging Workflows found.', style: const TextStyle(color: Color(0xFFf1f5f9))),
                      )
                    : ListView.builder(
                        itemCount: _data.length,
                        itemBuilder: (context, index) {
                          final item = _data[index];
                          return Card(
                            color: const Color(0xFF1e293b),
                            margin: const EdgeInsets.all(8.0),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('ID: ${item['id']}', style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 4.0),
                                  Text('Amount: ${_formatAmount(item['amount'].toDouble(), item['currency'])}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                                  const SizedBox(height: 4.0),
                                  Text('Date: ${_formatDate(item['date'])}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                                  const SizedBox(height: 4.0),
                                  Row(
                                    children: [
                                      const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9))),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                                        decoration: BoxDecoration(
                                          color: _getStatusColor(item['status']),
                                          borderRadius: BorderRadius.circular(4.0),
                                        ),
                                        child: Text(item['status'], style: const TextStyle(color: Colors.white)),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8.0),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      IconButton(
                                        icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                        onPressed: () {
                                          // Implement edit functionality
                                          _showEditDialog(item);
                                        },
                                      ),
                                      IconButton(
                                        icon: const Icon(Icons.delete, color: Colors.redAccent),
                                        onPressed: () {
                                          // Implement delete functionality with confirmation
                                          _showDeleteConfirmationDialog(item['id']);
                                        },
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
        onPressed: () {
          // Implement create functionality
          _showCreateDialog();
        },
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  void _showCreateDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Workflow', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 10),
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Date (YYYY-MM-DD)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
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
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                // Simulate API call for creation
                // await ref.read(apiServiceProvider).post('/trpc/fxHedgingWorkflow.create', body: {...});
                Navigator.of(context).pop();
                _fetchData(); // Refresh list after creation
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(dynamic item) {
    // Pre-fill controllers with existing item data
    final TextEditingController amountController = TextEditingController(text: item['amount'].toString());
    final TextEditingController currencyController = TextEditingController(text: item['currency']);
    final TextEditingController dateController = TextEditingController(text: item['date']);
    final TextEditingController statusController = TextEditingController(text: item['status']);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Workflow', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: amountController,
                  decoration: const InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: currencyController,
                  decoration: const InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: dateController,
                  decoration: const InputDecoration(
                    labelText: 'Date (YYYY-MM-DD)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
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
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                // Simulate API call for update
                // await ref.read(apiServiceProvider).post('/trpc/fxHedgingWorkflow.update', body: {'id': item['id'], 'amount': amountController.text, ...});
                Navigator.of(context).pop();
                _fetchData(); // Refresh list after update
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(String id) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this workflow?', style: TextStyle(color: Color(0xFFf1f5f9))),
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
                // Simulate API call for deletion
                // await ref.read(apiServiceProvider).post('/trpc/fxHedgingWorkflow.delete', body: {'id': id});
                Navigator.of(context).pop();
                _fetchData(); // Refresh list after deletion
              },
            ),
          ],
        );
      },
    );
  }
}
