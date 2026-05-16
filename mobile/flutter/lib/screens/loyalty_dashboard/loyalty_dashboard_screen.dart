import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

enum LoyaltyStatus {
  active,
  inactive,
  suspended,
}

class LoyaltyProgram {
  final String id;
  final String name;
  final String description;
  final LoyaltyStatus status;
  final double rewardRate;
  final String currency;
  final DateTime createdAt;

  LoyaltyProgram({
    required this.id,
    required this.name,
    required this.description,
    required this.status,
    required this.rewardRate,
    required this.currency,
    required this.createdAt,
  });

  factory LoyaltyProgram.fromJson(Map<String, dynamic> json) {
    return LoyaltyProgram(
      id: json['id'],
      name: json['name'],
      description: json['description'],
      status: LoyaltyStatus.values.firstWhere(
          (e) => e.toString().split('.').last == json['status']),
      rewardRate: (json['rewardRate'] as num).toDouble(),
      currency: json['currency'],
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}

final loyaltyProgramsProvider =
    FutureProvider.family<List<LoyaltyProgram>, String>((ref, searchTerm) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/loyalty.list', params: {'search': searchTerm});
  return (response['programs'] as List)
      .map((e) => LoyaltyProgram.fromJson(e))
      .toList();
});

class LoyaltyDashboardScreen extends ConsumerStatefulWidget {
  const LoyaltyDashboardScreen({super.key});

