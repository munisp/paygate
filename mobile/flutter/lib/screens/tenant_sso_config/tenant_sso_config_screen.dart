import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Mock data for demonstration purposes
class SsoConfig {
  final String id;
  final String name;
  final String provider;
  final bool isActive;
  final DateTime createdAt;

  SsoConfig({
    required this.id,
    required this.name,
    required this.provider,
    required this.isActive,
    required this.createdAt,
  });

  factory SsoConfig.fromJson(Map<String, dynamic> json) {
    return SsoConfig(
      id: json['id'] as String,
      name: json['name'] as String,
      provider: json['provider'] as String,
      isActive: json['isActive'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'provider': provider,
        'isActive': isActive,
        'createdAt': createdAt.toIso8601String(),
      };
}

// Providers
final tenantSsoConfigListProvider = FutureProvider.family<List<SsoConfig>, String?>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/tenantSsoConfig.list', params: {'query': query});
  // Simulate API response parsing
  final List<dynamic> data = response['data'] ?? [];
  return data.map((json) => SsoConfig.fromJson(json)).toList();
});

final tenantSsoConfigCreateProvider = FutureProvider.family<SsoConfig, Map<String, dynamic>>((ref, configData) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.post('/trpc/tenantSsoConfig.create', body: configData);
  // Simulate API response parsing
  return SsoConfig.fromJson(response['data']);
});

final tenantSsoConfigUpdateProvider = FutureProvider.family<SsoConfig, Map<String, dynamic>>((ref, configData) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.post('/trpc/tenantSsoConfig.update', body: configData);
  // Simulate API response parsing
  return SsoConfig.fromJson(response['data']);
});

final tenantSsoConfigDeleteProvider = FutureProvider.family<void, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  await api.post('/trpc/tenantSsoConfig.delete', body: {'id': id});
});

class TenantSsoConfigScreen extends ConsumerStatefulWidget {
  const TenantSsoConfigScreen({super.key});

  @override
  ConsumerState<TenantSsoConfigScreen> createState() => _TenantSsoConfigScreenState();
}

class _TenantSsoConfigScreenState extends ConsumerState<TenantSsoConfigScreen> {
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

  Future<void> _refreshSsoConfigs() async {
    ref.invalidate(tenantSsoConfigListProvider(_searchQuery));
    await ref.read(tenantSsoConfigListProvider(_searchQuery).future);
  }

  void _showCreateEditDialog({SsoConfig? config}) {
    final isEditing = config != null;
    final TextEditingController nameController = TextEditingController(text: config?.name);
    final TextEditingController providerController = TextEditingController(text: config?.provider);
    bool isActive = config?.isActive ?? true;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return AlertDialog(
              backgroundColor: const Color(0xFF1e293b),
              title: Text(isEditing ? 'Edit SSO Config' : 'Create SSO Config', style: const TextStyle(color: Color(0xFFf1f5f9))),
              content: SingleChildScrollView(
                child: ListBody(
                  children: <Widget>[
                    TextField(
                      controller: nameController,
                      decoration: const InputDecoration(
                        labelText: 'Name',
                        labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                        focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      ),
                      style: const TextStyle(color: Color(0xFFf1f5f9)),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: providerController,
                      decoration: const InputDecoration(
                        labelText: 'Provider',
                        labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                        focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                      ),
                      style: const TextStyle(color: Color(0xFFf1f5f9)),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Text('Active:', style: const TextStyle(color: Color(0xFFf1f5f9))),
                        Switch(
                          value: isActive,
                          onChanged: (bool value) {
                            setStateDialog(() {
                              isActive = value;
                            });
                          },
                          activeColor: const Color(0xFF6366f1)),
                      ],
                    ),
                  ],
                ),
              ),
              actions: <Widget>[
                TextButton(
                  child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
                  child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFFf1f5f9))),
                  onPressed: () async {
                    final newConfigData = {
                      'id': config?.id ?? UniqueKey().toString(), // Use existing ID for edit, new for create
                      'name': nameController.text,
                      'provider': providerController.text,
                      'isActive': isActive,
                      'createdAt': config?.createdAt.toIso8601String() ?? DateTime.now().toIso8601String(),
                    };

                    try {
                      if (isEditing) {
                        await ref.read(tenantSsoConfigUpdateProvider(newConfigData).future);
                      } else {
                        await ref.read(tenantSsoConfigCreateProvider(newConfigData).future);
                      }
                      _refreshSsoConfigs();
                      Navigator.of(context).pop();
                    } catch (e) {
                      // Handle error, e.g., show a SnackBar
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Failed to ${isEditing ? 'update' : 'create'} SSO config: $e'))
                      );
                    }
                  },
                ),
              ],
            );
          },
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
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this SSO configuration?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () async {
                try {
                  await ref.read(tenantSsoConfigDeleteProvider(id).future);
                  _refreshSsoConfigs();
                  Navigator.of(context).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete SSO config: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final ssoConfigsAsyncValue = ref.watch(tenantSsoConfigListProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('Tenant SSO Configurations', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search SSO configurations...', 
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
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
      body: RefreshIndicator(
        onRefresh: _refreshSsoConfigs,
        color: const Color(0xFF6366f1),
        backgroundColor: const Color(0xFF1e293b),
        child: ssoConfigsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
          ),
          data: (ssoConfigs) {
            if (ssoConfigs.isEmpty) {
              return const Center(
                child: Text('No SSO configurations found.', style: TextStyle(color: Color(0xFFf1f5f9))),
              );
            }
            return ListView.builder(
              itemCount: ssoConfigs.length,
              itemBuilder: (context, index) {
                final config = ssoConfigs[index];
                return Card(
                  margin: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
                  color: const Color(0xFF1e293b),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(config.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFFf1f5f9))),
                        const SizedBox(height: 8),
                        Text('Provider: ${config.provider}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Text('Status: ', style: const TextStyle(color: Color(0xFFf1f5f9))),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: config.isActive ? Colors.green[700] : Colors.red[700],
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(config.isActive ? 'Active' : 'Inactive', style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 12)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text('Created: ${config.createdAt.toLocal().toString().split(' ')[0]}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                              onPressed: () => _showCreateEditDialog(config: config),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _showDeleteConfirmationDialog(config.id),
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
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}