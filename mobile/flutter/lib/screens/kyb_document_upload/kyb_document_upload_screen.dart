
import 'package:flutter/material.dart';

class KYBDocumentUploadScreen extends StatefulWidget {
  const KYBDocumentUploadScreen({super.key});
  @override
  State<KYBDocumentUploadScreen> createState() => _KYBDocumentUploadScreenState();
}

class _KYBDocumentUploadScreenState extends State<KYBDocumentUploadScreen> {
  final List<Map<String, dynamic>> _docTypes = [
    {'type': 'cac_certificate', 'label': 'CAC Certificate', 'required': true, 'status': 'verified'},
    {'type': 'memorandum', 'label': 'Memorandum & Articles', 'required': true, 'status': 'pending'},
    {'type': 'directors_id', 'label': "Directors' ID", 'required': true, 'status': 'uploaded'},
    {'type': 'proof_of_address', 'label': 'Proof of Address', 'required': true, 'status': null},
    {'type': 'bank_statement', 'label': 'Bank Statement', 'required': true, 'status': null},
  ];

  Color _statusColor(String? status) {
    switch (status) {
      case 'verified': return Colors.green;
      case 'pending': return Colors.orange;
      case 'uploaded': return Colors.blue;
      default: return Colors.grey;
    }
  }

  int get _verifiedCount => _docTypes.where((d) => d['status'] == 'verified').length;
  int get _requiredCount => _docTypes.where((d) => d['required'] == true).length;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('KYB Document Upload')),
      body: Column(
        children: [
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Verification Progress', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                LinearProgressIndicator(value: _verifiedCount / _requiredCount),
                const SizedBox(height: 4),
                Text('\$_verifiedCount / \$_requiredCount required documents verified',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _docTypes.length,
              itemBuilder: (ctx, i) {
                final doc = _docTypes[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: Icon(Icons.description, color: _statusColor(doc['status'])),
                    title: Text(doc['label'], style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(doc['required'] ? 'Required' : 'Optional'),
                    trailing: doc['status'] != 'verified'
                        ? ElevatedButton(
                            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('File picker coming soon')),
                            ),
                            child: const Text('Upload'),
                          )
                        : const Icon(Icons.check_circle, color: Colors.green),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
