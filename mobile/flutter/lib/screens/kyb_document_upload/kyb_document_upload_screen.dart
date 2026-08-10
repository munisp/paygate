import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

// Assuming dioProvider is defined elsewhere, e.g., in a providers.dart file
final dioProvider = Provider<Dio>((ref) => Dio());

class KybDocumentUploadScreen extends ConsumerStatefulWidget {
  const KybDocumentUploadScreen({super.key});

  @override
  ConsumerState<KybDocumentUploadScreen> createState() => _KybDocumentUploadScreenState();
}

class _KybDocumentUploadScreenState extends ConsumerState<KybDocumentUploadScreen> {
  List<Map<String, String>> _documents = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      final response = await dio.get('/api/trpc/kyc.getSubmissions');
      // Assuming the response data is a list of maps matching the document structure
      setState(() {
        _documents = List<Map<String, String>>.from(response.data['submissions'].map((item) => {
          'name': item['documentName'],
          'status': item['status'],
          'id': item['id'].toString(),
        }));
      });
    } on DioException catch (e) {
      setState(() {
        _error = 'Failed to load documents: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred: $e';
      });
    }
    finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _uploadDocument() async {
    // This is a placeholder for actual file picking and uploading logic
    // For now, it simulates an upload and then reloads the data.
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      // Simulate uploading a new document. In a real app, you'd get file data here.
      final response = await dio.post(
        '/api/trpc/kyc.uploadDocument',
        data: {
          'documentName': 'New Document',
          'fileContent': 'base64encodedFileContent', // Replace with actual file content
        },
      );
      // After successful upload, reload the document list
      await _loadData();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Document uploaded successfully!')),
      );
    } on DioException catch (e) {
      setState(() {
        _error = 'Failed to upload document: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred during upload: $e';
      });
    }
    finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Document Upload'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Required Documents',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            if (_isLoading)
              const Center(child: CircularProgressIndicator())
            else if (_error != null)
              Center(
                child: Column(
                  children: [
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                    ElevatedButton(
                      onPressed: _loadData,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              )
            else if (_documents.isEmpty)
              const Center(child: Text('No documents found.'))
            else
              Expanded(
                child: ListView.builder(
                  itemCount: _documents.length,
                  itemBuilder: (context, index) {
                    final document = _documents[index];
                    return Card(
                      margin: const EdgeInsets.symmetric(vertical: 8.0),
                      child: ListTile(
                        title: Text(document['name']!),
                        subtitle: Text('Status: ${document['status']!}'),
                        trailing: _buildStatusIcon(document['status']!),
                        onTap: () {
                          // Handle document tap, e.g., view details or upload new version
                          print('Tapped on ${document['name']}');
                        },
                      ),
                    );
                  },
                ),
              ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _uploadDocument,
              child: const Text('Upload New Document'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusIcon(String status) {
    switch (status) {
      case 'Approved':
        return const Icon(Icons.check_circle, color: Colors.green);
      case 'Pending':
        return const Icon(Icons.hourglass_empty, color: Colors.orange);
      case 'Rejected':
        return const Icon(Icons.cancel, color: Colors.red);
      default:
        return const Icon(Icons.info, color: Colors.grey);
    }
  }
}
