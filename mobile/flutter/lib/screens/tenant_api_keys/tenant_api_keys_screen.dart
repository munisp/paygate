import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class TenantApiKeysScreen extends ConsumerStatefulWidget {
  const TenantApiKeysScreen({super.key});

  @override
  ConsumerState<TenantApiKeysScreen> createState() => _TenantApiKeysScreenState();
}

class _TenantApiKeysScreenState extends ConsumerState<TenantApiKeysScreen> {
  List<dynamic> _apiKeys = [];
  bool _isLoading = true;
  String? _error;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _fetchApiKeys();
  }

  Future<void> _fetchApiKeys() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final response = await ref.read(apiServiceProvider).get('/trpc/tenantApiKeys.list');
      setState(() {
        _apiKeys = response['apiKeys'] ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _createApiKey() async {
    String? newKeyName;
    await showDialog<String>(
      context: context,
      builder: (BuildContext context) {
        String tempName = '';
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create API Key', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: TextField(
            onChanged: (value) {
              tempName = value;
            },
            decoration: const InputDecoration(
              hintText: 'Enter API Key Name',
              hintStyle: TextStyle(color: Color(0xFFf1f5f9)),
              enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
              focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
            ),
            style: const TextStyle(color: Color(0xFFf1f5f9)),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(context, null),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, tempName),
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    ).then((value) => newKeyName = value);

    if (newKeyName != null && newKeyName.isNotEmpty) {
      try {
        await ref.read(apiServiceProvider).post('/trpc/tenantApiKeys.create', body: {'name': newKeyName});
        _fetchApiKeys();
      } catch (e) {
        // Handle error, e.g., show a SnackBar
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create API key: $e', style: const TextStyle(color: Color(0xFFf1f5f9)))),
        );
      }
    }
  }

  Future<void> _editApiKey(String id, String currentName) async {
    String? updatedKeyName;
    await showDialog<String>(
      context: context,
      builder: (BuildContext context) {
        TextEditingController controller = TextEditingController(text: currentName);
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit API Key', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: TextField(
            controller: controller,
            onChanged: (value) {
              // No need to update state here, controller handles it
            },
            decoration: const InputDecoration(
              hintText: 'Enter new API Key Name',
              hintStyle: TextStyle(color: Color(0xFFf1f5f9)),
              enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
              focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
            ),
            style: const TextStyle(color: Color(0xFFf1f5f9)),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(context, null),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, controller.text),
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    ).then((value) => updatedKeyName = value);

    if (updatedKeyName != null && updatedKeyName.isNotEmpty && updatedKeyName != currentName) {
      try {
        await ref.read(apiServiceProvider).post('/trpc/tenantApiKeys.edit', body: {'id': id, 'name': updatedKeyName});
        _fetchApiKeys();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update API key: $e', style: const TextStyle(color: Color(0xFFf1f5f9)))),
        );
      }
    }
  }

  Future<void> _deleteApiKey(String id) async {
    bool? confirmDelete = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this API key?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent))),
          ],
        );
      },
    );

    if (confirmDelete == true) {
      try {
        await ref.read(apiServiceProvider).post('/trpc/tenantApiKeys.delete', body: {'id': id});
        _fetchApiKeys();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete API key: $e', style: const TextStyle(color: Color(0xFFf1f5f9)))),
        );
      }
    }
  }

  List<dynamic> get _filteredApiKeys {
    if (_searchQuery.isEmpty) {
      return _apiKeys;
    }
    return _apiKeys.where((key) {
      final name = key['name']?.toLowerCase() ?? '';
      final id = key['id']?.toLowerCase() ?? '';
      final query = _searchQuery.toLowerCase();
      return name.contains(query) || id.contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('Tenant API Keys', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
              decoration: InputDecoration(
                hintText: 'Search API Keys',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF0f172a), // Slightly darker for search bar
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchApiKeys,
        color: const Color(0xFF6366f1), // Accent color for refresh indicator
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1)))
            : _error != null
                ? Center(
                    child: Text('Error: $_error', style: const TextStyle(color: Color(0xFFf1f5f9))),
                  )
                : _filteredApiKeys.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text('No API keys found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                            const SizedBox(height: 16),
                            ElevatedButton(
                              onPressed: _createApiKey,
                              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
                              child: const Text('Create New API Key', style: TextStyle(color: Color(0xFFf1f5f9))),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        itemCount: _filteredApiKeys.length,
                        itemBuilder: (context, index) {
                          final apiKey = _filteredApiKeys[index];
                          // Default values for missing fields to prevent errors
                          final String keyId = apiKey['id']?.toString() ?? 'N/A';
                          final String keyName = apiKey['name']?.toString() ?? 'Unnamed Key';
                          final String createdAt = apiKey['createdAt'] != null
                              ? DateTime.parse(apiKey['createdAt']).toLocal().toString().split(' ')[0]
                              : 'N/A';
                          final String status = apiKey['status']?.toString() ?? 'unknown';

                          return Card(
                            color: const Color(0xFF1e293b),
                            margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Key ID: $keyId', style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 4),
                                  Text('Name: $keyName', style: const TextStyle(color: Color(0xFFf1f5f9))),
                                  const SizedBox(height: 4),
                                  Text('Created At: $createdAt', style: const TextStyle(color: Color(0xFFf1f5f9))),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9))),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: status == 'active' ? Colors.green : Colors.red,
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: Text(status.toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 12)),
                                      ),
                                    ],
                                  ),
                                  ButtonBar(
                                    alignment: MainAxisAlignment.end,
                                    children: [
                                      TextButton(
                                        onPressed: () => _editApiKey(keyId, keyName),
                                        style: TextButton.styleFrom(foregroundColor: const Color(0xFF6366f1)),
                                        child: const Text('Edit'),
                                      ),
                                      TextButton(
                                        onPressed: () => _deleteApiKey(keyId),
                                        style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
                                        child: const Text('Delete'),
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
      floatingActionButton: FloatingActionButton(
        onPressed: _createApiKey,
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}
