import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Placeholder for TenantBranding model
class TenantBranding {
  final String id;
  final String tenantId;
  final String logoUrl;
  final String primaryColor;
  final String secondaryColor;
  final String faviconUrl;
  final DateTime createdAt;
  final DateTime updatedAt;

  TenantBranding({
    required this.id,
    required this.tenantId,
    required this.logoUrl,
    required this.primaryColor,
    required this.secondaryColor,
    required this.faviconUrl,
    required this.createdAt,
    required this.updatedAt,
  });

  factory TenantBranding.fromJson(Map<String, dynamic> json) {
    return TenantBranding(
      id: json['id'],
      tenantId: json['tenantId'],
      logoUrl: json['logoUrl'],
      primaryColor: json['primaryColor'],
      secondaryColor: json['secondaryColor'],
      faviconUrl: json['faviconUrl'],
      createdAt: DateTime.parse(json['createdAt']),
      updatedAt: DateTime.parse(json['updatedAt']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'tenantId': tenantId,
        'logoUrl': logoUrl,
        'primaryColor': primaryColor,
        'secondaryColor': secondaryColor,
        'faviconUrl': faviconUrl,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };
}

// Riverpod provider for fetching tenant branding data
final tenantBrandingListProvider = FutureProvider.family<
    List<TenantBranding>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get(
      '/trpc/tenantBranding.list',
      params: {'query': query});
  return (response.data as List)
      .map((e) => TenantBranding.fromJson(e))
      .toList();
});

// Riverpod provider for managing tenant branding state (e.g., for CRUD operations)
class TenantBrandingNotifier extends StateNotifier<AsyncValue<List<TenantBranding>>> {
  TenantBrandingNotifier(this.ref) : super(const AsyncValue.loading());

  final Ref ref;

  Future<void> fetchTenantBranding(String query) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.get(
          '/trpc/tenantBranding.list',
          params: {'query': query});
      final List<TenantBranding> brandingList = (response.data as List)
          .map((e) => TenantBranding.fromJson(e))
          .toList();
      state = AsyncValue.data(brandingList);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> createTenantBranding(TenantBranding branding) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/tenantBranding.create', body: branding.toJson());
      // Refresh the list after creation
      await fetchTenantBranding(''); // Or with current query
    } catch (e, st) {
      // Handle error
      debugPrint('Error creating tenant branding: $e');
    }
  }

  Future<void> updateTenantBranding(TenantBranding branding) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/tenantBranding.update', body: branding.toJson());
      // Refresh the list after update
      await fetchTenantBranding(''); // Or with current query
    } catch (e, st) {
      // Handle error
      debugPrint('Error updating tenant branding: $e');
    }
  }

  Future<void> deleteTenantBranding(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/tenantBranding.delete', body: {'id': id});
      // Refresh the list after deletion
      await fetchTenantBranding(''); // Or with current query
    } catch (e, st) {
      // Handle error
      debugPrint('Error deleting tenant branding: $e');
    }
  }
}

final tenantBrandingNotifierProvider = StateNotifierProvider<
    TenantBrandingNotifier, AsyncValue<List<TenantBranding>>>((ref) {
  return TenantBrandingNotifier(ref);
});

class TenantBrandingAdminScreen extends ConsumerStatefulWidget {
  const TenantBrandingAdminScreen({super.key});

  @override
  ConsumerState<TenantBrandingAdminScreen> createState() =>
      _TenantBrandingAdminScreenState();
}

