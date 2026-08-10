import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Dummy data model for KYB Document
class KYBDocument {
  final String id;
  final String name;
  final String type;
  final String status;
  final DateTime uploadDate;
  final String? notes;

  KYBDocument({
    required this.id,
    required this.name,
    required this.type,
    required this.status,
    required this.uploadDate,
    this.notes,
  });

  factory KYBDocument.fromJson(Map<String, dynamic> json) {
    return KYBDocument(
      id: json['id'] as String,
      name: json['name'] as String,
      type: json['type'] as String,
      status: json['status'] as String,
      uploadDate: DateTime.parse(json['uploadDate'] as String),
      notes: json['notes'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'type': type,
        'status': status,
        'uploadDate': uploadDate.toIso8601String(),
        'notes': notes,
      };

  KYBDocument copyWith({
    String? id,
    String? name,
    String? type,
    String? status,
    DateTime? uploadDate,
    String? notes,
  }) {
    return KYBDocument(
      id: id ?? this.id,
      name: name ?? this.name,
      type: type ?? this.type,
      status: status ?? this.status,
      uploadDate: uploadDate ?? this.uploadDate,
      notes: notes ?? this.notes,
    );
  }
}

// Riverpod providers
final documentSearchQueryProvider = StateProvider<String>((ref) => '');

final documentListProvider = FutureProvider.family<List<KYBDocument>, String>((ref, searchQuery) async {
  final api = ref.read(apiServiceProvider);
  try {
    // Simulate API call for listing documents
    final response = await api.get('/trpc/kyb.documentUpload.list', params: {'search': searchQuery});
    // In a real app, parse response into List<KYBDocument>
    // For now, return dummy data filtered by search query
    await Future.delayed(const Duration(milliseconds: 500)); // Simulate network delay
    final allDocuments = [
      KYBDocument(id: '1', name: 'Business Registration', type: 'Certificate', status: 'Approved', uploadDate: DateTime(2023, 1, 15)),
      KYBDocument(id: '2', name: 'Tax ID Certificate', type: 'Certificate', status: 'Pending', uploadDate: DateTime(2023, 2, 20), notes: 'Awaiting verification'),
      KYBDocument(id: '3', name: 'Utility Bill', type: 'Proof of Address', status: 'Rejected', uploadDate: DateTime(2023, 3, 10), notes: 'Address mismatch'),
      KYBDocument(id: '4', name: 'Director ID', type: 'ID Document', status: 'Approved', uploadDate: DateTime(2023, 4, 5)),
      KYBDocument(id: '5', name: 'Bank Statement', type: 'Financial', status: 'Pending', uploadDate: DateTime(2023, 5, 1)),
    ];
    return allDocuments.where((doc) => doc.name.toLowerCase().contains(searchQuery.toLowerCase())).toList();
  } catch (e) {
    // Handle API error
    throw Exception('Failed to load documents: $e');
  }
});

class KYBDocumentUploadScreen extends ConsumerStatefulWidget {
  const KYBDocumentUploadScreen({super.key});

  @override
  ConsumerState<KYBDocumentUploadScreen> createState() => _KYBDocumentUploadScreenState();
}

class _KYBDocumentUploadScreenState extends ConsumerState<KYBDocumentUploadScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(documentSearchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshDocuments() async {
    ref.invalidate(documentListProvider);
  }

  void _showDocumentFormDialog({KYBDocument? document}) {
    final isEditing = document != null;
    final nameController = TextEditingController(text: document?.name);
    final typeController = TextEditingController(text: document?.type);
    final notesController = TextEditingController(text: document?.notes);
    String? selectedStatus = document?.status;

    showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: const Color(0xFF1e293b), // Card color
        title: Text(isEditing ? 'Edit Document' : 'Upload New Document', style: const TextStyle(color: Color(0xFFf1f5f9))),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Document Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: typeController,
                decoration: const InputDecoration(
                  labelText: 'Document Type',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: selectedStatus,
                decoration: const InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                dropdownColor: const Color(0xFF1e293b),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                items: <String>['Approved', 'Pending', 'Rejected'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  selectedStatus = newValue;
                },
              ),
              const SizedBox(height: 16),
              TextField(
                controller: notesController,
                decoration: const InputDecoration(
                  labelText: 'Notes (Optional)',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                maxLines: 3,
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
              final api = ref.read(apiServiceProvider);
              final newDoc = KYBDocument(
                id: document?.id ?? UniqueKey().toString(), // Use existing ID or generate new
                name: nameController.text,
                type: typeController.text,
                status: selectedStatus ?? 'Pending',
                uploadDate: document?.uploadDate ?? DateTime.now(),
                notes: notesController.text.isEmpty ? null : notesController.text,
              );

              try {
                if (isEditing) {
                  await api.post('/trpc/kyb.documentUpload.update', body: newDoc.toJson());
                } else {
                  await api.post('/trpc/kyb.documentUpload.create', body: newDoc.toJson());
                }
                _refreshDocuments();
                Navigator.of(context).pop();
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Failed to ${isEditing ? 'update' : 'create'} document: $e'))
                );
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: Text(isEditing ? 'Save' : 'Upload', style: const TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      );
    });
  }

  void _confirmDeleteDocument(KYBDocument document) {
    showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: Text('Are you sure you want to delete "${document.name}"?',
            style: const TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () async {
              final api = ref.read(apiServiceProvider);
              try {
                await api.post('/trpc/kyb.documentUpload.delete', body: {'id': document.id});
                _refreshDocuments();
                Navigator.of(context).pop();
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Failed to delete document: $e'))
                );
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      );
    });
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Approved':
        return Colors.green;
      case 'Pending':
        return Colors.orange;
      case 'Rejected':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final searchQuery = ref.watch(documentSearchQueryProvider);
    final documentsAsyncValue = ref.watch(documentListProvider(searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Background color
      appBar: AppBar(
        title: const Text('KYB Document Upload', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b), // Card color for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search documents...', 
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF0f172a), // Darker background for search field
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshDocuments,
        color: const Color(0xFF6366f1), // Accent color for refresh indicator
        child: documentsAsyncValue.when(
          data: (documents) {
            if (documents.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.folder_open, size: 60, color: Color(0xFFf1f5f9)),
                    const SizedBox(height: 16),
                    Text(
                      searchQuery.isEmpty ? 'No documents uploaded yet.' : 'No documents found for "$searchQuery".',
                      style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 18),
                      textAlign: TextAlign.center,
                    ),
                    if (searchQuery.isNotEmpty)
                      TextButton(
                        onPressed: () {
                          _searchController.clear();
                          ref.read(documentSearchQueryProvider.notifier).state = '';
                        },
                        child: const Text('Clear Search', style: TextStyle(color: Color(0xFF6366f1))),
                      ),
                  ],
                ),
              );
            }
            return ListView.builder(
              itemCount: documents.length,
              itemBuilder: (context, index) {
                final document = documents[index];
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                  color: const Color(0xFF1e293b), // Card color
                  child: ListTile(
                    title: Text(document.name, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Type: ${document.type}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                        Text('Uploaded: ${document.uploadDate.toLocal().toString().split(' ')[0]}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                        if (document.notes != null) Text('Notes: ${document.notes}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                        const SizedBox(height: 4),
                        Chip(
                          label: Text(document.status, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          backgroundColor: _getStatusColor(document.status),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        ),
                      ],
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                          onPressed: () => _showDocumentFormDialog(document: document),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.redAccent),
                          onPressed: () => _confirmDeleteDocument(document),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color for spinner
          error: (error, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 60, color: Colors.redAccent),
                  const SizedBox(height: 16),
                  Text(
                    'Error: ${error.toString()}',
                    style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _refreshDocuments,
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
                    child: const Text('Retry', style: TextStyle(color: Color(0xFFf1f5f9))),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showDocumentFormDialog(),
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}
