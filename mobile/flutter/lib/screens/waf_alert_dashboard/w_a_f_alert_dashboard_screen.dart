import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date formatting

// Define the data model for a WAF Alert
class WAFAlert {
  final String id;
  final String ruleName;
  final String ipAddress;
  final DateTime timestamp;
  final String status;
  final String action;
  final String? country;

  WAFAlert({
    required this.id,
    required this.ruleName,
    required this.ipAddress,
    required this.timestamp,
    required this.status,
    required this.action,
    this.country,
  });

  factory WAFAlert.fromJson(Map<String, dynamic> json) {
    return WAFAlert(
      id: json['id'] as String,
      ruleName: json['ruleName'] as String,
      ipAddress: json['ipAddress'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
      status: json['status'] as String,
      action: json['action'] as String,
      country: json['country'] as String?,
    );
  }
}

// Define the state for WAF alerts
class WAFAlertsState {
  final List<WAFAlert> alerts;
  final bool isLoading;
  final String? error;
  final String searchQuery;
  final String? statusFilter;

  WAFAlertsState({
    this.alerts = const [],
    this.isLoading = false,
    this.error,
    this.searchQuery = '',
    this.statusFilter,
  });

  WAFAlertsState copyWith({
    List<WAFAlert>? alerts,
    bool? isLoading,
    String? error,
    String? searchQuery,
    String? statusFilter,
  }) {
    return WAFAlertsState(
      alerts: alerts ?? this.alerts,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
      searchQuery: searchQuery ?? this.searchQuery,
      statusFilter: statusFilter ?? this.statusFilter,
    );
  }
}

// Define the StateNotifier for WAF alerts
class WAFAlertsNotifier extends StateNotifier<WAFAlertsState> {
  final ApiService _apiService;

  WAFAlertsNotifier(this._apiService) : super(WAFAlertsState()) {
    fetchWAFAlerts();
  }

  Future<void> fetchWAFAlerts() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // Simulate API call with a delay
      await Future.delayed(const Duration(seconds: 1));
      // For demonstration, returning dummy data
      final List<WAFAlert> fetchedAlerts = [
        WAFAlert(id: '1', ruleName: 'SQL Injection', ipAddress: '192.168.1.1', timestamp: DateTime.now().subtract(const Duration(minutes: 5)), status: 'Blocked', action: 'Block', country: 'USA'),
        WAFAlert(id: '2', ruleName: 'XSS Attack', ipAddress: '10.0.0.5', timestamp: DateTime.now().subtract(const Duration(hours: 1)), status: 'Detected', action: 'Log', country: 'Germany'),
        WAFAlert(id: '3', ruleName: 'DDoS Attempt', ipAddress: '172.16.0.10', timestamp: DateTime.now().subtract(const Duration(days: 1)), status: 'Mitigated', action: 'Throttle', country: 'China'),
        WAFAlert(id: '4', ruleName: 'Malicious Bot', ipAddress: '203.0.113.45', timestamp: DateTime.now().subtract(const Duration(days: 2)), status: 'Blocked', action: 'Block', country: 'Brazil'),
        WAFAlert(id: '5', ruleName: 'Path Traversal', ipAddress: '192.168.1.2', timestamp: DateTime.now().subtract(const Duration(minutes: 30)), status: 'Detected', action: 'Alert', country: 'USA'),
      ];
      // In a real app, you would parse the response from _apiService.get
      // final response = await _apiService.get('/trpc/wafAlerts.list', params: {'search': state.searchQuery, 'status': state.statusFilter});
      // final List<WAFAlert> alerts = (response.data as List)
      //     .map((json) => WAFAlert.fromJson(json as Map<String, dynamic>))
      //     .toList();
      state = state.copyWith(alerts: fetchedAlerts, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
    _filterAlerts();
  }

  void setStatusFilter(String? status) {
    state = state.copyWith(statusFilter: status);
    _filterAlerts();
  }

  void _filterAlerts() {
    // This filtering is client-side for demonstration. In a real app, this would be part of the API call.
    // For now, we'll re-fetch to simulate server-side filtering or apply client-side filtering on the current list.
    // For this example, let's re-fetch to simulate server-side filtering.
    fetchWAFAlerts();
  }