class _TenantBrandingAdminScreenState
    extends ConsumerState<TenantBrandingAdminScreen> {
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
    // Initial fetch
    ref.read(tenantBrandingNotifierProvider.notifier).fetchTenantBranding('');
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshData() async {
    await ref.read(tenantBrandingNotifierProvider.notifier).fetchTenantBranding(_searchQuery);
  }

  @override
  Widget build(BuildContext context) {
    final tenantBrandingAsyncValue = ref.watch(tenantBrandingNotifierProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark theme background
      appBar: AppBar(
        title: const Text('Tenant Branding Admin', style: TextStyle(color: Color(0xFFf1f5f9))), // Dark theme text
        backgroundColor: const Color(0xFF1e293b), // Dark theme card/app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  labelText: 'Search Tenant Branding',
                  labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                  hintStyle: const TextStyle(color: Color(0xFF94a3b8)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: const BorderSide(color: Color(0xFF6366f1)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: const BorderSide(color: Color(0xFF6366f1)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: const BorderSide(color: Color(0xFF6366f1), width: 2.0),
                  ),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            Expanded(
              child: tenantBrandingAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent))),
                data: (brandingList) {
                  if (brandingList.isEmpty) {
                    return const Center(child: Text('No tenant branding found.', style: TextStyle(color: Color(0xFFf1f5f9))));
                  }
                  final filteredList = brandingList.where((branding) =>
                      branding.tenantId.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                      branding.logoUrl.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                      branding.primaryColor.toLowerCase().contains(_searchQuery.toLowerCase())
                  ).toList();

                  if (filteredList.isEmpty) {
                    return const Center(child: Text('No matching tenant branding found.', style: TextStyle(color: Color(0xFFf1f5f9))));
                  }

                  return ListView.builder(
                    itemCount: filteredList.length,
                    itemBuilder: (context, index) {
                      final branding = filteredList[index];
                      return Card(
                        color: const Color(0xFF1e293b), // Dark theme card
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text('Tenant ID: ${branding.tenantId}', style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Logo: ${branding.logoUrl}', style: const TextStyle(color: Color(0xFFf1f5f9))), 
                              Text('Primary Color: ${branding.primaryColor}', style: const TextStyle(color: Color(0xFFf1f5f9))), 
                              Text('Updated: ${branding.updatedAt.toLocal().toString().split(' ')[0]}', style: const TextStyle(color: Color(0xFFf1f5f9))), 
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _showEditDialog(context, branding),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _confirmDelete(context, branding.id),
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
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDialog(context),
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  void _showCreateDialog(BuildContext context) {
    final TextEditingController tenantIdController = TextEditingController();
    final TextEditingController logoUrlController = TextEditingController();
    final TextEditingController primaryColorController = TextEditingController();
    final TextEditingController secondaryColorController = TextEditingController();
    final TextEditingController faviconUrlController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create Tenant Branding', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: tenantIdController,
                  decoration: _inputDecoration('Tenant ID'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 8.0),
                TextField(
                  controller: logoUrlController,
                  decoration: _inputDecoration('Logo URL'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 8.0),
                TextField(
                  controller: primaryColorController,
                  decoration: _inputDecoration('Primary Color (Hex)'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 8.0),
                TextField(
                  controller: secondaryColorController,
                  decoration: _inputDecoration('Secondary Color (Hex)'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 8.0),
                TextField(
                  controller: faviconUrlController,
                  decoration: _inputDecoration('Favicon URL'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
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
                final newBranding = TenantBranding(
                  id: UniqueKey().toString(), // Placeholder ID
                  tenantId: tenantIdController.text,
                  logoUrl: logoUrlController.text,
                  primaryColor: primaryColorController.text,
                  secondaryColor: secondaryColorController.text,
                  faviconUrl: faviconUrlController.text,
                  createdAt: DateTime.now(),
                  updatedAt: DateTime.now(),
                );
                await ref.read(tenantBrandingNotifierProvider.notifier).createTenantBranding(newBranding);
                if (mounted) Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(BuildContext context, TenantBranding branding) {
    final TextEditingController tenantIdController = TextEditingController(text: branding.tenantId);
    final TextEditingController logoUrlController = TextEditingController(text: branding.logoUrl);
    final TextEditingController primaryColorController = TextEditingController(text: branding.primaryColor);
    final TextEditingController secondaryColorController = TextEditingController(text: branding.secondaryColor);
    final TextEditingController faviconUrlController = TextEditingController(text: branding.faviconUrl);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Tenant Branding', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: tenantIdController,
                  decoration: _inputDecoration('Tenant ID'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 8.0),
                TextField(
                  controller: logoUrlController,
                  decoration: _inputDecoration('Logo URL'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 8.0),
                TextField(
                  controller: primaryColorController,
                  decoration: _inputDecoration('Primary Color (Hex)'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 8.0),
                TextField(
                  controller: secondaryColorController,
                  decoration: _inputDecoration('Secondary Color (Hex)'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 8.0),
                TextField(
                  controller: faviconUrlController,
                  decoration: _inputDecoration('Favicon URL'),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
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
                final updatedBranding = TenantBranding(
                  id: branding.id,
                  tenantId: tenantIdController.text,
                  logoUrl: logoUrlController.text,
                  primaryColor: primaryColorController.text,
                  secondaryColor: secondaryColorController.text,
                  faviconUrl: faviconUrlController.text,
                  createdAt: branding.createdAt,
                  updatedAt: DateTime.now(),
                );
                await ref.read(tenantBrandingNotifierProvider.notifier).updateTenantBranding(updatedBranding);
                if (mounted) Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Update', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _confirmDelete(BuildContext context, String id) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this tenant branding?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: () async {
                await ref.read(tenantBrandingNotifierProvider.notifier).deleteTenantBranding(id);
                if (mounted) Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  InputDecoration _inputDecoration(String labelText) {
    return InputDecoration(
      labelText: labelText,
      labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
      hintStyle: const TextStyle(color: Color(0xFF94a3b8)),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: const BorderSide(color: Color(0xFF6366f1)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: const BorderSide(color: Color(0xFF6366f1)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: const BorderSide(color: Color(0xFF6366f1), width: 2.0),
      ),
    );
  }
}
