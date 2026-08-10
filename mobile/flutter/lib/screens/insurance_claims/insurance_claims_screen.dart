import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class InsuranceClaimsScreen extends StatefulWidget {
  const InsuranceClaimsScreen({super.key});
  @override
  State<InsuranceClaimsScreen> createState() => _InsuranceClaimsScreenState();
}

class _InsuranceClaimsScreenState extends State<InsuranceClaimsScreen> {
  List<dynamic> _claims = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _loadClaims(); }

  Future<void> _loadClaims() async {
    try {
    setState(() => _loading = true);
    try {
      final resp = await http.get(Uri.parse('/api/trpc/insuranceClaims.list?input=%7B%22page%22%3A1%7D'));
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body);
        setState(() { _claims = data['result']?['data']?['claims'] ?? []; });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(\'Error loading data\'), backgroundColor: Colors.red),
        );
      }
    }
  }
    } finally { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Insurance Claims'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _loadClaims)]),
      body: _loading ? const Center(child: CircularProgressIndicator()) :
        _claims.isEmpty ? const Center(child: Text('No claims found')) :
        ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _claims.length,
          itemBuilder: (ctx, i) {
            final c = _claims[i];
            return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
              leading: const Icon(Icons.health_and_safety),
              title: Text(c['claimNumber'] ?? c['id'] ?? 'Claim'),
              subtitle: Text('${c['claimType'] ?? 'Insurance'} · ₦${c['claimAmount'] ?? 0}'),
              trailing: Chip(label: Text(c['status'] ?? 'pending'),
                backgroundColor: c['status'] == 'approved' ? Colors.green[100] : Colors.orange[100]),
            ));
          },
        ),
      floatingActionButton: FloatingActionButton(onPressed: () {}, child: const Icon(Icons.add)),
    );
  }
}
