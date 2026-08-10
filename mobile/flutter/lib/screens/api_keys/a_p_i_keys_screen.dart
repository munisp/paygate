import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Data models
class ApiKey {
  final String id;
  final String name;
  final String key;
  final DateTime createdAt;
  final DateTime? expiresAt;
  final bool isActive;

  ApiKey({
    required this.id,
    required this.name,
    required this.key,
    required this.createdAt,
    this.expiresAt,
    required this.isActive,
  });

  factory ApiKey.fromJson(Map<String, dynamic> json) {
    return ApiKey(
      id: json['id'] as String,
      name: json['name'] as String,
      key: json['key'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      expiresAt: json['expiresAt'] != null
          ? DateTime.parse(json['expiresAt'] as String)
          : null,
      isActive: json['isActive'] as bool,
    );
  }
}

// Riverpod providers
final apiKeysProvider = FutureProvider.family<List<ApiKey>, String?>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/apiKeys.list', params: {'query': query});
  return (response['apiKeys'] as List)
      .map((e) => ApiKey.fromJson(e as Map<String, dynamic>))
      .toList();
});

class APIKeysScreen extends ConsumerStatefulWidget {
  const APIKeysScreen({super.key});

  @override
  ConsumerState<APIKeysScreen> createState() => _APIKeysScreenState();
}

class _APIKeysScreenState extends ConsumerState<APIKeysScreen> {
  final TextEditingController _searchController = TextEditingController();
  String? _searchQuery;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchQuery = _searchController.text.isEmpty ? null : _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshApiKeys() async {
    ref.invalidate(apiKeysProvider(_searchQuery));
  }

  Future<void> _createApiKey(String name) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/apiKeys.create', body: {'name': name});
      _refreshApiKeys();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('API Key created successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create API Key: $e')),
        );
      }
    }
  }

  Future<void> _updateApiKey(String id, String name, bool isActive) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/apiKeys.update', body: {'id': id, 'name': name, 'isActive': isActive});
      _refreshApiKeys();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('API Key updated successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update API Key: $e')),
        );
      }
    }
  }

  Future<void> _deleteApiKey(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/apiKeys.delete', body: {'id': id});
      _refreshApiKeys();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('API Key deleted successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete API Key: $e')),
        );
      }
    }
  }

  void _showCreateApiKeyDialog() {
    final TextEditingController nameController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Create New API Key', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: TextField(
          controller: nameController,
          decoration: const InputDecoration(
            labelText: 'API Key Name',
            labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
            enabledBorder: OutlineInputBorder(
              borderSide: BorderSide(color: Color(0xFFf1f5f9)),
            ),
            focusedBorder: OutlineInputBorder(
              borderSide: BorderSide(color: Color(0xFF6366f1)),
            ),
          ),
          style: const TextStyle(color: Color(0xFFf1f5f9)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
          ElevatedButton(
            onPressed: () {
              _createApiKey(nameController.text);
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  void _showEditApiKeyDialog(ApiKey apiKey) {
    final TextEditingController nameController = TextEditingController(text: apiKey.name);
    bool isActive = apiKey.isActive;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            backgroundColor: const Color(0xFF1e293b),
            title: const Text('Edit API Key', style: TextStyle(color: Color(0xFFf1f5f9))),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'API Key Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFFf1f5f9)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                Row(
                  children: [
                    const Text('Active:', style: TextStyle(color: Color(0xFFf1f5f9))),
                    Switch(
                      value: isActive,
                      onChanged: (value) {
                        setState(() {
                          isActive = value;
                        });
                      },
                      activeColor: const Color(0xFF6366f1),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              ),
              ElevatedButton(
                onPressed: () {
                  _updateApiKey(apiKey.id, nameController.text, isActive);
                  Navigator.pop(context);
                },
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
                child: const Text('Save', style: TextStyle(color: Color(0xFFf1f5f9))),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showDeleteConfirmationDialog(ApiKey apiKey) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Delete API Key', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: Text('Are you sure you want to delete API Key "${apiKey.name}"? This action cannot be undone.',
            style: const TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
          ElevatedButton(
            onPressed: () {
              _deleteApiKey(apiKey.id);
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final apiKeysAsyncValue = ref.watch(apiKeysProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('API Keys', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: _showCreateApiKeyDialog,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshApiKeys,
        color: const Color(0xFF6366f1),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  labelText: 'Search API Keys',
                  labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: const BorderSide(color: Color(0xFFf1f5f9)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: const BorderSide(color: Color(0xFFf1f5f9)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: const BorderSide(color: Color(0xFF6366f1)),
                  ),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            Expanded(
              child: apiKeysAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
                ),
                data: (apiKeys) {
                  if (apiKeys.isEmpty) {
                    return const Center(
                      child: Text('No API Keys found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }
                  return ListView.builder(
                    itemCount: apiKeys.length,
                    itemBuilder: (context, index) {
                      final apiKey = apiKeys[index];
                      return Card(
                        color: const Color(0xFF1e293b),
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(apiKey.name, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Key: ${apiKey.key}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                              Text('Created: ${apiKey.createdAt.toLocal().toIso8601String().split('T')[0]}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                              if (apiKey.expiresAt != null)
                                Text('Expires: ${apiKey.expiresAt!.toLocal().toIso8601String().split('T')[0]}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                              Row(
                                children: [
                                  Text('Status: ',
                                      style: const TextStyle(color: Color(0xFFf1f5f9))),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: apiKey.isActive ? Colors.green[700] : Colors.red[700],
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(apiKey.isActive ? 'Active' : 'Inactive',
                                        style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 12)),
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
                                onPressed: () => _showEditApiKeyDialog(apiKey),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(apiKey),
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
          ],
        ),
      ),
    );
  }
}