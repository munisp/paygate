import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Assuming a Terminal model and related providers for simplicity
// In a real app, these would be defined in separate files.

class Terminal {
  final String id;
  final String name;
  final String location;
  final String status;
  final double lastTransactionAmount;
  final DateTime lastTransactionDate;

  Terminal({
    required this.id,
    required this.name,
    required this.location,
    required this.status,
    required this.lastTransactionAmount,
    required this.lastTransactionDate,
  });

  factory Terminal.fromJson(Map<String, dynamic> json) {
    return Terminal(
      id: json['id'] as String,
      name: json['name'] as String,
      location: json['location'] as String,
      status: json['status'] as String,
      lastTransactionAmount: (json['lastTransactionAmount'] as num).toDouble(),
      lastTransactionDate: DateTime.parse(json['lastTransactionDate'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'location': location,
        'status': status,
        'lastTransactionAmount': lastTransactionAmount,
        'lastTransactionDate': lastTransactionDate.toIso8601String(),
      };

  Terminal copyWith({
    String? id,
    String? name,
    String? location,
    String? status,
    double? lastTransactionAmount,
    DateTime? lastTransactionDate,
  }) {
    return Terminal(
      id: id ?? this.id,
      name: name ?? this.name,
      location: location ?? this.location,
      status: status ?? this.status,
      lastTransactionAmount: lastTransactionAmount ?? this.lastTransactionAmount,
      lastTransactionDate: lastTransactionDate ?? this.lastTransactionDate,
    );
  }
}

final terminalsProvider = FutureProvider.family<List<Terminal>, String?>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get(
    '/trpc/terminal.list',
    params: query != null && query.isNotEmpty ? {'query': query} : {},
  );
  return (response['terminals'] as List)
      .map((e) => Terminal.fromJson(e as Map<String, dynamic>))
      .toList();
});

final terminalCreateProvider = FutureProvider.family<Terminal, Map<String, dynamic>>((ref, data) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.post(
    '/trpc/terminal.create',
    body: data,
  );
  ref.invalidate(terminalsProvider);
  return Terminal.fromJson(response['terminal'] as Map<String, dynamic>);
});

final terminalUpdateProvider = FutureProvider.family<Terminal, Map<String, dynamic>>((ref, data) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.post(
    '/trpc/terminal.update',
    body: data,
  );
  ref.invalidate(terminalsProvider);
  return Terminal.fromJson(response['terminal'] as Map<String, dynamic>);
});

final terminalDeleteProvider = FutureProvider.family<void, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  await api.post(
    '/trpc/terminal.delete',
    body: {'id': id},
  );
  ref.invalidate(terminalsProvider);
});

class TerminalMapScreen extends ConsumerStatefulWidget {
  const TerminalMapScreen({super.key});

  @override
  ConsumerState<TerminalMapScreen> createState() => _TerminalMapScreenState();
}

class _TerminalMapScreenState extends ConsumerState<TerminalMapScreen> {
  final TextEditingController _searchController = TextEditingController();
  String? _searchQuery;

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
    ref.invalidate(terminalsProvider);
    await ref.read(terminalsProvider(_searchQuery).future);
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'inactive':
        return Colors.red;
      case 'pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  String _formatAmount(double amount) {
    // Simple formatting, assuming USD for now as currency is not specified
    // and no external intl package is allowed.
    return '\$${amount.toStringAsFixed(2)}';
  }

  String _formatDate(DateTime date) {
    // Simple date formatting without intl package
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final terminalsAsyncValue = ref.watch(terminalsProvider(_searchQuery));

    // Dark theme colors
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: const Text('Terminal Map', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: textColor),
            onPressed: () => _showCreateTerminalDialog(context),
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
                hintText: 'Search terminals...',
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
              onRefresh: _refreshTerminals,
              color: accentColor,
              backgroundColor: cardColor,
              child: terminalsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: accentColor)),
                error: (err, stack) => Center(
                  child: Text('Error: ${err.toString()}', style: const TextStyle(color: Colors.redAccent)),
                ),
                data: (terminals) {
                  if (terminals.isEmpty) {
                    return const Center(
                      child: Text('No terminals found.', style: TextStyle(color: textColor)),
                    );
                  }
                  return ListView.builder(
                    itemCount: terminals.length,
                    itemBuilder: (context, index) {
                      final terminal = terminals[index];
                      return Card(
                        color: cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(terminal.name, style: const TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 4),
                              Text('Location: ${terminal.location}', style: TextStyle(color: textColor.withOpacity(0.8))),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  const Text('Status: ', style: TextStyle(color: textColor.withOpacity(0.8))),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(terminal.status),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(terminal.status, style: const TextStyle(color: Colors.white, fontSize: 12)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text('Last Transaction: ${_formatAmount(terminal.lastTransactionAmount)} on ${_formatDate(terminal.lastTransactionDate)}', style: TextStyle(color: textColor.withOpacity(0.8))),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  TextButton(
                                    onPressed: () => _showEditTerminalDialog(context, terminal),
                                    child: const Text('Edit', style: TextStyle(color: accentColor)),
                                  ),
                                  const SizedBox(width: 8),
                                  TextButton(
                                    onPressed: () => _showDeleteConfirmationDialog(context, terminal),
                                    child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
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
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showCreateTerminalDialog(BuildContext context) {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController locationController = TextEditingController();
    final TextEditingController statusController = TextEditingController(text: 'active'); // Default status
    final TextEditingController amountController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Terminal', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Terminal Name',
                    labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: locationController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Location',
                    labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: statusController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Status (e.g., active, inactive, pending)',
                    labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Last Transaction Amount',
                    labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                final newTerminalData = {
                  'name': nameController.text,
                  'location': locationController.text,
                  'status': statusController.text,
                  'lastTransactionAmount': double.tryParse(amountController.text) ?? 0.0,
                  'lastTransactionDate': DateTime.now().toIso8601String(),
                };
                await ref.read(terminalCreateProvider(newTerminalData).future);
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _showEditTerminalDialog(BuildContext context, Terminal terminal) {
    final TextEditingController nameController = TextEditingController(text: terminal.name);
    final TextEditingController locationController = TextEditingController(text: terminal.location);
    final TextEditingController statusController = TextEditingController(text: terminal.status);
    final TextEditingController amountController = TextEditingController(text: terminal.lastTransactionAmount.toString());

    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Terminal', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Terminal Name',
                    labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: locationController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Location',
                    labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: statusController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Status (e.g., active, inactive, pending)',
                    labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Last Transaction Amount',
                    labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                final updatedTerminalData = terminal.copyWith(
                  name: nameController.text,
                  location: locationController.text,
                  status: statusController.text,
                  lastTransactionAmount: double.tryParse(amountController.text),
                );
                await ref.read(terminalUpdateProvider(updatedTerminalData.toJson()).future);
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, Terminal terminal) {
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete Terminal', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete terminal \'${terminal.name}\'?', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                await ref.read(terminalDeleteProvider(terminal.id).future);
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
            ),
          ],
        );
      },
    );
  }
}
