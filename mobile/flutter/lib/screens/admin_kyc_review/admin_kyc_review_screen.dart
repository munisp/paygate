import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class AdminKYCReviewScreen extends StatefulWidget {
  const AdminKYCReviewScreen({super.key});
  @override
  State<AdminKYCReviewScreen> createState() => _AdminKYCReviewScreenState();
}

class _AdminKYCReviewScreenState extends State<AdminKYCReviewScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _submissions = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _api.get('/api/trpc/kybMgmt.list');
      setState(() { _submissions = data['result']['data'] ?? []; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('KYC Review')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : ListView.builder(
                  itemCount: _submissions.length,
                  itemBuilder: (ctx, i) {
                    final sub = _submissions[i];
                    return ListTile(
                      leading: const Icon(Icons.verified_user),
                      title: Text(sub['businessName']?.toString() ?? 'Merchant'),
                      subtitle: Text(sub['status']?.toString() ?? 'pending'),
                      trailing: const Icon(Icons.chevron_right),
                    );
                  },
                ),
    );
  }
}
