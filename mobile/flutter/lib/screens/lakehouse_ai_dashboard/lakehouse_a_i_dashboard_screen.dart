import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class LakehouseAIDashboardScreen extends ConsumerStatefulWidget {
  const LakehouseAIDashboardScreen({super.key});

  @override
  ConsumerState<LakehouseAIDashboardScreen> createState() => _LakehouseAIDashboardScreenState();
}

class _LakehouseAIDashboardScreenState extends ConsumerState<LakehouseAIDashboardScreen> {
  // Define a placeholder data model for dashboard items
  // In a real scenario, this would come from the tRPC API schema
  class DashboardItem {
    final String id;
    final String title;
    final String description;
    final double value;
    final String status;
    final DateTime date;

    DashboardItem({
      required this.id,
      required this.title,
      required this.description,
      required this.value,
      required this.status,
      required this.date,
    });

    factory DashboardItem.fromJson(Map<String, dynamic> json) {
      return DashboardItem(
        id: json['id'],
        title: json['title'],
        description: json['description'],
        value: (json['value'] as num).toDouble(),
        status: json['status'],
        date: DateTime.parse(json['date']),
      );
    }
  }

  // Placeholder for the tRPC query provider
  // This would typically be generated or defined based on the tRPC schema
  final dashboardItemsProvider = FutureProvider<List<DashboardItem>>((ref) async {
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.get('/trpc/lakehouseAI.dashboard', params: {});
      // Assuming response.data is a List<Map<String, dynamic>>
      return (response.data as List).map((item) => DashboardItem.fromJson(item)).toList();
    } catch (e) {
      // In a real app, you'd want more specific error handling and logging
      throw Exception('Failed to load dashboard items: $e');
    }
  });

  @override
  Widget build(BuildContext context) {
    final dashboardItemsAsyncValue = ref.watch(dashboardItemsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'Lakehouse AI Dashboard',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Light text
        ),
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(dashboardItemsProvider.future),
        child: dashboardItemsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color
          error: (err, stack) => Center(
            child: Text(
              'Error: $err',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          data: (items) {
            if (items.isEmpty) {
              return const Center(
                child: Text(
                  'No dashboard data available.',
                  style: TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            }
            return ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card background
                  margin: const EdgeInsets.all(8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.title,
                          style: const TextStyle(
                            color: Color(0xFFf1f5f9),
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          item.description,
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _buildStatusBadge(item.status),
                            Text(
                              '₦${item.value.toStringAsFixed(2)}', // Naira formatting
                              style: const TextStyle(
                                color: Color(0xFFf1f5f9),
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Date: ${_formatDate(item.date)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        // Add action buttons if CRUD is applicable for individual items
                        // For a dashboard, these might be view details, or edit related data
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'active':
        badgeColor = Colors.green;
        break;
      case 'pending':
        badgeColor = Colors.orange;
        break;
      case 'failed':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }
}