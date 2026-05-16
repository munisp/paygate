import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Placeholder for API service provider. In a real app, this would be defined elsewhere.
// For this task, we assume apiServiceProvider is available from api_service.dart
// final apiServiceProvider = Provider<ApiService>((ref) => ApiService());

// Placeholder for Data Export data model
class ExportItem {
  final String id;
  final String name;
  final String status;
  final String type;
  final DateTime createdAt;
  final double sizeMB;
  final String? downloadUrl;

  ExportItem({
    required this.id,
    required this.name,
    required this.status,
    required this.type,
    required this.createdAt,
    required this.sizeMB,
    this.downloadUrl,
  });

  factory ExportItem.fromJson(Map<String, dynamic> json) {
    return ExportItem(
      id: json['id'],
      name: json['name'],
      status: json['status'],
      type: json['type'],
      createdAt: DateTime.parse(json['createdAt']),
      sizeMB: json['sizeMB'].toDouble(),
      downloadUrl: json['downloadUrl'],
    );
  }
}

// Placeholder for the API calls for Data Export
final dataExportsProvider = FutureProvider.family<List<ExportItem>, String>((ref, searchTerm) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/dataExport.list', params: {'searchTerm': searchTerm});
  // Simulate API response parsing
  return (response['exports'] as List)
      .map((e) => ExportItem.fromJson(e as Map<String, dynamic>))
      .toList();
});

final initiateExportProvider = FutureProvider.autoDispose.family<void, Map<String, dynamic>>((ref, exportParams) async {
  final api = ref.read(apiServiceProvider);
  await api.post('/trpc/dataExport.initiate', body: exportParams);
});

class DataExportScreen extends ConsumerStatefulWidget {
  const DataExportScreen({super.key});

  @override
  ConsumerState<DataExportScreen> createState() => _DataExportScreenState();
}

class _DataExportScreenState extends ConsumerState<DataExportScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchTerm = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchTerm = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshData() async {
    ref.invalidate(dataExportsProvider(_searchTerm));
    await ref.read(dataExportsProvider(_searchTerm).future);
  }

  void _showInitiateExportDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Initiate New Export', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                decoration: InputDecoration(
                  labelText: 'Export Name',
                  labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Colors.grey.shade700),
                  ),
                  focusedBorder: const OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFF6366f1)),
                  ),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              // Add more fields for export parameters as needed
            ],
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6366f1),
                foregroundColor: const Color(0xFFf1f5f9),
              ),
              child: const Text('Initiate Export'),
              onPressed: () async {
                // Simulate initiating export
                // In a real app, gather data from form fields
                final exportParams = {'name': 'New Export ${DateTime.now().millisecondsSinceEpoch}'};
                await ref.read(initiateExportProvider(exportParams).future);
                Navigator.of(context).pop();
                _refreshData(); // Refresh list after initiating export
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<ExportItem>> dataExports = ref.watch(dataExportsProvider(_searchTerm));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Data Export', style: TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: _showInitiateExportDialog,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        color: const Color(0xFF6366f1),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: InputDecoration(
                  hintText: 'Search exports...',
                  hintStyle: TextStyle(color: Colors.grey.shade500),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  filled: true,
                  fillColor: const Color(0xFF1e293b),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Expanded(
              child: dataExports.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
                ),
                data: (exports) {
                  if (exports.isEmpty) {
                    return const Center(
                      child: Text('No data exports found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }
                  return ListView.builder(
                    itemCount: exports.length,
                    itemBuilder: (context, index) {
                      final export = exports[index];
                      return Card(
                        color: const Color(0xFF1e293b),
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(export.name, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Type: ${export.type}', style: TextStyle(color: Colors.grey.shade400)),
                              Text.rich(
                                TextSpan(
                                  text: 'Status: ',
                                  style: TextStyle(color: Colors.grey.shade400),
                                  children: [
                                    _buildStatusBadge(export.status),
                                  ],
                                ),
                              ),
                              Text('Size: ${export.sizeMB.toStringAsFixed(2)} MB', style: TextStyle(color: Colors.grey.shade400)),
                              Text('Created: ${_formatDate(export.createdAt)}', style: TextStyle(color: Colors.grey.shade400)),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (export.downloadUrl != null) IconButton(
                                icon: const Icon(Icons.download, color: Color(0xFF6366f1)),
                                onPressed: () {
                                  // Implement download logic
                                  print('Download ${export.name}');
                                },
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () {
                                  _confirmDelete(export.id);
                                },
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

  InlineSpan _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'completed':
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
    return WidgetSpan(
      alignment: PlaceholderAlignment.middle,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: color.withOpacity(0.2),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          status,
          style: TextStyle(color: color, fontSize: 12),
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute}';
  }

  void _confirmDelete(String exportId) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this export?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.redAccent,
                foregroundColor: const Color(0xFFf1f5f9),
              ),
              child: const Text('Delete'),
              onPressed: () async {
                // Simulate delete API call
                // await ref.read(apiServiceProvider).post('/trpc/dataExport.delete', body: {'id': exportId});
                Navigator.of(context).pop();
                _refreshData(); // Refresh list after deletion
              },
            ),
          ],
        );
      },
    );
  }
}
