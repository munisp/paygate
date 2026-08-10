import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Dummy data models for demonstration
class SlaAlert {
  final String id;
  final String title;
  final String description;
  final String status;
  final DateTime createdAt;
  final DateTime? resolvedAt;

  SlaAlert({
    required this.id,
    required this.title,
    required this.description,
    required this.status,
    required this.createdAt,
    this.resolvedAt,
  });

  factory SlaAlert.fromJson(Map<String, dynamic> json) {
    return SlaAlert(
      id: json['id'],
      title: json['title'],
      description: json['description'],
      status: json['status'],
      createdAt: DateTime.parse(json['createdAt']),
      resolvedAt: json['resolvedAt'] != null ? DateTime.parse(json['resolvedAt']) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'status': status,
        'createdAt': createdAt.toIso8601String(),
        'resolvedAt': resolvedAt?.toIso8601String(),
      };
}

// Dummy tRPC types
class SlaAlertsListInput {
  final String? search;
  final String? statusFilter;

  SlaAlertsListInput({this.search, this.statusFilter});

  Map<String, dynamic> toJson() => {
        'search': search,
        'statusFilter': statusFilter,
      };
}

class SlaAlertsCreateInput {
  final String title;
  final String description;

  SlaAlertsCreateInput({required this.title, required this.description});

  Map<String, dynamic> toJson() => {
        'title': title,
        'description': description,
      };
}

class SlaAlertsUpdateInput {
  final String id;
  final String? title;
  final String? description;
  final String? status;

  SlaAlertsUpdateInput({required this.id, this.title, this.description, this.status});

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'status': status,
      };
}

// Riverpod provider for SLA alerts
final slaAlertsProvider = FutureProvider.family<List<SlaAlert>, SlaAlertsListInput>((ref, input) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/slaAlerts.list', params: input.toJson());
  // Simulate network delay
  await Future.delayed(const Duration(milliseconds: 500));
  return (response as List).map((e) => SlaAlert.fromJson(e)).toList();
});

class SlaAlertDashboardScreen extends ConsumerStatefulWidget {
  const SlaAlertDashboardScreen({super.key});

  @override
  ConsumerState<SlaAlertDashboardScreen> createState() => _SlaAlertDashboardScreenState();
}

class _SlaAlertDashboardScreenState extends ConsumerState<SlaAlertDashboardScreen> {
  final TextEditingController _searchController = TextEditingController();
  String? _statusFilter;
  SlaAlertsListInput _currentFilter = SlaAlertsListInput();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      _applyFilter();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _applyFilter() {
    setState(() {
      _currentFilter = SlaAlertsListInput(
        search: _searchController.text.isEmpty ? null : _searchController.text,
        statusFilter: _statusFilter,
      );
    });
  }

  Future<void> _refreshAlerts() async {
    ref.invalidate(slaAlertsProvider(_currentFilter));
    await ref.read(slaAlertsProvider(_currentFilter).future);
  }

  Future<void> _createAlert(BuildContext context) async {
    final titleController = TextEditingController();
    final descriptionController = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New SLA Alert', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Title',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                maxLines: 3,
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ],
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9)))),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () async {
                if (titleController.text.isNotEmpty && descriptionController.text.isNotEmpty) {
                  try {
                    final api = ref.read(apiServiceProvider);
                    await api.post(
                      '/trpc/slaAlerts.create',
                      body: SlaAlertsCreateInput(
                        title: titleController.text,
                        description: descriptionController.text,
                      ).toJson(),
                    );
                    Navigator.of(dialogContext).pop();
                    _refreshAlerts();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Alert created successfully!')));
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to create alert: $e')));
                  }
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _editAlert(BuildContext context, SlaAlert alert) async {
    final titleController = TextEditingController(text: alert.title);
    final descriptionController = TextEditingController(text: alert.description);
    String? selectedStatus = alert.status;

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit SLA Alert', style: TextStyle(color: Color(0xFFf1f5f9)))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Title',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                maxLines: 3,
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
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                items: <String>['Active', 'Resolved', 'Archived'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  setState(() {
                    selectedStatus = newValue;
                  });
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
                if (titleController.text.isNotEmpty && descriptionController.text.isNotEmpty && selectedStatus != null) {
                  try {
                    final api = ref.read(apiServiceProvider);
                    await api.post(
                      '/trpc/slaAlerts.update',
                      body: SlaAlertsUpdateInput(
                        id: alert.id,
                        title: titleController.text,
                        description: descriptionController.text,
                        status: selectedStatus,
                      ).toJson(),
                    );
                    Navigator.of(dialogContext).pop();
                    _refreshAlerts();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Alert updated successfully!')));
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to update alert: $e')));
                  }
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
          title: const Text('Confirm Deletion', style: TextStyle(color: Color(0xFFf1f5f9))),
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
                try {
                  final api = ref.read(apiServiceProvider);
                  await api.post('/trpc/slaAlerts.delete', body: {'id': alertId});
                  Navigator.of(dialogContext).pop();
                  _refreshAlerts();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Alert deleted successfully!')));
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete alert: $e')));
                }
              },
            ),
          ],
        );
      },
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Active':
        return Colors.redAccent;
      case 'Resolved':
        return Colors.green;
      case 'Archived':
        return Colors.grey;
      default:
        return Colors.orange;
    }
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute}';
  }

  @override
  Widget build(BuildContext context) {
    final slaAlertsAsyncValue = ref.watch(slaAlertsProvider(_currentFilter));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('SLA Alert Dashboard', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
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
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search alerts...', 
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
                const SizedBox(width: 8.0),
                DropdownButton<String>(
                  value: _statusFilter,
                  hint: const Text('Filter by Status', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6))),
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  items: <String?>[null, 'Active', 'Resolved', 'Archived'].map((String? value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value ?? 'All'),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    setState(() {
                      _statusFilter = newValue;
                      _applyFilter();
                    });
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshAlerts,
              color: const Color(0xFF6366f1),
              backgroundColor: const Color(0xFF1e293b),
              child: slaAlertsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
                ),
                data: (alerts) {
                  if (alerts.isEmpty) {
                    return const Center(
                      child: Text('No SLA alerts found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }
                  return ListView.builder(
                    itemCount: alerts.length,
                    itemBuilder: (context, index) {
                      final alert = alerts[index];
                      return Card(
                        color: const Color(0xFF1e293b),
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(alert.title, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(alert.description, style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(alert.status),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(alert.status, style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 12)),
                                  ),
                                  const SizedBox(width: 8),
                                  Text('Created: ${_formatDate(alert.createdAt)}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7), fontSize: 12)),
                                  if (alert.resolvedAt != null)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 8.0),
                                      child: Text('Resolved: ${_formatDate(alert.resolvedAt!)}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7), fontSize: 12)),
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
                                onPressed: () => _editAlert(context, alert),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _deleteAlert(context, alert.id),
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
}