  // Placeholder for create, edit, delete operations
  Future<void> createWAFAlert(WAFAlert newAlert) async {
    // Simulate API call
    state = state.copyWith(isLoading: true);
    await Future.delayed(const Duration(seconds: 1));
    state = state.copyWith(alerts: [...state.alerts, newAlert], isLoading: false);
  }

  Future<void> updateWAFAlert(WAFAlert updatedAlert) async {
    // Simulate API call
    state = state.copyWith(isLoading: true);
    await Future.delayed(const Duration(seconds: 1));
    state = state.copyWith(
      alerts: state.alerts.map((alert) => alert.id == updatedAlert.id ? updatedAlert : alert).toList(),
      isLoading: false,
    );
  }

  Future<void> deleteWAFAlert(String alertId) async {
    // Simulate API call
    state = state.copyWith(isLoading: true);
    await Future.delayed(const Duration(seconds: 1));
    state = state.copyWith(
      alerts: state.alerts.where((alert) => alert.id != alertId).toList(),
      isLoading: false,
    );
  }
}

// Define the Riverpod provider
final wafAlertsProvider = StateNotifierProvider<WAFAlertsNotifier, WAFAlertsState>(
  (ref) => WAFAlertsNotifier(ref.read(apiServiceProvider)),
);

class WAFAlertDashboardScreen extends ConsumerStatefulWidget {
  const WAFAlertDashboardScreen({super.key});

