import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class KeycloakRoleSyncScreen extends ConsumerStatefulWidget {
  const KeycloakRoleSyncScreen({super.key});

  @override
  ConsumerState<KeycloakRoleSyncScreen> createState() => _KeycloakRoleSyncScreenState();
}

class _KeycloakRoleSyncScreenState extends ConsumerState<KeycloakRoleSyncScreen> {
  // Example data structure for a Keycloak role sync item
  // Replace with actual data model from your tRPC API
  List<Map<String, dynamic>> _roleSyncItems = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchRoleSyncItems();
  }

  Future<void> _fetchRoleSyncItems() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      // Assuming a tRPC router like `keycloak.roleSync.list`
      final response = await ref.read(apiServiceProvider).get('/trpc/keycloak.roleSync.list');
      setState(() {
        _roleSyncItems = List<Map<String, dynamic>>.from(response['data']); // Adjust based on actual API response structure
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load role sync items: ${e.toString()}';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _createRoleSyncItem(Map<String, dynamic> newItem) async {
    try {
      await ref.read(apiServiceProvider).post('/trpc/keycloak.roleSync.create', body: newItem);
      _fetchRoleSyncItems(); // Refresh list after creation
    } catch (e) {
      _showErrorSnackbar('Failed to create item: ${e.toString()}');
    }
  }

  Future<void> _updateRoleSyncItem(String id, Map<String, dynamic> updatedItem) async {
    try {
      await ref.read(apiServiceProvider).post('/trpc/keycloak.roleSync.update', body: {'id': id, ...updatedItem});
      _fetchRoleSyncItems(); // Refresh list after update
    } catch (e) {
      _showErrorSnackbar('Failed to update item: ${e.toString()}');
    }
  }

  Future<void> _deleteRoleSyncItem(String id) async {
    try {
      await ref.read(apiServiceProvider).post('/trpc/keycloak.roleSync.delete', body: {'id': id});
      _fetchRoleSyncItems(); // Refresh list after deletion
    } catch (e) {
      _showErrorSnackbar('Failed to delete item: ${e.toString()}');
    }
  }

  void _showErrorSnackbar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message, style: const TextStyle(color: Color(0xFFf1f5f9)))),
    );
  }

  // Helper for status badges
  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'active':
        color = Colors.green;
        break;
      case 'pending':
        color = Colors.orange;
        break;
      case 'failed':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: TextStyle(color: color, fontSize: 12),
      ),
    );
  }

  // Helper for amount formatting (example: Naira)
  String _formatAmount(double amount, {String currency = '₦'}) {
    return '$currency${amount.toStringAsFixed(2)}';
  }

  // Helper for date formatting
  String _formatDate(String dateString) {
    final dateTime = DateTime.parse(dateString);
    return '${dateTime.day}/${dateTime.month}/${dateTime.year} ${dateTime.hour}:${dateTime.minute}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('Keycloak Role Sync', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchRoleSyncItems,
        color: const Color(0xFF6366f1),
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1)))
            : _error != null
                ? Center(
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Colors.redAccent, fontSize: 16),
                      textAlign: TextAlign.center,
                    ),
                  )
                : _roleSyncItems.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text(
                              'No role sync items found.',
                              style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                            ),
                            const SizedBox(height: 16),
                            ElevatedButton.icon(
                              onPressed: () => _showCreateDialog(context),
                              icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
                              label: const Text('Create New', style: TextStyle(color: Color(0xFFf1f5f9))),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF6366f1),
                                foregroundColor: const Color(0xFFf1f5f9),
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        itemCount: _roleSyncItems.length,
                        itemBuilder: (context, index) {
                          final item = _roleSyncItems[index];
                          return Card(
                            color: const Color(0xFF1e293b),
                            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Role Name: ${item['roleName'] ?? 'N/A'}',
                                    style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 18, fontWeight: FontWeight.bold),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'User ID: ${item['userId'] ?? 'N/A'}',
                                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9))),
                                      _buildStatusBadge(item['status'] ?? 'Unknown'),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Last Sync: ${_formatDate(item['lastSync'] ?? DateTime.now().toIso8601String())}',
                                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                                  ),
                                  const SizedBox(height: 16),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      IconButton(
                                        icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                        onPressed: () => _showEditDialog(context, item),
                                      ),
                                      IconButton(
                                        icon: const Icon(Icons.delete, color: Colors.redAccent),
                                        onPressed: () => _showDeleteConfirmationDialog(context, item['id'].toString()),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
      floatingActionButton: _isLoading || _error != null || _roleSyncItems.isEmpty
          ? null
          : FloatingActionButton(
              onPressed: () => _showCreateDialog(context),
              backgroundColor: const Color(0xFF6366f1),
              child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            ),
    );
  }

  void _showCreateDialog(BuildContext context) {
    final TextEditingController roleNameController = TextEditingController();
    final TextEditingController userIdController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Role Sync', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: roleNameController,
                decoration: const InputDecoration(
                  labelText: 'Role Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: userIdController,
                decoration: const InputDecoration(
                  labelText: 'User ID',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                _createRoleSyncItem({
                  'roleName': roleNameController.text,
                  'userId': userIdController.text,
                  'status': 'Pending', // Default status for new items
                  'lastSync': DateTime.now().toIso8601String(),
                });
                Navigator.of(dialogContext).pop();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6366f1),
                foregroundColor: const Color(0xFFf1f5f9),
              ),
              child: const Text('Create'),
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(BuildContext context, Map<String, dynamic> item) {
    final TextEditingController roleNameController = TextEditingController(text: item['roleName']);
    final TextEditingController userIdController = TextEditingController(text: item['userId']);

    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Role Sync', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: roleNameController,
                decoration: const InputDecoration(
                  labelText: 'Role Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: userIdController,
                decoration: const InputDecoration(
                  labelText: 'User ID',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                _updateRoleSyncItem(
                  item['id'].toString(),
                  {
                    'roleName': roleNameController.text,
                    'userId': userIdController.text,
                  },
                );
                Navigator.of(dialogContext).pop();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6366f1),
                foregroundColor: const Color(0xFFf1f5f9),
              ),
              child: const Text('Update'),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, String id) {
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this role sync item?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                _deleteRoleSyncItem(id);
                Navigator.of(dialogContext).pop();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.redAccent,
                foregroundColor: const Color(0xFFf1f5f9),
              ),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );
  }
}