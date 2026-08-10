import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Placeholder for Middleware data model
class MiddlewareItem {
  final String id;
  final String name;
  final String status;
  final String type;
  final DateTime lastUpdated;

  MiddlewareItem({
    required this.id,
    required this.name,
    required this.status,
    required this.type,
    required this.lastUpdated,
  });

  factory MiddlewareItem.fromJson(Map<String, dynamic> json) {
    return MiddlewareItem(
      id: json["id"],
      name: json["name"],
      status: json["status"],
      type: json["type"],
      lastUpdated: DateTime.parse(json["lastUpdated"]),
    );
  }
}

// StateNotifier for Middleware data
class MiddlewareListNotifier extends StateNotifier<AsyncValue<List<MiddlewareItem>>> {
  final ApiService apiService;

  MiddlewareListNotifier(this.apiService) : super(const AsyncValue.loading()) {
    fetchMiddleware();
  }

  Future<void> fetchMiddleware() async {
    try {
      state = const AsyncValue.loading();
      final response = await apiService.get(
        '/trpc/middleware.list',
        params: {},
      );
      final List<MiddlewareItem> middleware = (
        response["middleware"] as List
      ).map((e) => MiddlewareItem.fromJson(e)).toList();
      state = AsyncValue.data(middleware);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}

final middlewareListProvider = StateNotifierProvider.autoDispose<
    MiddlewareListNotifier, AsyncValue<List<MiddlewareItem>>>((ref) {
  final apiService = ref.watch(apiServiceProvider);
  return MiddlewareListNotifier(apiService);
});


class MiddlewareDashboardScreen extends ConsumerStatefulWidget {
  const MiddlewareDashboardScreen({super.key});

  @override
  ConsumerState<MiddlewareDashboardScreen> createState() => _MiddlewareDashboardScreenState();
}

class _MiddlewareDashboardScreenState extends ConsumerState<MiddlewareDashboardScreen> {
  @override
  void initState() {
    super.initState();
    // Initial fetch is handled by the provider itself
  }

  Future<void> _refreshMiddleware() async {
    await ref.read(middlewareListProvider.notifier).fetchMiddleware();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text(
          'Middleware Dashboard',
          style: TextStyle(color: Color(0xFFf1f5f9)),
        ),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshMiddleware,
        child: Consumer(
          builder: (context, watch, child) {
            final middlewareListAsyncValue = ref.watch(middlewareListProvider);

            return middlewareListAsyncValue.when(
              data: (middlewareList) {
                if (middlewareList.isEmpty) {
                  return Center(
                    child: Text(
                      'No middleware found.',
                      style: theme.textTheme.headlineMedium?.copyWith(color: const Color(0xFFf1f5f9)),
                    ),
                  );
                }
                return ListView.builder(
                  itemCount: middlewareList.length,
                  itemBuilder: (context, index) {
                    final item = middlewareList[index];
                    return Card(
                      color: const Color(0xFF1e293b),
                      margin: const EdgeInsets.all(8.0),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.name,
                              style: theme.textTheme.titleLarge?.copyWith(color: const Color(0xFFf1f5f9)),
                            ),
                            const SizedBox(height: 8.0),
                            Text(
                              'ID: ${item.id}',
                              style: theme.textTheme.bodyMedium?.copyWith(color: const Color(0xFFf1f5f9)),
                            ),
                            const SizedBox(height: 4.0),
                            Row(
                              children: [
                                Text(
                                  'Status: ',
                                  style: theme.textTheme.bodyMedium?.copyWith(color: const Color(0xFFf1f5f9)),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                                  decoration: BoxDecoration(
                                    color: _getStatusColor(item.status),
                                    borderRadius: BorderRadius.circular(4.0),
                                  ),
                                  child: Text(
                                    item.status,
                                    style: theme.textTheme.bodySmall?.copyWith(color: Colors.white, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4.0),
                            Text(
                              'Type: ${item.type}',
                              style: theme.textTheme.bodyMedium?.copyWith(color: const Color(0xFFf1f5f9)),
                            ),
                            const SizedBox(height: 4.0),
                            Text(
                              'Last Updated: ${DateFormat('yyyy-MM-dd HH:mm').format(item.lastUpdated.toLocal())}',
                              style: theme.textTheme.bodyMedium?.copyWith(color: const Color(0xFFf1f5f9)),
                            ),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                TextButton(
                                  onPressed: () => _editMiddleware(context, item),
                                  child: const Text(
                                    'Edit',
                                    style: TextStyle(color: Color(0xFF6366f1)),
                                  ),
                                ),
                                TextButton(
                                  onPressed: () => _deleteMiddleware(context, item.id),
                                  child: const Text(
                                    'Delete',
                                    style: TextStyle(color: Colors.redAccent),
                                  ),
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
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
              error: (error, stack) => Center(
                child: Text(
                  'Error: ${error.toString()}',
                  style: theme.textTheme.headlineMedium?.copyWith(color: Colors.red),
                ),
              ),
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _createMiddleware(context),
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  void _createMiddleware(BuildContext context) {
    final TextEditingController _nameController = TextEditingController();
    final TextEditingController _typeController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text(
            "Create New Middleware",
            style: TextStyle(color: Color(0xFFf1f5f9)),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: "Name",
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
              const SizedBox(height: 16.0),
              TextField(
                controller: _typeController,
                decoration: const InputDecoration(
                  labelText: "Type",
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
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(
                "Cancel",
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            TextButton(
              onPressed: () async {
                // TODO: Implement API call for creating middleware
                print(
                    "Creating Middleware: ${_nameController.text}, ${_typeController.text}");
                Navigator.of(context).pop();
                await ref.read(middlewareListProvider.notifier).fetchMiddleware();
              },
              child: const Text(
                "Create",
                style: TextStyle(color: Color(0xFF6366f1)),
              ),
            ),
          ],
        );
      },
    );
  }

  void _editMiddleware(BuildContext context, MiddlewareItem item) {
    final TextEditingController _nameController = TextEditingController(text: item.name);
    final TextEditingController _typeController = TextEditingController(text: item.type);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text(
            "Edit Middleware",
            style: TextStyle(color: Color(0xFFf1f5f9)),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: "Name",
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
              const SizedBox(height: 16.0),
              TextField(
                controller: _typeController,
                decoration: const InputDecoration(
                  labelText: "Type",
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
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(
                "Cancel",
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            TextButton(
              onPressed: () async {
                // TODO: Implement API call for updating middleware
                print(
                    "Updating Middleware ${item.id}: ${_nameController.text}, ${_typeController.text}");
                Navigator.of(context).pop();
                await ref.read(middlewareListProvider.notifier).fetchMiddleware();
              },
              child: const Text(
                "Update",
                style: TextStyle(color: Color(0xFF6366f1)),
              ),
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
      case 'inactive':
        return Colors.red;
      case 'pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  void _deleteMiddleware(BuildContext context, String id) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text(
            "Confirm Deletion",
            style: TextStyle(color: Color(0xFFf1f5f9)),
          ),
          content: Text(
            "Are you sure you want to delete middleware with ID: $id?",
            style: const TextStyle(color: Color(0xFFf1f5f9)),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(
                "Cancel",
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            TextButton(
              onPressed: () async {
                // TODO: Implement API call for deleting middleware
                print("Deleting Middleware: $id");
                Navigator.of(context).pop();
                await ref.read(middlewareListProvider.notifier).fetchMiddleware();
              },
              child: const Text(
                "Delete",
                style: TextStyle(color: Colors.redAccent),
              ),
            ),
          ],
        );
      },
    );
  }
}