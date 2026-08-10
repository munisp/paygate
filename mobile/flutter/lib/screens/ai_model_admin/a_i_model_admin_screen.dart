import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Placeholder for AI Model data structure
class AIModel {
  final String id;
  final String name;
  final String status;
  final String version;
  final DateTime createdAt;
  final double monthlyCost;

  AIModel({
    required this.id,
    required this.name,
    required this.status,
    required this.version,
    required this.createdAt,
    required this.monthlyCost,
  });

  factory AIModel.fromJson(Map<String, dynamic> json) {
    return AIModel(
      id: json['id'],
      name: json['name'],
      status: json['status'],
      version: json['version'],
      createdAt: DateTime.parse(json['createdAt']),
      monthlyCost: (json['monthlyCost'] as num).toDouble(),
    );
  }
}

// Provider for fetching AI Models
final aiModelsProvider = FutureProvider.autoDispose<List<AIModel>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/ai.modelAdmin.list');
  // Assuming response.data is a List<Map<String, dynamic>>
  return (response.data as List).map((e) => AIModel.fromJson(e)).toList();
});

class AIModelAdminScreen extends ConsumerStatefulWidget {
  const AIModelAdminScreen({super.key});

  @override
  ConsumerState<AIModelAdminScreen> createState() => _AIModelAdminScreenState();
}

class _AIModelAdminScreenState extends ConsumerState<AIModelAdminScreen> {
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final aiModelsAsyncValue = ref.watch(aiModelsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('AI Model Administration', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        backgroundColor: const Color(0xFF1e293b), // Card color for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showCreateModelDialog(context),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
              decoration: InputDecoration(
                hintText: 'Search models...', 
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                filled: true,
                fillColor: const Color(0xFF1e293b), // Card color
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(aiModelsProvider.future),
              color: const Color(0xFF6366f1), // Accent color for refresh indicator
              child: aiModelsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Color(0xFFf1f5f9))),
                ),
                data: (models) {
                  final filteredModels = models.where((model) {
                    return model.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                           model.status.toLowerCase().contains(_searchQuery.toLowerCase());
                  }).toList();

                  if (filteredModels.isEmpty) {
                    return const Center(
                      child: Text('No AI models found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }

                  return ListView.builder(
                    itemCount: filteredModels.length,
                    itemBuilder: (context, index) {
                      final model = filteredModels[index];
                      return Card(
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        color: const Color(0xFF1e293b), // Card color
                        child: ListTile(
                          title: Text(model.name, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Version: ${model.version}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))), 
                              _buildStatusBadge(model.status), 
                              Text('Created: ${_formatDate(model.createdAt)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))), 
                              Text('Monthly Cost: ${_formatNaira(model.monthlyCost)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))), 
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color
                                onPressed: () => _showEditModelDialog(context, model),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent), // Red for delete
                                onPressed: () => _showDeleteConfirmationDialog(context, model),
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

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'active':
        badgeColor = Colors.green;
        break;
      case 'inactive':
        badgeColor = Colors.orange;
        break;
      case 'error':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status.toUpperCase(),
        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  String _formatNaira(double amount) {
    return '₦${amount.toStringAsFixed(2)}';
  }

  void _showCreateModelDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b), // Card color
        title: const Text('Create New AI Model', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        content: const Text('Form for creating a new AI model will go here.', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))), // Text color
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
          ),
          ElevatedButton(
            onPressed: () {
              // Implement create logic here
              Navigator.of(context).pop();
              // After successful creation, refresh the list
              ref.invalidate(aiModelsProvider);
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)), // Accent color
            child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
          ),
        ],
      ),
    );
  }

  void _showEditModelDialog(BuildContext context, AIModel model) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b), // Card color
        title: Text('Edit ${model.name}', style: const TextStyle(color: Color(0xFFf1f5f9))), // Text color
        content: const Text('Form for editing AI model will go here.', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))), // Text color
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
          ),
          ElevatedButton(
            onPressed: () {
              // Implement edit logic here
              Navigator.of(context).pop();
              // After successful edit, refresh the list
              ref.invalidate(aiModelsProvider);
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)), // Accent color
            child: const Text('Save', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, AIModel model) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b), // Card color
        title: const Text('Delete AI Model', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        content: Text('Are you sure you want to delete ${model.name}?', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))), // Text color
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
          ),
          ElevatedButton(
            onPressed: () async {
              // Implement delete logic here
              final api = ref.read(apiServiceProvider);
              try {
                await api.post('/trpc/ai.modelAdmin.delete', body: {'id': model.id});
                Navigator.of(context).pop();
                ref.invalidate(aiModelsProvider);
              } catch (e) {
                // Handle error, e.g., show a snackbar
                print('Error deleting model: $e');
                Navigator.of(context).pop();
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent), // Red for delete
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
          ),
        ],
      ),
    );
  }
}