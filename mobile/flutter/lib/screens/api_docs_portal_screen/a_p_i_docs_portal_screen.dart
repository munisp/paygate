import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Mock API Document model for demonstration
class ApiDocument {
  final String id;
  final String title;
  final String description;
  final String version;
  final DateTime lastUpdated;
  final String status;

  ApiDocument({
    required this.id,
    required this.title,
    required this.description,
    required this.version,
    required this.lastUpdated,
    required this.status,
  });
}

// Define a provider for fetching API documentation data
final apiDocsProvider = FutureProvider<List<ApiDocument>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    // Simulate network delay
    await Future.delayed(const Duration(seconds: 1));
    // Assuming 'apiDocs.list' is the tRPC procedure for listing API documentation
    // In a real scenario, parse the response into a list of ApiDocument objects.
    // For this example, we'll return a mock list of ApiDocument objects.
    return List<ApiDocument>.generate(10, (index) {
      return ApiDocument(
        id: 'doc_${index + 1}',
        title: 'API Document Title ${index + 1}',
        description: 'This is a description for API Document ${index + 1}. It covers various aspects of the API.',
        version: 'v1.${index % 3}',
        lastUpdated: DateTime.now().subtract(Duration(days: index * 5)),
        status: index % 2 == 0 ? 'Active' : 'Deprecated',
      );
    });
  } catch (e) {
    throw Exception('Failed to load API documentation: $e');
  }
});

// Provider for search query
final searchQueryProvider = StateProvider<String>((ref) => '');

// Provider for filtered API documents
final filteredApiDocsProvider = Provider<AsyncValue<List<ApiDocument>>>((ref) {
  final apiDocsAsyncValue = ref.watch(apiDocsProvider);
  final searchQuery = ref.watch(searchQueryProvider);

  return apiDocsAsyncValue.whenData((apiDocs) {
    if (searchQuery.isEmpty) {
      return apiDocs;
    } else {
      return apiDocs.where((doc) {
        return doc.title.toLowerCase().contains(searchQuery.toLowerCase()) ||
               doc.description.toLowerCase().contains(searchQuery.toLowerCase());
      }).toList();
    }
  });
});

class APIDocsPortalScreen extends ConsumerStatefulWidget {
  const APIDocsPortalScreen({super.key});

  @override
  ConsumerState<APIDocsPortalScreen> createState() => _APIDocsPortalScreenState();
}

class _APIDocsPortalScreenState extends ConsumerState<APIDocsPortalScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filteredApiDocsAsyncValue = ref.watch(filteredApiDocsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'API Docs Portal',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Light text
        ),
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: Color(0xFFf1f5f9)),
              decoration: InputDecoration(
                hintText: 'Search API documentation...',
                hintStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF1e293b),
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(apiDocsProvider.future),
              child: filteredApiDocsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(
                  child: Text(
                    'Error: $err',
                    style: const TextStyle(color: Color(0xFFf1f5f9)),
                  ),
                ),
                data: (apiDocs) {
                  if (apiDocs.isEmpty) {
                    return const Center(
                      child: Text(
                        'No API documentation available.',
                        style: TextStyle(color: Color(0xFFf1f5f9)),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: apiDocs.length,
                    itemBuilder: (context, index) {
                      final doc = apiDocs[index];
                      return Card(
                        color: const Color(0xFF1e293b), // Card background
                        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                doc.title,
                                style: const TextStyle(
                                  color: Color(0xFFf1f5f9),
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                doc.description,
                                style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  _buildStatusBadge(doc.status),
                                  Text(
                                    'Version: ${doc.version}',
                                    style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                                  ),
                                  Text(
                                    'Updated: ${_formatDate(doc.lastUpdated)}',
                                    style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Align(
                                alignment: Alignment.bottomRight,
                                child: ElevatedButton(
                                  onPressed: () {
                                    // TODO: Implement view details action
                                    _showDetailsDialog(context, doc);
                                  },
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF6366f1), // Accent color
                                    foregroundColor: const Color(0xFFf1f5f9),
                                  ),
                                  child: const Text('View Details'),
                                ),
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
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    Color textColor = const Color(0xFFf1f5f9);
    switch (status) {
      case 'Active':
        badgeColor = Colors.green.shade700;
        break;
      case 'Deprecated':
        badgeColor = Colors.red.shade700;
        break;
      default:
        badgeColor = Colors.grey.shade700;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: TextStyle(color: textColor, fontSize: 12),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  void _showDetailsDialog(BuildContext context, ApiDocument doc) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text(doc.title, style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                Text('ID: ${doc.id}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                Text('Description: ${doc.description}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                Text('Version: ${doc.version}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                Text('Last Updated: ${_formatDate(doc.lastUpdated)}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                Text('Status: ${doc.status}', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                // Add more details here as needed
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Close', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}
