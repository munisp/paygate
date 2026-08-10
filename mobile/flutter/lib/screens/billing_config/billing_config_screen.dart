import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Define a FutureProvider for billing configurations
final billingConfigProvider = FutureProvider<List<dynamic>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  final response = await apiService.get('/trpc/billingConfig.list');
  return response['result']['data'];
});

// Provider for search query
final searchQueryProvider = StateProvider<String>((ref) => '');

// Provider for filtered billing configurations
final filteredBillingConfigProvider = Provider<List<dynamic>>((ref) {
  final configs = ref.watch(billingConfigProvider).value ?? [];
  final searchQuery = ref.watch(searchQueryProvider).toLowerCase();

  if (searchQuery.isEmpty) {
    return configs;
  }

  return configs.where((config) {
    return config['name'].toLowerCase().contains(searchQuery) ||
           config['status'].toLowerCase().contains(searchQuery) ||
           config['currency'].toLowerCase().contains(searchQuery);
  }).toList();
});

class BillingConfigScreen extends ConsumerStatefulWidget {
  const BillingConfigScreen({super.key});

  @override
  ConsumerState<BillingConfigScreen> createState() => _BillingConfigScreenState();
}

class _BillingConfigScreenState extends ConsumerState<BillingConfigScreen> {
  // Theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  Future<void> _refreshBillingConfigs() async {
    ref.invalidate(billingConfigProvider);
  }

  String _formatAmount(int amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$', decimalDigits: 0);
    return format.format(amount);
  }

  String _formatDate(String dateString) {
    final dateTime = DateTime.parse(dateString);
    return DateFormat('MMM dd, yyyy').format(dateTime);
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'active':
        color = Colors.green;
        break;
      case 'inactive':
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
        status.toUpperCase(),
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }

  void _showCreateEditDialog({Map<String, dynamic>? config}) {
    final isEditing = config != null;
    final nameController = TextEditingController(text: config?['name']);
    final amountController = TextEditingController(text: config?['amount']?.toString());
    String? selectedCurrency = config?['currency'] ?? 'NGN';

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: Text(isEditing ? 'Edit Billing Config' : 'Create Billing Config', style: const TextStyle(color: _textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              style: const TextStyle(color: _textColor),
              decoration: InputDecoration(
                labelText: 'Name',
                labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _textColor)),
                focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: amountController,
              style: const TextStyle(color: _textColor),
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Amount',
                labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _textColor)),
                focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              ),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: selectedCurrency,
              dropdownColor: _cardColor,
              style: const TextStyle(color: _textColor),
              decoration: InputDecoration(
                labelText: 'Currency',
                labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _textColor)),
                focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              ),
              items: <String>['NGN', 'USD'].map((String value) {
                return DropdownMenuItem<String>(
                  value: value,
                  child: Text(value, style: const TextStyle(color: _textColor)),
                );
              }).toList(),
              onChanged: (String? newValue) {
                setState(() {
                  selectedCurrency = newValue;
                });
              },
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () async {
              final apiService = ref.read(apiServiceProvider);
              final name = nameController.text;
              final amount = int.tryParse(amountController.text) ?? 0;

              if (isEditing) {
                await apiService.post('/trpc/billingConfig.update', body: {
                  'id': config['id'],
                  'name': name,
                  'amount': amount,
                  'currency': selectedCurrency,
                });
              } else {
                await apiService.post('/trpc/billingConfig.create', body: {
                  'name': name,
                  'amount': amount,
                  'currency': selectedCurrency,
                });
              }
              _refreshBillingConfigs();
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
            child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: _textColor)),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmationDialog(String id) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Delete Billing Config', style: TextStyle(color: _textColor)),
        content: const Text('Are you sure you want to delete this billing configuration?', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () async {
              final apiService = ref.read(apiServiceProvider);
              await apiService.post('/trpc/billingConfig.delete', body: {'id': id});
              _refreshBillingConfigs();
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Delete', style: TextStyle(color: _textColor)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredConfigsAsyncValue = ref.watch(filteredBillingConfigProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Billing Configuration', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _textColor),
            onPressed: () => _showCreateEditDialog(),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              onChanged: (query) => ref.read(searchQueryProvider.notifier).state = query,
              style: const TextStyle(color: _textColor),
              decoration: InputDecoration(
                hintText: 'Search billing configurations...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: _textColor),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshBillingConfigs,
              child: filteredConfigsAsyncValue.when(
                data: (configs) {
                  if (configs.isEmpty) {
                    return Center(
                      child: Text(
                        'No matching billing configurations found.',
                        style: TextStyle(color: _textColor),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: configs.length,
                    itemBuilder: (context, index) {
                      final config = configs[index];
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                config['name'],
                                style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Amount: ${_formatAmount(config['amount'], config['currency'])}',
                                style: TextStyle(color: _textColor),
                              ),
                              Row(
                                children: [
                                  const Text('Status: ', style: TextStyle(color: _textColor)),
                                  _buildStatusBadge(config['status']),
                                ],
                              ),
                              Text(
                                'Last Billed: ${_formatDate(config['last_billed'])}',
                                style: TextStyle(color: _textColor),
                              ),
                              Align(
                                alignment: Alignment.bottomRight,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.edit, color: _accentColor),
                                      onPressed: () => _showCreateEditDialog(config: config),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete, color: Colors.redAccent),
                                      onPressed: () => _showDeleteConfirmationDialog(config['id']),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
                error: (error, stack) => Center(
                  child: Text(
                    'Error: ${error.toString()}',
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}