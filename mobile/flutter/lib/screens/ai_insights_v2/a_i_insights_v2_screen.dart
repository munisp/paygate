import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Define a data model for an AI Insight
class AIInsight {
  final String id;
  final String title;
  final String status;
  final double value; // Example for currency formatting
  final DateTime createdAt;
  final String description;

  AIInsight({
    required this.id,
    required this.title,
    required this.status,
    required this.value,
    required this.createdAt,
    required this.description,
  });

  factory AIInsight.fromJson(Map<String, dynamic> json) {
    return AIInsight(
      id: json['id'] as String,
      title: json['title'] as String,
      status: json['status'] as String,
      value: (json['value'] as num).toDouble(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      description: json['description'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'status': status,
        'value': value,
        'createdAt': createdAt.toIso8601String(),
        'description': description,
      };

  AIInsight copyWith({
    String? id,
    String? title,
    String? status,
    double? value,
    DateTime? createdAt,
    String? description,
  }) {
    return AIInsight(
      id: id ?? this.id,
      title: title ?? this.title,
      status: status ?? this.status,
      value: value ?? this.value,
      createdAt: createdAt ?? this.createdAt,
      description: description ?? this.description,
    );
  }
}

// Provider for fetching AI Insights
final aiInsightsProvider = FutureProvider.family<List<AIInsight>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/aiInsights.list', params: {'query': query});
    // Assuming response.data is a List<Map<String, dynamic>>
    return (response.data as List).map((e) => AIInsight.fromJson(e as Map<String, dynamic>)).toList();
  } catch (e) {
    throw Exception('Failed to load AI insights: $e');
  }
});

// Provider for creating an AI Insight
final createAIInsightProvider = FutureProvider.family<AIInsight, AIInsight>((ref, insight) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.post('/trpc/aiInsights.create', body: insight.toJson());
    return AIInsight.fromJson(response.data as Map<String, dynamic>);
  } catch (e) {
    throw Exception('Failed to create AI insight: $e');
  }
});

// Provider for updating an AI Insight
final updateAIInsightProvider = FutureProvider.family<AIInsight, AIInsight>((ref, insight) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.post('/trpc/aiInsights.update', body: insight.toJson());
    return AIInsight.fromJson(response.data as Map<String, dynamic>);
  } catch (e) {
    throw Exception('Failed to update AI insight: $e');
  }
});

// Provider for deleting an AI Insight
final deleteAIInsightProvider = FutureProvider.family<void, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  try {
    await api.post('/trpc/aiInsights.delete', body: {'id': id});
  } catch (e) {
    throw Exception('Failed to delete AI insight: $e');
  }
});

class AIInsightsV2Screen extends ConsumerStatefulWidget {
  const AIInsightsV2Screen({super.key});

  @override
  ConsumerState<AIInsightsV2Screen> createState() => _AIInsightsV2ScreenState();
}

class _AIInsightsV2ScreenState extends ConsumerState<AIInsightsV2Screen> {
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

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'inactive':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _formatCurrency(double amount) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: '₦'); // Using Naira symbol
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('MMM dd, yyyy').format(date);
  }

  Future<void> _refreshInsights() async {
    ref.invalidate(aiInsightsProvider(_searchQuery));
    await ref.read(aiInsightsProvider(_searchQuery).future);
  }

  void _showCreateEditDialog({AIInsight? insight}) {
    final isEditing = insight != null;
    final titleController = TextEditingController(text: insight?.title);
    final descriptionController = TextEditingController(text: insight?.description);
    final valueController = TextEditingController(text: insight?.value.toString());
    String? selectedStatus = insight?.status;

    showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: Text(isEditing ? 'Edit Insight' : 'Create New Insight', style: const TextStyle(color: Color(0xFFf1f5f9))),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Title',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
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
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                maxLines: 3,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: valueController,
                keyboardType: TextInputType.number, // Assuming value is numeric
                decoration: const InputDecoration(
                  labelText: 'Value',
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
                items: <String>['Active', 'Pending', 'Inactive'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value, style: const TextStyle(color: Color(0xFFf1f5f9))),
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
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () async {
              if (titleController.text.isEmpty || descriptionController.text.isEmpty || valueController.text.isEmpty || selectedStatus == null) {
                // Basic validation
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please fill all fields.')),
                );
                return;
              }

              final newInsight = AIInsight(
                id: isEditing ? insight!.id : UniqueKey().toString(), // Use existing ID for edit, new for create
                title: titleController.text,
                description: descriptionController.text,
                value: double.parse(valueController.text),
                status: selectedStatus!,
                createdAt: isEditing ? insight!.createdAt : DateTime.now(),
              );

              try {
                if (isEditing) {
                  await ref.read(updateAIInsightProvider(newInsight).future);
                } else {
                  await ref.read(createAIInsightProvider(newInsight).future);
                }
                Navigator.of(context).pop();
                _refreshInsights(); // Refresh list after create/edit
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Operation failed: $e')),
                );
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      );
    });
  }

  void _showDeleteConfirmationDialog(AIInsight insight) {
    showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: Text('Are you sure you want to delete \'${insight.title}\'?', style: const TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () async {
              try {
                await ref.read(deleteAIInsightProvider(insight.id).future);
                Navigator.of(context).pop();
                _refreshInsights(); // Refresh list after delete
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Deletion failed: $e')),
                );
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final aiInsightsAsyncValue = ref.watch(aiInsightsProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('AI Insights V2', style: TextStyle(color: Color(0xFFf1f5f9))),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search insights...', 
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF0f172a),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshInsights,
        color: const Color(0xFF6366f1), // Accent color for spinner
        backgroundColor: const Color(0xFF1e293b), // Background for spinner
        child: aiInsightsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
          ),
          data: (insights) {
            if (insights.isEmpty) {
              return const Center(
                child: Text('No AI insights found.', style: TextStyle(color: Color(0xFFf1f5f9))),
              );
            }
            return ListView.builder(
              itemCount: insights.length,
              itemBuilder: (context, index) {
                final insight = insights[index];
                return Card(
                  color: const Color(0xFF1e293b),
                  margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(insight.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFFf1f5f9))),
                        const SizedBox(height: 8),
                        Text(insight.description, style: TextStyle(fontSize: 14, color: Color(0xFFf1f5f9).withOpacity(0.8))),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9))),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: _getStatusColor(insight.status),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(insight.status, style: const TextStyle(color: Colors.white, fontSize: 12)),
                                ),
                              ],
                            ),
                            Text(_formatCurrency(insight.value), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFFf1f5f9))),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text('Created: ${_formatDate(insight.createdAt)}', style: TextStyle(fontSize: 12, color: Color(0xFFf1f5f9).withOpacity(0.6))),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            TextButton(
                              onPressed: () => _showCreateEditDialog(insight: insight),
                              child: const Text('Edit', style: TextStyle(color: Color(0xFF6366f1))),
                            ),
                            const SizedBox(width: 8),
                            TextButton(
                              onPressed: () => _showDeleteConfirmationDialog(insight),
                              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
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
    );
  }
}