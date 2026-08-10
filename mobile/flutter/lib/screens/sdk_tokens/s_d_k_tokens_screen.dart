import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class SDKTokensScreen extends ConsumerStatefulWidget {
  const SDKTokensScreen({super.key});

  @override
  ConsumerState<SDKTokensScreen> createState() => _SDKTokensScreenState();
}

class _SDKTokensScreenState extends ConsumerState<SDKTokensScreen> {
  late Future<List<dynamic>> _sdkTokensFuture;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _fetchSDKTokens();
  }

  Future<void> _fetchSDKTokens() async {
    setState(() {
      _sdkTokensFuture = ref.read(apiServiceProvider).get(
            '/trpc/sdkTokens.list',
            params: {'search': _searchQuery},
          );
    });
  }

  Future<void> _createSDKToken(Map<String, dynamic> newToken) async {
    try {
      await ref.read(apiServiceProvider).post(
            '/trpc/sdkTokens.create',
            body: newToken,
          );
      _fetchSDKTokens();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('SDK Token created successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create SDK Token: $e')),
        );
      }
    }
  }

  Future<void> _updateSDKToken(String id, Map<String, dynamic> updatedToken) async {
    try {
      await ref.read(apiServiceProvider).post(
            '/trpc/sdkTokens.update',
            body: {'id': id, ...updatedToken},
          );
      _fetchSDKTokens();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('SDK Token updated successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update SDK Token: $e')),
        );
      }
    }
  }

  Future<void> _deleteSDKToken(String id) async {
    try {
      await ref.read(apiServiceProvider).post(
            '/trpc/sdkTokens.delete',
            body: {'id': id},
          );
      _fetchSDKTokens();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('SDK Token deleted successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete SDK Token: $e')),
        );
      }
    }
  }

  void _showCreateDialog() {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController descriptionController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New SDK Token', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Token Name',
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
                controller: descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description',
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
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: () {
                _createSDKToken({
                  'name': nameController.text,
                  'description': descriptionController.text,
                });
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(Map<String, dynamic> token) {
    final TextEditingController nameController = TextEditingController(text: token['name']);
    final TextEditingController descriptionController = TextEditingController(text: token['description']);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit SDK Token', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Token Name',
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
                controller: descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description',
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
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: () {
                _updateSDKToken(token['id'], {
                  'name': nameController.text,
                  'description': descriptionController.text,
                });
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Save', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(String id) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Deletion', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this SDK Token?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: () {
                _deleteSDKToken(id);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'active':
        color = Colors.green;
        break;
      case 'inactive':
        color = Colors.red;
        break;
      case 'pending':
        color = Colors.orange;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4.0),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12.0),
      ),
    );
  }

  String _formatAmount(double amount, String currency) {
    final String symbol = currency == 'NGN' ? '₦' : '$'; // Naira or USD
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String _formatDate(String dateString) {
    final DateTime dateTime = DateTime.parse(dateString);
    return '${dateTime.day}/${dateTime.month}/${dateTime.year} ${dateTime.hour}:${dateTime.minute}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('SDK Tokens', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: _showCreateDialog,
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
                _fetchSDKTokens();
              },
              decoration: InputDecoration(
                hintText: 'Search SDK Tokens...', 
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                filled: true,
                fillColor: const Color(0xFF1e293b),
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
              onRefresh: _fetchSDKTokens,
              color: const Color(0xFF6366f1),
              backgroundColor: const Color(0xFF1e293b),
              child: FutureBuilder<List<dynamic>>(
                future: _sdkTokensFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1)));
                  } else if (snapshot.hasError) {
                    return Center(
                      child: Text('Error: ${snapshot.error}', style: const TextStyle(color: Colors.red)),
                    );
                  } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
                    return const Center(
                      child: Text('No SDK Tokens found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  } else {
                    final List<dynamic> sdkTokens = snapshot.data!;
                    return ListView.builder(
                      itemCount: sdkTokens.length,
                      itemBuilder: (context, index) {
                        final token = sdkTokens[index];
                        return Card(
                          color: const Color(0xFF1e293b),
                          margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  token['name'] ?? 'N/A',
                                  style: const TextStyle(
                                    color: Color(0xFFf1f5f9),
                                    fontSize: 18.0,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 8.0),
                                Text(
                                  'ID: ${token['id'] ?? 'N/A'}',
                                  style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                                ),
                                const SizedBox(height: 4.0),
                                Text(
                                  'Description: ${token['description'] ?? 'N/A'}',
                                  style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                                ),
                                const SizedBox(height: 4.0),
                                Row(
                                  children: [
                                    const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                                    _buildStatusBadge(token['status'] ?? 'Unknown'),
                                  ],
                                ),
                                const SizedBox(height: 4.0),
                                Text(
                                  'Created: ${_formatDate(token['createdAt'] ?? DateTime.now().toIso8601String())}',
                                  style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                                ),
                                const SizedBox(height: 4.0),
                                Text(
                                  'Last Used: ${_formatDate(token['lastUsed'] ?? DateTime.now().toIso8601String())}',
                                  style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                                ),
                                const SizedBox(height: 16.0),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                      onPressed: () => _showEditDialog(token),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete, color: Colors.red),
                                      onPressed: () => _showDeleteConfirmationDialog(token['id']),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    );
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}