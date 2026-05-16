import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Define the tRPC router namespace for ComplianceSettings
final complianceSettingsProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.read(apiServiceProvider);
  // Assuming a tRPC procedure like 'compliance.getSettings'
  try {
    final response = await api.get('/trpc/compliance.getSettings');
    // Assuming the response data is a List of Maps or similar structure
    // For demonstration, adding dummy data if API returns empty or null
    if (response.data == null || (response.data as List).isEmpty) {
      return [
        {'id': '1', 'name': 'KYC Verification', 'value': 'Approved', 'description': 'Status of Know Your Customer verification.', 'status': 'active', 'type': 'status'},
        {'id': '2', 'name': 'Transaction Limit', 'value': '1000000', 'description': 'Maximum transaction amount per day.', 'status': 'active', 'type': 'currency', 'currency': 'NGN'},
        {'id': '3', 'name': 'Last Review Date', 'value': '2026-04-15T10:00:00Z', 'description': 'Date of the last compliance review.', 'status': 'completed', 'type': 'date'},
        {'id': '4', 'name': 'AML Policy', 'value': 'Enabled', 'description': 'Anti-Money Laundering policy status.', 'status': 'active', 'type': 'status'},
        {'id': '5', 'name': 'Next Audit', 'value': '2026-12-01T00:00:00Z', 'description': 'Scheduled date for the next compliance audit.', 'status': 'pending', 'type': 'date'},
        {'id': '6', 'name': 'Risk Score', 'value': 'Low', 'description': 'Overall risk assessment score.', 'status': 'active', 'type': 'text'},
      ];
    }
    return response.data as List<Map<String, dynamic>>;
  } catch (e) {
    // Handle API errors gracefully
    print('Error fetching compliance settings: $e');
    rethrow;
  }
});

// Provider for updating compliance settings (mutation)
final updateComplianceSettingProvider = FutureProvider.autoDispose.family<void, Map<String, dynamic>>((ref, settingData) async {
  final api = ref.read(apiServiceProvider);
  // Assuming a tRPC procedure like 'compliance.updateSetting'
  try {
    await api.post('/trpc/compliance.updateSetting', body: settingData);
    // Invalidate the settings provider to refetch data after update
    ref.invalidate(complianceSettingsProvider);
  } catch (e) {
    print('Error updating compliance setting: $e');
    rethrow;
  }
});

class ComplianceSettingsScreen extends ConsumerStatefulWidget {
  const ComplianceSettingsScreen({super.key});

  @override
  ConsumerState<ComplianceSettingsScreen> createState() => _ComplianceSettingsScreenState();
}

class _ComplianceSettingsScreenState extends ConsumerState<ComplianceSettingsScreen> {
  // Dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Helper to format values based on type
  String _formatValue(Map<String, dynamic> setting) {
    final type = setting['type'];
    final value = setting['value'];

    if (value == null) return 'N/A';

    switch (type) {
      case 'currency':
        final currency = setting['currency'] ?? 'USD';
        final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$');
        return format.format(double.tryParse(value.toString()) ?? 0.0);
      case 'date':
        try {
          final dateTime = DateTime.parse(value.toString());
          return DateFormat('MMM dd, yyyy').format(dateTime);
        } catch (e) {
          return value.toString();
        }
      default:
        return value.toString();
    }
  }

  // Helper to get status badge color
  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
      case 'approved':
      case 'enabled':
      case 'completed':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'rejected':
      case 'disabled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  void _showEditSettingDialog(Map<String, dynamic> setting) {
    final TextEditingController _valueController = TextEditingController(text: setting['value']?.toString() ?? '');

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Edit ${setting['name']}', style: const TextStyle(color: _textColor)),
          content: TextField(
            controller: _valueController,
            decoration: InputDecoration(
              labelText: 'Value',
              labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
              enabledBorder: OutlineInputBorder(
                borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
              ),
              focusedBorder: const OutlineInputBorder(
                borderSide: BorderSide(color: _accentColor),
              ),
            ),
            style: const TextStyle(color: _textColor),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            Consumer(builder: (context, ref, child) {
              return ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: _accentColor,
                  foregroundColor: _textColor,
                ),
                child: const Text('Save'),
                onPressed: () async {
                  final updatedSetting = {
                    'id': setting['id'], // Assuming 'id' is present for identification
                    'name': setting['name'],
                    'value': _valueController.text,
                    'type': setting['type'], // Preserve type for formatting
                    'currency': setting['currency'], // Preserve currency for formatting
                  };
                  try {
                    await ref.read(updateComplianceSettingProvider(updatedSetting).future);
                    Navigator.of(context).pop();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Setting updated successfully!'))
                    );
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to update setting: $e'))
                    );
                  }
                },
              );
            }),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final complianceSettingsAsyncValue = ref.watch(complianceSettingsProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Compliance Settings', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(complianceSettingsProvider.future),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search settings...', 
                  hintStyle: const TextStyle(color: _textColor.withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                  filled: true,
                  fillColor: _cardColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
                style: const TextStyle(color: _textColor),
                onChanged: (value) {
                  setState(() {});
                },
              ),
            ),
            Expanded(
              child: complianceSettingsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: _textColor)),
                ),
                data: (settings) {
                  if (settings.isEmpty) {
                    return Center(
                      child: Text('No compliance settings found.', style: TextStyle(color: _textColor)),
                    );
                  }
                  final filteredSettings = settings.where((setting) {
                    final query = _searchController.text.toLowerCase();
                    return setting['name']?.toLowerCase().contains(query) ?? false ||
                           setting['value']?.toLowerCase().contains(query) ?? false ||
                           setting['description']?.toLowerCase().contains(query) ?? false;
                  }).toList();

                  if (filteredSettings.isEmpty) {
                    return Center(
                      child: Text('No matching settings found.', style: TextStyle(color: _textColor)),
                    );
                  }

                  return ListView.builder(
                    itemCount: filteredSettings.length,
                    itemBuilder: (context, index) {
                      final setting = filteredSettings[index];
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(setting['name'] ?? 'N/A', style: const TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 8),
                              Text(setting['description'] ?? 'No description provided.', style: TextStyle(color: _textColor.withOpacity(0.8))),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text('Value: ${_formatValue(setting)}', style: const TextStyle(color: _textColor)),
                                        if (setting['status'] != null) ...[
                                          const SizedBox(height: 4),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                            decoration: BoxDecoration(
                                              color: _getStatusColor(setting['status']),
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: Text(
                                              setting['status'].toString().toUpperCase(),
                                              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                  ElevatedButton(
                                    onPressed: () => _showEditSettingDialog(setting),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: _accentColor,
                                      foregroundColor: _textColor,
                                    ),
                                    child: const Text('Edit'),
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
          ],
        ),
      ),
    );
  }
}
