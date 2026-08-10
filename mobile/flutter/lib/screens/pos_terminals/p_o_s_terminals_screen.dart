import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Assuming a simple data model for a POS Terminal
class PosTerminal {
  final String id;
  final String name;
  final String status;
  final double amount;
  final DateTime createdAt;

  PosTerminal({
    required this.id,
    required this.name,
    required this.status,
    required this.amount,
    required this.createdAt,
  });

  factory PosTerminal.fromJson(Map<String, dynamic> json) {
    return PosTerminal(
      id: json['id'],
      name: json['name'],
      status: json['status'],
      amount: (json['amount'] as num).toDouble(),
      createdAt: DateTime.parse(json['createdAt']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'status': status,
        'amount': amount,
        'createdAt': createdAt.toIso8601String(),
      };
}

// Riverpod provider for fetching POS terminals
final posTerminalsProvider = FutureProvider.family<List<PosTerminal>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // final response = await api.get('/trpc/posTerminals.list', params: {'query': query});
  // return (response.data as List).map((e) => PosTerminal.fromJson(e)).toList();

  // Mock data for demonstration
  await Future.delayed(const Duration(seconds: 1));
  final allTerminals = [
    PosTerminal(id: '1', name: 'Terminal A', status: 'Active', amount: 1500.00, createdAt: DateTime(2023, 1, 15)),
    PosTerminal(id: '2', name: 'Terminal B', status: 'Inactive', amount: 250.50, createdAt: DateTime(2023, 2, 20)),
    PosTerminal(id: '3', name: 'Terminal C', status: 'Active', amount: 3000.75, createdAt: DateTime(2023, 3, 10)),
    PosTerminal(id: '4', name: 'Terminal D', status: 'Pending', amount: 500.00, createdAt: DateTime(2023, 4, 5)),
    PosTerminal(id: '5', name: 'Terminal E', status: 'Active', amount: 1200.00, createdAt: DateTime(2023, 5, 1)),
  ];
  return allTerminals.where((terminal) => terminal.name.toLowerCase().contains(query.toLowerCase())).toList();
});

class POSTerminalsScreen extends ConsumerStatefulWidget {
  const POSTerminalsScreen({super.key});

  @override
  ConsumerState<POSTerminalsScreen> createState() => _POSTerminalsScreenState();
}

class _POSTerminalsScreenState extends ConsumerState<POSTerminalsScreen> {
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

  Future<void> _refreshTerminals() async {
    ref.refresh(posTerminalsProvider(_searchQuery));
  }

  // Helper to format currency
  String _formatCurrency(double amount) {
    // In a real app, you'd use a package like `intl` for proper localization
    return '₦${amount.toStringAsFixed(2)}'; // Example for Naira
  }

  // Helper to format date
  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  // Helper to get status badge color
  Color _getStatusColor(String status) {
    switch (status) {
      case 'Active':
        return Colors.green;
      case 'Inactive':
        return Colors.red;
      case 'Pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  // CRUD: Create Terminal
  Future<void> _createTerminal() async {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController amountController = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Terminal', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Terminal Name',
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
                  labelText: 'Initial Amount',
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
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                // Simulate API call for creating a terminal
                // final api = ref.read(apiServiceProvider);
                // await api.post('/trpc/posTerminals.create', body: {
                //   'name': nameController.text,
                //   'amount': double.parse(amountController.text),
                // });
                Navigator.of(dialogContext).pop();
                _refreshTerminals(); // Refresh list after creation
              },
            ),
          ],
        );
      },
    );
  }

  // CRUD: Edit Terminal
  Future<void> _editTerminal(PosTerminal terminal) async {
    final TextEditingController nameController = TextEditingController(text: terminal.name);
    final TextEditingController amountController = TextEditingController(text: terminal.amount.toString());
    final TextEditingController statusController = TextEditingController(text: terminal.status);

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Terminal', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Terminal Name',
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
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                // Simulate API call for updating a terminal
                // final api = ref.read(apiServiceProvider);
                // await api.post('/trpc/posTerminals.update', body: {
                //   'id': terminal.id,
                //   'name': nameController.text,
                //   'amount': double.parse(amountController.text),
                //   'status': statusController.text,
                // });
                Navigator.of(dialogContext).pop();
                _refreshTerminals(); // Refresh list after update
              },
            ),
          ],
        );
      },
    );
  }

  // CRUD: Delete Terminal
  Future<void> _deleteTerminal(String terminalId) async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this terminal?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.red)),
              onPressed: () async {
                // Simulate API call for deleting a terminal
                // final api = ref.read(apiServiceProvider);
                // await api.post('/trpc/posTerminals.delete', body: {'id': terminalId});
                Navigator.of(dialogContext).pop();
                _refreshTerminals(); // Refresh list after deletion
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<PosTerminal>> terminalsAsyncValue = ref.watch(posTerminalsProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('POS Terminals', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: _createTerminal,
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
                hintText: 'Search terminals...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF1e293b),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshTerminals,
              color: const Color(0xFF6366f1),
              backgroundColor: const Color(0xFF1e293b),
              child: terminalsAsyncValue.when(
                data: (terminals) {
                  if (terminals.isEmpty) {
                    return const Center(
                      child: Text(
                        'No POS terminals found.',
                        style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 18),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: terminals.length,
                    itemBuilder: (context, index) {
                      final terminal = terminals[index];
                      return Card(
                        color: const Color(0xFF1e293b),
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(terminal.name, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Amount: ${_formatCurrency(terminal.amount)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Text('Created: ${_formatDate(terminal.createdAt)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Row(
                                children: [
                                  const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(terminal.status),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      terminal.status,
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
                                onPressed: () => _editTerminal(terminal),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _deleteTerminal(terminal.id),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent, fontSize: 16)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
