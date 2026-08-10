import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../services/api_service.dart';

class PSPManagementScreen extends StatefulWidget {
  const PSPManagementScreen({super.key});
  @override
  State<PSPManagementScreen> createState() => _PSPManagementScreenState();
}

class _PSPManagementScreenState extends State<PSPManagementScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isLoading = false;
  List<Map<String, dynamic>> _velocityLimits = [];
  List<Map<String, dynamic>> _interchangeSchedules = [];
  List<Map<String, dynamic>> _schemeMemberships = [];
  List<Map<String, dynamic>> _strReports = [];
  List<Map<String, dynamic>> _cbnReports = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      await Future.wait([
        _fetchVelocityLimits(),
        _fetchInterchangeSchedules(),
        _fetchSchemeMemberships(),
        _fetchSTRReports(),
        _fetchCBNReports(),
      ]);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchVelocityLimits() async {
    final res = await http.get(Uri.parse('/api/trpc/velocityLimits.list?input={"page":1,"pageSize":20}'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      setState(() => _velocityLimits = List<Map<String, dynamic>>.from(data['result']?['data']?['limits'] ?? []));
    }
  }

  Future<void> _fetchInterchangeSchedules() async {
    final res = await http.get(Uri.parse('/api/trpc/interchange.getSchedule?input={}'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      setState(() => _interchangeSchedules = List<Map<String, dynamic>>.from(data['result']?['data']?['schedules'] ?? []));
    }
  }

  Future<void> _fetchSchemeMemberships() async {
    final res = await http.get(Uri.parse('/api/trpc/schemeMembership.list?input={}'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      setState(() => _schemeMemberships = List<Map<String, dynamic>>.from(data['result']?['data']?['memberships'] ?? []));
    }
  }

  Future<void> _fetchSTRReports() async {
    final res = await http.get(Uri.parse('/api/trpc/str.list?input={"page":1,"pageSize":20}'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      setState(() => _strReports = List<Map<String, dynamic>>.from(data['result']?['data']?['reports'] ?? []));
    }
  }

  Future<void> _fetchCBNReports() async {
    final res = await http.get(Uri.parse('/api/trpc/regulatoryReports.list?input={"page":1,"pageSize":20}'));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      setState(() => _cbnReports = List<Map<String, dynamic>>.from(data['result']?['data']?['reports'] ?? []));
    }
  }

  Future<void> _generateReport(String reportType) async {
    final body = jsonEncode({
      'reportType': reportType,
      'periodStart': DateTime.now().subtract(const Duration(days: 30)).toIso8601String(),
      'periodEnd': DateTime.now().toIso8601String(),
    });
    final res = await http.post(
      Uri.parse('/api/trpc/regulatoryReports.generate'),
      headers: {'Content-Type': 'application/json'},
      body: body,
    );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res.statusCode == 200 ? 'Report queued' : 'Error generating report')),
      );
    }
    await _fetchCBNReports();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('PSP Management', style: TextStyle(color: Colors.white)),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.grey,
          indicatorColor: const Color(0xFF3b82f6),
          tabs: const [
            Tab(text: 'Velocity'), Tab(text: 'Interchange'),
            Tab(text: 'Scheme'), Tab(text: 'STR'), Tab(text: 'CBN Reports'),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadData),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildVelocityTab(),
                _buildInterchangeTab(),
                _buildSchemeTab(),
                _buildSTRTab(),
                _buildCBNReportsTab(),
              ],
            ),
    );
  }

  Widget _buildVelocityTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Sub-Merchant Velocity Limits', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        if (_velocityLimits.isEmpty)
          const Center(child: Text('No velocity limits configured.', style: TextStyle(color: Colors.grey)))
        else
          ..._velocityLimits.map((limit) => _buildCard(
            title: limit['merchantId'] ?? '',
            subtitle: '${(limit['channel'] ?? '').toString().toUpperCase()} · ${limit['windowSeconds']}s · max ${limit['maxCount']} txns',
            status: limit['isActive'] == true ? 'Active' : 'Inactive',
            statusColor: limit['isActive'] == true ? Colors.green : Colors.grey,
          )),
      ],
    );
  }

  Widget _buildInterchangeTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Interchange Fee Schedule', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        if (_interchangeSchedules.isEmpty)
          const Center(child: Text('No interchange schedules.', style: TextStyle(color: Colors.grey)))
        else
          ..._interchangeSchedules.map((s) => _buildCard(
            title: '${s['network']} · ${s['cardType']}',
            subtitle: s['feeType'] == 'percentage' ? '${s['feeValue']}%' : '₦${((s['feeValue'] ?? 0) / 100).toStringAsFixed(2)} flat',
            status: s['rail'] ?? '',
            statusColor: Colors.blue,
          )),
      ],
    );
  }

  Widget _buildSchemeTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Scheme Membership', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        if (_schemeMemberships.isEmpty)
          const Center(child: Text('No scheme memberships.', style: TextStyle(color: Colors.grey)))
        else
          ..._schemeMemberships.map((m) => _buildCard(
            title: '${m['schemeName']} · ${m['membershipType']}',
            subtitle: 'BIN: ${m['binRangeStart']}–${m['binRangeEnd']}',
            status: m['status'] ?? '',
            statusColor: m['status'] == 'active' ? Colors.green : Colors.grey,
          )),
      ],
    );
  }

  Widget _buildSTRTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Suspicious Transaction Reports', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        Container(
          margin: const EdgeInsets.symmetric(vertical: 8),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: const Color(0xFF92400e), borderRadius: BorderRadius.circular(8)),
          child: const Text('⚠ CBN/NFIU requires STR submission within 24 hours', style: TextStyle(color: Colors.orange, fontSize: 12)),
        ),
        if (_strReports.isEmpty)
          const Center(child: Text('No STRs filed.', style: TextStyle(color: Colors.grey)))
        else
          ..._strReports.map((r) => _buildCard(
            title: 'STR-${(r['id'] ?? '').toString().substring(0, 8).toUpperCase()}',
            subtitle: '${r['suspiciousActivityType']} · ₦${((r['transactionAmountKobo'] ?? 0) / 100).toStringAsFixed(0)}',
            status: r['status'] ?? '',
            statusColor: r['status'] == 'submitted' ? Colors.green : Colors.orange,
          )),
      ],
    );
  }

  Widget _buildCBNReportsTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('CBN Regulatory Reports', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Row(
          children: ['form_a', 'form_b', 'form_c'].map((type) => Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: ElevatedButton(
                onPressed: () => _generateReport(type),
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1d4ed8)),
                child: Text(type.toUpperCase().replaceAll('_', ' '), style: const TextStyle(fontSize: 11)),
              ),
            ),
          )).toList(),
        ),
        const SizedBox(height: 12),
        ..._cbnReports.map((r) => _buildCard(
          title: (r['reportType'] ?? '').toString().toUpperCase().replaceAll('_', ' '),
          subtitle: r['reportingPeriod'] ?? '',
          status: r['status'] ?? '',
          statusColor: r['status'] == 'submitted' ? Colors.green : Colors.orange,
        )),
      ],
    );
  }

  Widget _buildCard({required String title, required String subtitle, required String status, required Color statusColor}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: const Color(0xFF1e293b), borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14)),
              const SizedBox(height: 4),
              Text(subtitle, style: const TextStyle(color: Color(0xFF94a3b8), fontSize: 12)),
            ],
          )),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: statusColor.withOpacity(0.2), borderRadius: BorderRadius.circular(10)),
            child: Text(status, style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}
