import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Placeholder for Payment Settings data model
class PaymentSetting {
  final String id;
  final String name;
  final String value;
  final bool isActive;

  PaymentSetting({required this.id, required this.name, required this.value, required this.isActive});

  factory PaymentSetting.fromJson(Map<String, dynamic> json) {
    return PaymentSetting(
      id: json['id'],
      name: json['name'],
      value: json['value'],
      isActive: json['isActive'],
    );
  }
}

// Provider for fetching payment settings
final paymentSettingsProvider = FutureProvider<List<PaymentSetting>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Simulate a tRPC endpoint for fetching payment settings
  // In a real application, this would be a call to api.get('/trpc/settings.payments.list')
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  return [
    PaymentSetting(id: '1', name: 'Stripe Integration', value: 'Enabled', isActive: true),
    PaymentSetting(id: '2', name: 'PayPal Gateway', value: 'Disabled', isActive: false),
    PaymentSetting(id: '3', name: 'Bank Transfer Limit', value: '₦5,000,000', isActive: true),
    PaymentSetting(id: '4', name: 'Currency', value: 'USD', isActive: true),
  ];
});

class SettingsPaymentsScreen extends ConsumerStatefulWidget {
  const SettingsPaymentsScreen({super.key});

  @override
  ConsumerState<SettingsPaymentsScreen> createState() => _SettingsPaymentsScreenState();
}

class _SettingsPaymentsScreenState extends ConsumerState<SettingsPaymentsScreen> {
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

  Future<void> _showCreateEditDialog({PaymentSetting? setting}) async {
    final isEditing = setting != null;
    final nameController = TextEditingController(text: setting?.name);
    final valueController = TextEditingController(text: setting?.value);
    bool isActive = setting?.isActive ?? false;

    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: const Color(0xFF1e293b),
              title: Text(isEditing ? 'Edit Payment Setting' : 'Create Payment Setting', style: const TextStyle(color: Color(0xFFf1f5f9))),
              content: SingleChildScrollView(
                child: ListBody(
                  children: <Widget>[
                    TextField(
                      controller: nameController,
                      decoration: const InputDecoration(
                        labelText: 'Setting Name',
                        labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                        enabledBorder: OutlineInputBorder(
                          borderSide: BorderSide(color: Color(0xFF6366f1)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderSide: BorderSide(color: Color(0xFF6366f1)),
                        ),
                      ),
                      style: const TextStyle(color: Color(0xFFf1f5f9)),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: valueController,
                      decoration: const InputDecoration(
                        labelText: 'Setting Value',
                        labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                        enabledBorder: OutlineInputBorder(
                          borderSide: BorderSide(color: Color(0xFF6366f1)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderSide: BorderSide(color: Color(0xFF6366f1)),
                        ),
                      ),
                      style: const TextStyle(color: Color(0xFFf1f5f9)),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        const Text('Is Active:', style: TextStyle(color: Color(0xFFf1f5f9))),
                        Switch(
                          value: isActive,
                          onChanged: (bool newValue) {
                            setState(() {
                              isActive = newValue;
                            });
                          },
                          activeColor: const Color(0xFF6366f1),
                        ),
                      ],
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
                  child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFF6366f1))),
                  onPressed: () async {
                    // TODO: Implement actual API call for create/edit
                    final newSetting = PaymentSetting(
                      id: isEditing ? setting!.id : UniqueKey().toString(),
                      name: nameController.text,
                      value: valueController.text,
                      isActive: isActive,
                    );
                    print(isEditing ? 'Saving: ${newSetting.name}' : 'Creating: ${newSetting.name}');
                    Navigator.of(context).pop();
                    ref.invalidate(paymentSettingsProvider); // Refresh the list
                  },
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _showDeleteConfirmationDialog(PaymentSetting setting) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete Payment Setting', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete ${setting.name}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
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
                // TODO: Implement actual API call for delete
                print('Deleting: ${setting.name}');
                Navigator.of(context).pop();
                ref.invalidate(paymentSettingsProvider); // Refresh the list
              },
            ),
          ],
        );
      },
    );
  }

  String _formatAmount(String value) {
    if (value.startsWith('₦')) {
      return value; // Already formatted as Naira
    } else if (value.startsWith('$')) {
      return value; // Already formatted as USD
    } else if (double.tryParse(value) != null) {
      // Simple heuristic: if it's a number, assume it's an amount and format as Naira
      return '₦' + double.parse(value).toStringAsFixed(2);
    }
    return value; // Return as is if not a recognizable amount
  }

  @override
  Widget build(BuildContext context) {
    final paymentSettingsAsyncValue = ref.watch(paymentSettingsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Payment Settings', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search settings...',
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
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(paymentSettingsProvider.future),
        child: paymentSettingsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
          error: (err, stack) => Center(
            child: Text(
              'Error: $err',
              style: const TextStyle(color: Colors.redAccent),
            ),
          ),
          data: (settings) {
            final filteredSettings = settings.where((setting) {
              return setting.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                  setting.value.toLowerCase().contains(_searchQuery.toLowerCase());
            }).toList();

            if (filteredSettings.isEmpty) {
              return Center(
                child: Text(
                  _searchQuery.isEmpty ? 'No payment settings found.' : 'No matching settings found.',
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(16.0),
              itemCount: filteredSettings.length,
              itemBuilder: (context, index) {
                final setting = filteredSettings[index];
                return Card(
                  color: const Color(0xFF1e293b),
                  margin: const EdgeInsets.symmetric(vertical: 8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          setting.name,
                          style: const TextStyle(
                            color: Color(0xFFf1f5f9),
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8.0),
                        Text(
                          'Value: ${_formatAmount(setting.value)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 8.0),
                        Row(
                          children: [
                            const Text(
                              'Status: ',
                              style: TextStyle(color: Color(0xFFf1f5f9)),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                              decoration: BoxDecoration(
                                color: setting.isActive ? Colors.green[700] : Colors.red[700],
                                borderRadius: BorderRadius.circular(4.0),
                              ),
                              child: Text(
                                setting.isActive ? 'Active' : 'Inactive',
                                style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16.0),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                              onPressed: () {
                                _showCreateEditDialog(setting: setting);
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () {
                                _showDeleteConfirmationDialog(setting);
                              },
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
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showCreateEditDialog();
        },
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}
