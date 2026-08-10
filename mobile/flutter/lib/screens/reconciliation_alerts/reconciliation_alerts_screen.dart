import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Define dark theme colors
const Color _darkBackgroundColor = Color(0xFF0f172a);
const Color _darkCardColor = Color(0xFF1e293b);
const Color _darkTextColor = Color(0xFFf1f5f9);
const Color _darkAccentColor = Color(0xFF6366f1);
const Color _darkSuccessColor = Color(0xFF22c55e);
const Color _darkWarningColor = Color(0xFFeab308);
const Color _darkErrorColor = Color(0xFFef4444);

// Define the tRPC router namespace for ReconciliationAlerts
const String _trpcRouterNamespace = 'reconciliation.alerts';

class ReconciliationAlertsScreen extends ConsumerStatefulWidget {
  const ReconciliationAlertsScreen({super.key});

  @override
  ConsumerState<ReconciliationAlertsScreen> createState() => _ReconciliationAlertsScreenState();
}

class _ReconciliationAlertsScreenState extends ConsumerState<ReconciliationAlertsScreen> {
  AsyncValue<List<dynamic>> _alerts = const AsyncValue.loading();
  final TextEditingController _searchController = TextEditingController();
  String _searchText = '';
  String? _selectedStatusFilter;

  @override
  void initState() {
    super.initState();
    _fetchAlerts();
    _searchController.addListener(() {
      setState(() {
        _searchText = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchAlerts() async {
    setState(() {
      _alerts = const AsyncValue.loading();
    });
    try {
      final api = ref.read(apiServiceProvider);
      final data = await api.get('/trpc/$_trpcRouterNamespace.list');
      _alerts = AsyncValue.data(data as List<dynamic>);
    } catch (e, st) {
      _alerts = AsyncValue.error(e, st);
    }
    setState(() {});
  }

  Future<void> _resolveAlert(String alertId) async {
    final bool? confirm = await _showConfirmationDialog(
      'Resolve Alert',
      'Are you sure you want to resolve this alert?',
    );
    if (confirm == true) {
      try {
        final api = ref.read(apiServiceProvider);
        await api.post('/trpc/$_trpcRouterNamespace.resolve', body: {'id': alertId});
        _fetchAlerts(); // Refresh the list after resolution
        _showSnackBar('Alert $alertId resolved successfully.');
      } catch (e) {
        _showSnackBar('Failed to resolve alert $alertId: $e', isError: true);
      }
    }
  }

  Future<void> _dismissAlert(String alertId) async {
    final bool? confirm = await _showConfirmationDialog(
      'Dismiss Alert',
      'Are you sure you want to dismiss this alert?',
    );
    if (confirm == true) {
      try {
        final api = ref.read(apiServiceProvider);
        await api.post('/trpc/$_trpcRouterNamespace.dismiss', body: {'id': alertId});
        _fetchAlerts(); // Refresh the list after dismissal
        _showSnackBar('Alert $alertId dismissed successfully.');
      } catch (e) {
        _showSnackBar('Failed to dismiss alert $alertId: $e', isError: true);
      }
    }
  }

  Future<bool?> _showConfirmationDialog(String title, String content) async {
    return showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _darkCardColor,
          title: Text(title, style: const TextStyle(color: _darkTextColor)),
          content: Text(content, style: const TextStyle(color: _darkTextColor)),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel', style: TextStyle(color: _darkTextColor)),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Confirm', style: TextStyle(color: _darkAccentColor)),
            ),
          ],
        );
      },
    );
  }

  void _showSnackBar(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? _darkErrorColor : _darkSuccessColor,
      ),
    );
  }

  List<dynamic> _getFilteredAlerts(List<dynamic> allAlerts) {
    List<dynamic> filtered = allAlerts.where((alert) {
      final matchesSearch = alert['message'].toLowerCase().contains(_searchText.toLowerCase()) ||
          alert['id'].toString().toLowerCase().contains(_searchText.toLowerCase());
      final matchesStatus = _selectedStatusFilter == null || alert['status'] == _selectedStatusFilter;
      return matchesSearch && matchesStatus;
    }).toList();
    return filtered;
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _darkCardColor,
          title: const Text('Filter Alerts', style: TextStyle(color: _darkTextColor)),
          content: Column(
            mainAxisSize: MainAxisSize.in,
            children: [
              DropdownButtonFormField<String>(
                decoration: const InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _darkTextColor),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkTextColor)),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkAccentColor)),
                ),
                dropdownColor: _darkCardColor,
                value: _selectedStatusFilter,
                items: <String>['Pending', 'Resolved', 'Dismissed', 'All']
                    .map<DropdownMenuItem<String>>((String value) {
                  return DropdownMenuItem<String>(
                    value: value == 'All' ? null : value,
                    child: Text(value, style: const TextStyle(color: _darkTextColor)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  setState(() {
                    _selectedStatusFilter = newValue;
                  });
                },
                style: const TextStyle(color: _darkTextColor),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text('Apply', style: TextStyle(color: _darkAccentColor)),
            ),
          ],
        );
      },
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'pending':
        color = _darkWarningColor;
        break;
      case 'resolved':
        color = _darkSuccessColor;
        break;
      case 'dismissed':
        color = _darkErrorColor;
        break;
      default:
        color = _darkTextColor;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4.0),
      ),
      child: Text(
        status,
        style: TextStyle(color: color, fontSize: 12.0, fontWeight: FontWeight.bold),
      ),
    );
  }

  String _formatCurrency(double amount, String currencyCode) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currencyCode == 'NGN' ? '₦' : '$');
    return format.format(amount);
  }

  String _formatDate(String dateString) {
    try {
      final dateTime = DateTime.parse(dateString);
      return DateFormat('MMM dd, yyyy - hh:mm a').format(dateTime);
    } catch (e) {
      return dateString; // Return original if parsing fails
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _darkBackgroundColor,
      appBar: AppBar(
        title: const Text('Reconciliation Alerts', style: TextStyle(color: _darkTextColor)),
        backgroundColor: _darkCardColor,
        iconTheme: const IconThemeData(color: _darkTextColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list, color: _darkTextColor),
            onPressed: _showFilterDialog,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchAlerts,
        color: _darkAccentColor,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: _darkTextColor),
                decoration: InputDecoration(
                  hintText: 'Search alerts...',
                  hintStyle: TextStyle(color: _darkTextColor.withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: _darkTextColor),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: _darkCardColor,
                ),
              ),
            ),
            Expanded(
              child: _alerts.when(
                loading: () => const Center(child: CircularProgressIndicator(color: _darkAccentColor)),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: _darkTextColor)),
                ),
                data: (alerts) {
                  final filteredAlerts = _getFilteredAlerts(alerts);
                  if (filteredAlerts.isEmpty) {
                    return const Center(
                      child: Text('No reconciliation alerts found.', style: TextStyle(color: _darkTextColor)),
                    );
                  }
                  return ListView.builder(
                    itemCount: filteredAlerts.length,
                    itemBuilder: (context, index) {
                      final alert = filteredAlerts[index];
                      // Mock data for demonstration
                      final String alertId = alert['id'] ?? 'N/A';
                      final String status = alert['status'] ?? 'Pending';
                      final double amount = (alert['amount'] as num?)?.toDouble() ?? 0.0;
                      final String currency = alert['currency'] ?? 'NGN';
                      final String date = alert['createdAt'] ?? DateTime.now().toIso8601String();

                      return Card(
                        color: _darkCardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Alert ID: $alertId',
                                    style: const TextStyle(color: _darkTextColor, fontWeight: FontWeight.bold),
                                  ),
                                  _buildStatusBadge(status),
                                ],
                              ),
                              const SizedBox(height: 8.0),
                              Text(
                                'Message: ${alert['message']}',
                                style: const TextStyle(color: _darkTextColor),
                              ),
                              const SizedBox(height: 4.0),
                              Text(
                                'Amount: ${_formatCurrency(amount, currency)}',
                                style: const TextStyle(color: _darkTextColor),
                              ),
                              const SizedBox(height: 4.0),
                              Text(
                                'Date: ${_formatDate(date)}',
                                style: const TextStyle(color: _darkTextColor),
                              ),
                              const SizedBox(height: 16.0),
                              Align(
                                alignment: Alignment.bottomRight,
                                child: Wrap(
                                  spacing: 8.0,
                                  children: [
                                    if (status.toLowerCase() == 'pending') ...[
                                      OutlinedButton(
                                        onPressed: () => _resolveAlert(alertId),
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: _darkSuccessColor,
                                          side: const BorderSide(color: _darkSuccessColor),
                                        ),
                                        child: const Text('Resolve'),
                                      ),
                                      OutlinedButton(
                                        onPressed: () => _dismissAlert(alertId),
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: _darkErrorColor,
                                          side: const BorderSide(color: _darkErrorColor),
                                        ),
                                        child: const Text('Dismiss'),
                                      ),
                                    ],
                                    OutlinedButton(
                                      onPressed: () {
                                        // Implement view details logic
                                      },
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: _darkAccentColor,
                                        side: const BorderSide(color: _darkAccentColor),
                                      ),
                                      child: const Text('View Details'),
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
              ),
            ),
          ],
        ),
      ),
    );
  }
}