  @override
  ConsumerState<WAFAlertDashboardScreen> createState() => _WAFAlertDashboardScreenState();
}

class _WAFAlertDashboardScreenState extends ConsumerState<WAFAlertDashboardScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(wafAlertsProvider.notifier).setSearchQuery(_searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final wafAlertsState = ref.watch(wafAlertsProvider);
    final notifier = ref.read(wafAlertsProvider.notifier);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'WAF Alert Dashboard',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Text color
        ),
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Icon color
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showCreateAlertDialog(context, notifier),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight), // Height of the search bar
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search alerts...', 
                hintStyle: const TextStyle(color: Color(0xFF94a3b8)), // Lighter text for hint
                prefixIcon: const Icon(Icons.search, color: Color(0xFF94a3b8)),
                suffixIcon: wafAlertsState.searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, color: Color(0xFF94a3b8)),
                        onPressed: () {
                          _searchController.clear();
                          notifier.setSearchQuery('');
                        },
                      )
                    : null,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF334155), // Slightly lighter dark for search bar
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => notifier.fetchWAFAlerts(),
        color: const Color(0xFF6366f1), // Accent color for refresh indicator
        backgroundColor: const Color(0xFF1e293b), // Background for refresh indicator
        child: Builder(
          builder: (context) {
            if (wafAlertsState.isLoading) {
              return const Center(
                child: CircularProgressIndicator(color: Color(0xFF6366f1)), // Accent color
              );
            } else if (wafAlertsState.error != null) {
              return Center(
                child: Text(
                  'Error: ${wafAlertsState.error}',
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            } else if (wafAlertsState.alerts.isEmpty) {
              return const Center(
                child: Text(
                  'No WAF alerts found.',
                  style: TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            } else {
              final filteredAlerts = wafAlertsState.alerts.where((alert) {
                final matchesSearch = alert.ruleName.toLowerCase().contains(wafAlertsState.searchQuery.toLowerCase()) ||
                                      alert.ipAddress.toLowerCase().contains(wafAlertsState.searchQuery.toLowerCase()) ||
                                      (alert.country?.toLowerCase().contains(wafAlertsState.searchQuery.toLowerCase()) ?? false);
                final matchesStatus = wafAlertsState.statusFilter == null || alert.status == wafAlertsState.statusFilter;
                return matchesSearch && matchesStatus;
              }).toList();

              if (filteredAlerts.isEmpty) {
                return const Center(
                  child: Text(
                    'No matching WAF alerts found.',
                    style: TextStyle(color: Color(0xFFf1f5f9)),
                  ),
                );
              }

              return ListView.builder(
                itemCount: filteredAlerts.length,
                itemBuilder: (context, index) {
                  final alert = filteredAlerts[index];
                  return _buildAlertCard(context, alert, notifier);
                },
              );
            }
          },
        ),
      ),
    );
  }

  Widget _buildAlertCard(BuildContext context, WAFAlert alert, WAFAlertsNotifier notifier) {
    Color statusColor;
    switch (alert.status) {
      case 'Blocked':
        statusColor = Colors.redAccent;
        break;
      case 'Detected':
        statusColor = Colors.orangeAccent;
        break;
      case 'Mitigated':
        statusColor = Colors.greenAccent;
        break;
      default:
        statusColor = Colors.blueGrey;
    }

    return Card(
      color: const Color(0xFF1e293b), // Card background
      margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    alert.ruleName,
                    style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold, fontSize: 16.0),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                  decoration: BoxDecoration(
                    color: statusColor,
                    borderRadius: BorderRadius.circular(4.0),
                  ),
                  child: Text(
                    alert.status,
                    style: const TextStyle(color: Colors.white, fontSize: 12.0),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8.0),
            Text(
              'IP: ${alert.ipAddress} ${alert.country != null ? '(${alert.country})' : ''}',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
            Text(
              'Timestamp: ${DateFormat('yyyy-MM-dd HH:mm:ss').format(alert.timestamp)}',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
            Text(
              'Action: ${alert.action}',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
            const SizedBox(height: 8.0),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => _showEditAlertDialog(context, notifier, alert),
                  child: const Text('EDIT', style: TextStyle(color: Color(0xFF6366f1))), // Accent color
                ),
                TextButton(
                  onPressed: () => _showDeleteConfirmationDialog(context, notifier, alert.id),
                  child: const Text('DELETE', style: TextStyle(color: Colors.redAccent)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showCreateAlertDialog(BuildContext context, WAFAlertsNotifier notifier) {
    final TextEditingController ruleNameController = TextEditingController();
    final TextEditingController ipAddressController = TextEditingController();
    final TextEditingController statusController = TextEditingController();
    final TextEditingController actionController = TextEditingController();
    final TextEditingController countryController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card background
          title: const Text('Create New WAF Alert', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: ruleNameController,
                  decoration: const InputDecoration(labelText: 'Rule Name', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: ipAddressController,
                  decoration: const InputDecoration(labelText: 'IP Address', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: statusController,
                  decoration: const InputDecoration(labelText: 'Status', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: actionController,
                  decoration: const InputDecoration(labelText: 'Action', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: countryController,
                  decoration: const InputDecoration(labelText: 'Country (Optional)', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () {
                final newAlert = WAFAlert(
                  id: DateTime.now().millisecondsSinceEpoch.toString(), // Unique ID
                  ruleName: ruleNameController.text,
                  ipAddress: ipAddressController.text,
                  timestamp: DateTime.now(),
                  status: statusController.text,
                  action: actionController.text,
                  country: countryController.text.isEmpty ? null : countryController.text,
                );
                notifier.createWAFAlert(newAlert);
                Navigator.of(context).pop();
              },
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _showEditAlertDialog(BuildContext context, WAFAlertsNotifier notifier, WAFAlert alert) {
    final TextEditingController ruleNameController = TextEditingController(text: alert.ruleName);
    final TextEditingController ipAddressController = TextEditingController(text: alert.ipAddress);
    final TextEditingController statusController = TextEditingController(text: alert.status);
    final TextEditingController actionController = TextEditingController(text: alert.action);
    final TextEditingController countryController = TextEditingController(text: alert.country);

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit WAF Alert', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: ruleNameController,
                  decoration: const InputDecoration(labelText: 'Rule Name', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: ipAddressController,
                  decoration: const InputDecoration(labelText: 'IP Address', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: statusController,
                  decoration: const InputDecoration(labelText: 'Status', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: actionController,
                  decoration: const InputDecoration(labelText: 'Action', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: countryController,
                  decoration: const InputDecoration(labelText: 'Country (Optional)', labelStyle: TextStyle(color: Color(0xFF94a3b8)), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))), focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () {
                final updatedAlert = WAFAlert(
                  id: alert.id,
                  ruleName: ruleNameController.text,
                  ipAddress: ipAddressController.text,
                  timestamp: alert.timestamp,
                  status: statusController.text,
                  action: actionController.text,
                  country: countryController.text.isEmpty ? null : countryController.text,
                );
                notifier.updateWAFAlert(updatedAlert);
                Navigator.of(context).pop();
              },
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, WAFAlertsNotifier notifier, String alertId) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete WAF Alert', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this alert?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () {
                notifier.deleteWAFAlert(alertId);
                Navigator.of(context).pop();
              },
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
            ),
          ],
        );
      },
    );
  }
}
