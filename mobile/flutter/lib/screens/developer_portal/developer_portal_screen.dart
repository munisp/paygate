import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Assuming a tRPC router namespace for DeveloperPortal is 'developer.portal'
// and procedures for list, create, update, delete.

final searchQueryProvider = StateProvider<String>((ref) => '');

final developerPortalDataProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/developer.portal.list');
    return response['result']['data']['json'] as List<dynamic>;
  } catch (e) {
    throw Exception('Failed to load developer portal data: $e');
  }
});

class DeveloperPortalScreen extends ConsumerStatefulWidget {
  const DeveloperPortalScreen({super.key});

  @override
  ConsumerState<DeveloperPortalScreen> createState() => _DeveloperPortalScreenState();
}

class _DeveloperPortalScreenState extends ConsumerState<DeveloperPortalScreen> {
  // Define theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  // Controllers for text fields in dialogs and search
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _descriptionController = TextEditingController();
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _createApiKey() async {
    _nameController.clear();
    _descriptionController.clear();
    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Create API Key', style: TextStyle(color: _textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Key Name',
                labelStyle: TextStyle(color: _textColor),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              ),
              style: const TextStyle(color: _textColor),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _descriptionController,
              decoration: const InputDecoration(
                labelText: 'Description',
                labelStyle: TextStyle(color: _textColor),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              ),
              style: const TextStyle(color: _textColor),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _accentColor)),
          ),
          TextButton(
            onPressed: () async {
              try {
                final api = ref.read(apiServiceProvider);
                await api.post(
                  '/trpc/developer.portal.create',
                  body: {
                    'name': _nameController.text,
                    'description': _descriptionController.text,
                  },
                );
                ref.invalidate(developerPortalDataProvider);
                if (mounted) Navigator.of(context).pop();
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create API Key: $e', style: const TextStyle(color: _textColor)), backgroundColor: Colors.red),
                  );
                }
              }
            },
            child: const Text('Create', style: TextStyle(color: _accentColor)),
          ),
        ],
      ),
    );
  }

  Future<void> _editApiKey(Map<String, dynamic> item) async {
    _nameController.text = item['name'] ?? '';
    _descriptionController.text = item['description'] ?? '';
    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Edit API Key', style: TextStyle(color: _textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Key Name',
                labelStyle: TextStyle(color: _textColor),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              ),
              style: const TextStyle(color: _textColor),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _descriptionController,
              decoration: const InputDecoration(
                labelText: 'Description',
                labelStyle: TextStyle(color: _textColor),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              ),
              style: const TextStyle(color: _textColor),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _accentColor)),
          ),
          TextButton(
            onPressed: () async {
              try {
                final api = ref.read(apiServiceProvider);
                await api.post(
                  '/trpc/developer.portal.update',
                  body: {
                    'id': item['id'],
                    'name': _nameController.text,
                    'description': _descriptionController.text,
                  },
                );
                ref.invalidate(developerPortalDataProvider);
                if (mounted) Navigator.of(context).pop();
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update API Key: $e', style: const TextStyle(color: _textColor)), backgroundColor: Colors.red),
                  );
                }
              }
            },
            child: const Text('Save', style: TextStyle(color: _accentColor)),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteApiKey(String id) async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Confirm Delete', style: TextStyle(color: _textColor)),
        content: const Text('Are you sure you want to delete this API Key?', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel', style: TextStyle(color: _accentColor)),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        final api = ref.read(apiServiceProvider);
        await api.post(
          '/trpc/developer.portal.delete',
          body: {'id': id},
        );
        ref.invalidate(developerPortalDataProvider);
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to delete API Key: $e', style: const TextStyle(color: _textColor)), backgroundColor: Colors.red),
          );
        }
      }
    }
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'active':
        badgeColor = Colors.green;
        break;
      case 'inactive':
        badgeColor = Colors.red;
        break;
      case 'pending':
        badgeColor = Colors.orange;
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
        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final developerPortalDataAsync = ref.watch(developerPortalDataProvider);
    final searchQuery = ref.watch(searchQueryProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Developer Portal', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _accentColor),
            onPressed: _createApiKey,
            tooltip: 'Create New API Key',
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              onChanged: (query) => ref.read(searchQueryProvider.notifier).state = query,
              decoration: InputDecoration(
                hintText: 'Search API Keys...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: _cardColor,
              ),
              style: const TextStyle(color: _textColor),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(developerPortalDataProvider);
        },
        child: developerPortalDataAsync.when(
          data: (data) {
            final filteredData = data.where((item) {
              final name = item['name']?.toLowerCase() ?? '';
              final description = item['description']?.toLowerCase() ?? '';
              final status = item['status']?.toLowerCase() ?? '';
              final query = searchQuery.toLowerCase();
              return name.contains(query) || description.contains(query) || status.contains(query);
            }).toList();

            if (filteredData.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      searchQuery.isEmpty ? 'No developer portal items found.' : 'No matching items found for "$searchQuery".',
                      style: TextStyle(color: _textColor, fontSize: 18),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    if (searchQuery.isEmpty) // Only show create button if not searching
                      ElevatedButton.icon(
                        onPressed: _createApiKey,
                        icon: const Icon(Icons.add, color: _textColor),
                        label: const Text('Create API Key', style: TextStyle(color: _textColor)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _accentColor,
                          foregroundColor: _textColor,
                        ),
                      ),
                  ],
                ),
              );
            }
            return ListView.builder(
              itemCount: filteredData.length,
              itemBuilder: (context, index) {
                final item = filteredData[index];
                // Example of date formatting (assuming 'createdAt' field exists)
                final DateTime? createdAt = item['createdAt'] != null ? DateTime.parse(item['createdAt']) : null;
                final String formattedDate = createdAt != null ? '${createdAt.day}/${createdAt.month}/${createdAt.year}' : 'N/A';

                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.all(8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                item['name'] ?? 'N/A',
                                style: const TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            _buildStatusBadge(item['status'] ?? 'Unknown'),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Description: ${item['description'] ?? 'No description provided'}\n',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        Text(
                          'Key ID: ${item['id'] ?? 'N/A'}\n',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        Text(
                          'Created At: $formattedDate',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: _accentColor),
                              onPressed: () => _editApiKey(item),
                              tooltip: 'Edit API Key',
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _deleteApiKey(item['id']),
                              tooltip: 'Delete API Key',
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
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (error, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Text(
                'Error: $error',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.red, fontSize: 16),
              ),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createApiKey,
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: _textColor),
      ),
    );
  }
}
