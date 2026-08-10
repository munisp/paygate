import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Mock RateLimit model for demonstration
class RateLimit {
  final String id;
  final String name;
  final String type;
  final int limit;
  final String unit;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;

  RateLimit({
    required this.id,
    required this.name,
    required this.type,
    required this.limit,
    required this.unit,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  factory RateLimit.fromJson(Map<String, dynamic> json) {
    return RateLimit(
      id: json['id'],
      name: json['name'],
      type: json['type'],
      limit: json['limit'],
      unit: json['unit'],
      status: json['status'],
      createdAt: DateTime.parse(json['createdAt']),
      updatedAt: DateTime.parse(json['updatedAt']),
    );
  }
}

// Riverpod provider for fetching rate limits
final rateLimitsProvider = FutureProvider.autoDispose<List<RateLimit>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/rateLimit.list', params: {});
    // Assuming response.data is a List<Map<String, dynamic>>
    return (response.data as List).map((e) => RateLimit.fromJson(e)).toList();
  } catch (e) {
    throw Exception('Failed to load rate limits: $e');
  }
});

class RateLimitDashboardScreen extends ConsumerStatefulWidget {
  const RateLimitDashboardScreen({super.key});

  @override
  ConsumerState<RateLimitDashboardScreen> createState() => _RateLimitDashboardScreenState();
}

class _RateLimitDashboardScreenState extends ConsumerState<RateLimitDashboardScreen> {
  @override
  Widget build(BuildContext context) {
    final rateLimitsAsyncValue = ref.watch(rateLimitsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rate Limit Dashboard'),
        backgroundColor: const Color(0xFF0f172a),
      ),
      backgroundColor: const Color(0xFF0f172a),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(rateLimitsProvider.future),
        child: rateLimitsAsyncValue.when(
          data: (rateLimits) {
            if (rateLimits.isEmpty) {
              return const Center(
                child: Text(
                  'No rate limits found.',
                  style: TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            }
            return ListView.builder(
              itemCount: rateLimits.length,
              itemBuilder: (context, index) {
                final rateLimit = rateLimits[index];
                return Card(
                  color: const Color(0xFF1e293b),
                  margin: const EdgeInsets.all(8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          rateLimit.name,
                          style: const TextStyle(
                            color: Color(0xFFf1f5f9),
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Type: ${rateLimit.type}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Text(
                          'Limit: ${rateLimit.limit} ${rateLimit.unit}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Text(
                          'Status: ${rateLimit.status}',
                          style: TextStyle(color: _getStatusColor(rateLimit.status)),
                        ),
                        Text(
                          'Created: ${_formatDate(rateLimit.createdAt)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Text(
                          'Updated: ${_formatDate(rateLimit.updatedAt)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                              onPressed: () {
                                _showEditRateLimitDialog(context, rateLimit);
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () {
                                _showDeleteConfirmationDialog(context, rateLimit.id);
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
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color for spinner
          error: (error, stack) => Center(
            child: Text(
              'Error: $error',
              style: const TextStyle(color: Colors.redAccent),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showCreateRateLimitDialog(context);
        },
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'inactive':
        return Colors.orange;
      case 'suspended':
        return Colors.red;
      default:
        return const Color(0xFFf1f5f9);
    }
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }

  void _showCreateRateLimitDialog(BuildContext context) {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController typeController = TextEditingController();
    final TextEditingController limitController = TextEditingController();
    final TextEditingController unitController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text(
            'Create New Rate Limit',
            style: TextStyle(color: Color(0xFFf1f5f9)),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Name',
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
                const SizedBox(height: 10),
                TextField(
                  controller: typeController,
                  decoration: const InputDecoration(
                    labelText: 'Type',
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
                const SizedBox(height: 10),
                TextField(
                  controller: limitController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Limit',
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
                const SizedBox(height: 10),
                TextField(
                  controller: unitController,
                  decoration: const InputDecoration(
                    labelText: 'Unit',
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
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text(
                'Cancel',
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            ElevatedButton(
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                final newRateLimit = {
                  'name': nameController.text,
                  'type': typeController.text,
                  'limit': int.tryParse(limitController.text) ?? 0,
                  'unit': unitController.text,
                  'status': 'active', // Default status
                };
                try {
                  await api.post(
                    '/trpc/rateLimit.create',
                    body: newRateLimit,
                  );
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Rate limit created successfully!')),
                  );
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create rate limit: $e')),
                  );
                }
                ref.invalidate(rateLimitsProvider);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text(
                'Create',
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, String id) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text(
            'Confirm Deletion',
            style: TextStyle(color: Color(0xFFf1f5f9)),
          ),
          content: const Text(
            'Are you sure you want to delete this rate limit?',
            style: TextStyle(color: Color(0xFFf1f5f9)),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text(
                'Cancel',
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            ElevatedButton(
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post(
                    '/trpc/rateLimit.delete', // Assuming a delete endpoint
                    body: {'id': id},
                  );
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Rate limit deleted successfully!')),
                  );
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete rate limit: $e')),
                  );
                }
                ref.invalidate(rateLimitsProvider);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text(
                'Delete',
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
          ],
        );
      },
    );
  }

  void _showEditRateLimitDialog(BuildContext context, RateLimit rateLimit) {
    final TextEditingController nameController = TextEditingController(text: rateLimit.name);
    final TextEditingController typeController = TextEditingController(text: rateLimit.type);
    final TextEditingController limitController = TextEditingController(text: rateLimit.limit.toString());
    final TextEditingController unitController = TextEditingController(text: rateLimit.unit);
    final TextEditingController statusController = TextEditingController(text: rateLimit.status);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text(
            'Edit Rate Limit',
            style: TextStyle(color: Color(0xFFf1f5f9)),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Name',
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
                const SizedBox(height: 10),
                TextField(
                  controller: typeController,
                  decoration: const InputDecoration(
                    labelText: 'Type',
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
                const SizedBox(height: 10),
                TextField(
                  controller: limitController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Limit',
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
                const SizedBox(height: 10),
                TextField(
                  controller: unitController,
                  decoration: const InputDecoration(
                    labelText: 'Unit',
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
                const SizedBox(height: 10),
                TextField(
                  controller: statusController,
                  decoration: const InputDecoration(
                    labelText: 'Status',
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
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text(
                'Cancel',
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            ElevatedButton(
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                final updatedRateLimit = {
                  'id': rateLimit.id,
                  'name': nameController.text,
                  'type': typeController.text,
                  'limit': int.tryParse(limitController.text) ?? 0,
                  'unit': unitController.text,
                  'status': statusController.text,
                };
                try {
                  await api.post(
                    '/trpc/rateLimit.update',
                    body: updatedRateLimit,
                  );
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Rate limit updated successfully!')),
                  );
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update rate limit: $e')),
                  );
                }
                ref.invalidate(rateLimitsProvider);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text(
                'Update',
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
          ],
        );
      },
    );
  }
}