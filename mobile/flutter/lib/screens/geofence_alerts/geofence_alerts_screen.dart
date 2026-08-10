import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Assuming a simple GeofenceAlert model for demonstration
class GeofenceAlert {
  final String id;
  final String name;
  final String status;
  final String geofenceId;
  final DateTime createdAt;

  GeofenceAlert({
    required this.id,
    required this.name,
    required this.status,
    required this.geofenceId,
    required this.createdAt,
  });

  factory GeofenceAlert.fromJson(Map<String, dynamic> json) {
    return GeofenceAlert(
      id: json['id'] as String,
      name: json['name'] as String,
      status: json['status'] as String,
      geofenceId: json['geofenceId'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'status': status,
        'geofenceId': geofenceId,
        'createdAt': createdAt.toIso8601String(),
      };

  GeofenceAlert copyWith({
    String? id,
    String? name,
    String? status,
    String? geofenceId,
    DateTime? createdAt,
  }) {
    return GeofenceAlert(
      id: id ?? this.id,
      name: name ?? this.name,
      status: status ?? this.status,
      geofenceId: geofenceId ?? this.geofenceId,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

// Define a provider for the geofence alerts list
final geofenceAlertsProvider = FutureProvider.family<List<GeofenceAlert>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/geofenceAlerts.list', params: {'query': query});
    if (response.data is List) {
      return (response.data as List).map((e) => GeofenceAlert.fromJson(e as Map<String, dynamic>)).toList();
    }
    return [];
  } catch (e) {
    // Handle API errors, e.g., log them or throw a custom exception
    debugPrint('Error fetching geofence alerts: $e');
    rethrow;
  }
});

// Define a provider for search query
final geofenceAlertsSearchQueryProvider = StateProvider<String>((ref) => '');

class GeofenceAlertsScreen extends ConsumerStatefulWidget {
  const GeofenceAlertsScreen({super.key});

  @override
  ConsumerState<GeofenceAlertsScreen> createState() => _GeofenceAlertsScreenState();
}

class _GeofenceAlertsScreenState extends ConsumerState<GeofenceAlertsScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshAlerts() async {
    ref.invalidate(geofenceAlertsProvider);
    final query = ref.read(geofenceAlertsSearchQueryProvider);
    await ref.read(geofenceAlertsProvider(query).future);
  }

  Future<void> _createAlert(BuildContext context) async {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController geofenceIdController = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Alert', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Alert Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: geofenceIdController,
                decoration: const InputDecoration(
                  labelText: 'Geofence ID',
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
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/geofenceAlerts.create', body: {
                    'name': nameController.text,
                    'geofenceId': geofenceIdController.text,
                    'status': 'active', // Default status
                  });
                  Navigator.of(dialogContext).pop();
                  _refreshAlerts();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Alert created successfully!'))
                  );
                } catch (e) {
                  debugPrint('Error creating alert: $e');
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create alert: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _editAlert(BuildContext context, GeofenceAlert alert) async {
    final TextEditingController nameController = TextEditingController(text: alert.name);
    final TextEditingController geofenceIdController = TextEditingController(text: alert.geofenceId);
    String? selectedStatus = alert.status;

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Alert', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Alert Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: geofenceIdController,
                decoration: const InputDecoration(
                  labelText: 'Geofence ID',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: selectedStatus,
                dropdownColor: const Color(0xFF1e293b),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: const InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                items: <String>['active', 'inactive', 'triggered']
                    .map<DropdownMenuItem<String>>((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value, style: const TextStyle(color: Color(0xFFf1f5f9))),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  if (newValue != null) {
                    selectedStatus = newValue;
                  }
                },
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
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Save', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/geofenceAlerts.update', body: {
                    'id': alert.id,
                    'name': nameController.text,
                    'geofenceId': geofenceIdController.text,
                    'status': selectedStatus,
                  });
                  Navigator.of(dialogContext).pop();
                  _refreshAlerts();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Alert updated successfully!'))
                  );
                } catch (e) {
                  debugPrint('Error updating alert: $e');
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update alert: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _deleteAlert(BuildContext context, String alertId) async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this alert?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/geofenceAlerts.delete', body: {'id': alertId});
                  Navigator.of(dialogContext).pop();
                  _refreshAlerts();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Alert deleted successfully!'))
                  );
                } catch (e) {
                  debugPrint('Error deleting alert: $e');
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete alert: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'triggered':
        return Colors.red;
      case 'inactive':
        return Colors.grey;
      default:
        return Colors.blueGrey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final searchQuery = ref.watch(geofenceAlertsSearchQueryProvider);
    final alertsAsyncValue = ref.watch(geofenceAlertsProvider(searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('Geofence Alerts', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _createAlert(context),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: Color(0xFFf1f5f9)),
              decoration: InputDecoration(
                hintText: 'Search alerts...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
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
                  borderSide: const BorderSide(color: Color(0xFF6366f1), width: 2.0),
                ),
                filled: true,
                fillColor: const Color(0xFF1e293b),
              ),
              onChanged: (value) {
                ref.read(geofenceAlertsSearchQueryProvider.notifier).state = value;
              },
            ),
          ),
          Expanded(
            child: alertsAsyncValue.when(
              data: (alerts) {
                if (alerts.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.info_outline, color: Color(0xFFf1f5f9), size: 48),
                        const SizedBox(height: 16),
                        const Text(
                          'No geofence alerts found.',
                          style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 18),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
                          onPressed: () => _createAlert(context),
                          icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
                          label: const Text('Create New Alert', style: TextStyle(color: Color(0xFFf1f5f9))),
                        ),
                      ],
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: _refreshAlerts,
                  color: const Color(0xFF6366f1),
                  backgroundColor: const Color(0xFF1e293b),
                  child: ListView.builder(
                    itemCount: alerts.length,
                    itemBuilder: (context, index) {
                      final alert = alerts[index];
                      return Card(
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        color: const Color(0xFF1e293b),
                        elevation: 2.0,
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                alert.name,
                                style: const TextStyle(
                                  color: Color(0xFFf1f5f9),
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                                  Chip(
                                    label: Text(alert.status, style: const TextStyle(color: Color(0xFFf1f5f9))),
                                    backgroundColor: _getStatusColor(alert.status),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text('Geofence ID: ${alert.geofenceId}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              const SizedBox(height: 4),
                              Text('Created: ${alert.createdAt.toLocal().toString().split('.')[0]}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              const SizedBox(height: 16),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                    onPressed: () => _editAlert(context, alert),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete, color: Colors.redAccent),
                                    onPressed: () => _deleteAlert(context, alert.id),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
              error: (err, stack) => Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
                    const SizedBox(height: 16),
                    Text(
                      'Error: ${err.toString()}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
                      onPressed: _refreshAlerts,
                      icon: const Icon(Icons.refresh, color: Color(0xFFf1f5f9)),
                      label: const Text('Retry', style: TextStyle(color: Color(0xFFf1f5f9))),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