  @override
  ConsumerState<LoyaltyDashboardScreen> createState() =>
      _LoyaltyDashboardScreenState();
}

class _LoyaltyDashboardScreenState
    extends ConsumerState<LoyaltyDashboardScreen> {
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

  Future<void> _refreshPrograms() async {
    ref.invalidate(loyaltyProgramsProvider(_searchTerm));
    await ref.read(loyaltyProgramsProvider(_searchTerm).future);
  }

  @override
  Widget build(BuildContext context) {
    final loyaltyProgramsAsyncValue =
        ref.watch(loyaltyProgramsProvider(_searchTerm));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('Loyalty Dashboard', style: TextStyle(color: Color(0xFFf1f5f9))), 
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search loyalty programs...', 
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF1e293b),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshPrograms,
              color: const Color(0xFF6366f1),
              child: loyaltyProgramsAsyncValue.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
                ),
                data: (programs) {
                  if (programs.isEmpty) {
                    return const Center(
                      child: Text('No loyalty programs found.',
                          style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }
                  return ListView.builder(
                    itemCount: programs.length,
                    itemBuilder: (context, index) {
                      final program = programs[index];
                      return Card(
                        color: const Color(0xFF1e293b),
                        margin: const EdgeInsets.symmetric(
                            vertical: 4.0, horizontal: 8.0),
                        child: ListTile(
                          title: Text(program.name,
                              style: const TextStyle(
                                  color: Color(0xFFf1f5f9),
                                  fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(program.description,
                                  style: const TextStyle(
                                      color: Color(0xFFf1f5f9)
                                          .withOpacity(0.8))),
                              const SizedBox(height: 4),
                              _buildStatusBadge(program.status),
                              Text(
                                  'Reward Rate: ${program.currency == 'NGN' ? '₦' : '$'}${program.rewardRate.toStringAsFixed(2)}',
                                  style: const TextStyle(
                                      color: Color(0xFFf1f5f9)
                                          .withOpacity(0.8))),
                              Text(
                                  'Created: ${program.createdAt.toLocal().toString().split(' ')[0]}',
                                  style: const TextStyle(
                                      color: Color(0xFFf1f5f9)
                                          .withOpacity(0.8))),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _editProgram(context, program),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _deleteProgram(context, program.id),
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
      floatingActionButton: FloatingActionButton(
        onPressed: () => _createProgram(context),
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Widget _buildStatusBadge(LoyaltyStatus status) {
    Color color;
    String text;
    switch (status) {
      case LoyaltyStatus.active:
        color = Colors.green;
        text = 'Active';
        break;
      case LoyaltyStatus.inactive:
        color = Colors.orange;
        text = 'Inactive';
        break;
      case LoyaltyStatus.suspended:
        color = Colors.red;
        text = 'Suspended';
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(text, style: TextStyle(color: color, fontSize: 12)),
    );
  }

  void _createProgram(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        final TextEditingController nameController = TextEditingController();
        final TextEditingController descController = TextEditingController();
        final TextEditingController rateController = TextEditingController();
        String? selectedCurrency = 'USD';
        LoyaltyStatus? selectedStatus = LoyaltyStatus.active;

        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create Loyalty Program', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: InputDecoration(
                    labelText: 'Program Name', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: descController,
                  decoration: InputDecoration(
                    labelText: 'Description', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: rateController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Reward Rate', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: ['USD', 'NGN']
                      .map((currency) => DropdownMenuItem(value: currency, child: Text(currency)))
                      .toList(),
                  onChanged: (value) {
                    selectedCurrency = value;
                  },
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<LoyaltyStatus>(
                  value: selectedStatus,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Status', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: LoyaltyStatus.values
                      .map((status) => DropdownMenuItem(value: status, child: Text(status.toString().split('.').last)))
                      .toList(),
                  onChanged: (value) {
                    selectedStatus = value;
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), 
            ),
            ElevatedButton(
              onPressed: () async {
                // Simulate API call
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/loyalty.create', body: {
                    'name': nameController.text,
                    'description': descController.text,
                    'rewardRate': double.parse(rateController.text),
                    'currency': selectedCurrency,
                    'status': selectedStatus?.toString().split('.').last,
                  });
                  _refreshPrograms();
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  // Handle error
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create program: $e', style: const TextStyle(color: Color(0xFFf1f5f9))), backgroundColor: Colors.redAccent),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))), 
            ),
          ],
        );
      },
    );
  }

  void _editProgram(BuildContext context, LoyaltyProgram program) {
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        final TextEditingController nameController = TextEditingController(text: program.name);
        final TextEditingController descController = TextEditingController(text: program.description);
        final TextEditingController rateController = TextEditingController(text: program.rewardRate.toString());
        String? selectedCurrency = program.currency;
        LoyaltyStatus? selectedStatus = program.status;

        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Loyalty Program', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: InputDecoration(
                    labelText: 'Program Name', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: descController,
                  decoration: InputDecoration(
                    labelText: 'Description', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: rateController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Reward Rate', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: ['USD', 'NGN']
                      .map((currency) => DropdownMenuItem(value: currency, child: Text(currency)))
                      .toList(),
                  onChanged: (value) {
                    selectedCurrency = value;
                  },
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<LoyaltyStatus>(
                  value: selectedStatus,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Status', 
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1).withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: LoyaltyStatus.values
                      .map((status) => DropdownMenuItem(value: status, child: Text(status.toString().split('.').last)))
                      .toList(),
                  onChanged: (value) {
                    selectedStatus = value;
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), 
            ),
            ElevatedButton(
              onPressed: () async {
                // Simulate API call
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/loyalty.update', body: {
                    'id': program.id,
                    'name': nameController.text,
                    'description': descController.text,
                    'rewardRate': double.parse(rateController.text),
                    'currency': selectedCurrency,
                    'status': selectedStatus?.toString().split('.').last,
                  });
                  _refreshPrograms();
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  // Handle error
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update program: $e', style: const TextStyle(color: Color(0xFFf1f5f9))), backgroundColor: Colors.redAccent),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Save', style: TextStyle(color: Color(0xFFf1f5f9))), 
            ),
          ],
        );
      },
    );
  }

  void _deleteProgram(BuildContext context, String programId) {
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Deletion', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this loyalty program?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), 
            ),
            ElevatedButton(
              onPressed: () async {
                // Simulate API call
                final api = ref.read(apiServiceProvider);
                try {
                  await api.post('/trpc/loyalty.delete', body: {'id': programId});
                  _refreshPrograms();
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  // Handle error
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete program: $e', style: const TextStyle(color: Color(0xFFf1f5f9))), backgroundColor: Colors.redAccent),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))), 
            ),
          ],
        );
      },
    );
  }
}