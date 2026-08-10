import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class StaffManagementScreen extends StatefulWidget {
  const StaffManagementScreen({super.key});
  @override
  State<StaffManagementScreen> createState() => _StaffManagementScreenState();
}

class _StaffManagementScreenState extends StatefulWidget with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<dynamic> _members = [];
  List<dynamic> _shifts = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final membersResp = await http.get(
        Uri.parse('/api/trpc/staffMgmt.listMembers?input=%7B%22page%22%3A1%7D'),
        headers: {'Content-Type': 'application/json'},
      );
      final shiftsResp = await http.get(
        Uri.parse('/api/trpc/staffMgmt.listShifts?input=%7B%22page%22%3A1%7D'),
        headers: {'Content-Type': 'application/json'},
      );
      if (membersResp.statusCode == 200) {
        final data = json.decode(membersResp.body);
        _members = data['result']?['data']?['members'] ?? [];
      }
      if (shiftsResp.statusCode == 200) {
        final data = json.decode(shiftsResp.body);
        _shifts = data['result']?['data']?['shifts'] ?? [];
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Staff Management'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [Tab(text: 'Members'), Tab(text: 'Shifts')],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadData),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildMembersList(),
                    _buildShiftsList(),
                  ],
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddMemberDialog(context),
        child: const Icon(Icons.person_add),
      ),
    );
  }

  Widget _buildMembersList() {
    if (_members.isEmpty) {
      return const Center(child: Text('No staff members found'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _members.length,
      itemBuilder: (ctx, i) {
        final m = _members[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: CircleAvatar(child: Text((m['name'] ?? '?')[0].toUpperCase())),
            title: Text(m['name'] ?? 'Unknown'),
            subtitle: Text('${m['role'] ?? 'Staff'} · ${m['department'] ?? ''}'),
            trailing: Chip(
              label: Text(m['status'] ?? 'active'),
              backgroundColor: m['status'] == 'active' ? Colors.green[100] : Colors.grey[200],
            ),
          ),
        );
      },
    );
  }

  Widget _buildShiftsList() {
    if (_shifts.isEmpty) {
      return const Center(child: Text('No shifts found'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _shifts.length,
      itemBuilder: (ctx, i) {
        final s = _shifts[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: const Icon(Icons.schedule),
            title: Text(s['staffMemberId'] ?? 'Staff'),
            subtitle: Text('Clock In: ${s['clockIn'] ?? 'N/A'} · Out: ${s['clockOut'] ?? 'Ongoing'}'),
            trailing: Chip(
              label: Text(s['status'] ?? 'active'),
              backgroundColor: s['status'] == 'completed' ? Colors.blue[100] : Colors.orange[100],
            ),
          ),
        );
      },
    );
  }

  void _showAddMemberDialog(BuildContext context) {
    final nameCtrl = TextEditingController();
    final roleCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Staff Member'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: 8),
            TextField(controller: roleCtrl, decoration: const InputDecoration(labelText: 'Role')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () { Navigator.pop(ctx); _loadData(); },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }
}
