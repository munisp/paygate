import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class NIPBanksScreen extends ConsumerStatefulWidget {
  const NIPBanksScreen({super.key});

  @override
  ConsumerState<NIPBanksScreen> createState() => _NIPBanksScreenState();
}

import 'dart:convert';

// Data Model for NIP Bank
class NIPBank {
  final String id;
  final String name;
  final String code;
  final bool isActive;
  final DateTime createdAt;

  NIPBank({
    required this.id,
    required this.name,
    required this.code,
    required this.isActive,
    required this.createdAt,
  });

  factory NIPBank.fromJson(Map<String, dynamic> json) {
    return NIPBank(
      id: json['id'],
      name: json['name'],
      code: json['code'],
      isActive: json['isActive'],
      createdAt: DateTime.parse(json['createdAt']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'code': code,
        'isActive': isActive,
        'createdAt': createdAt.toIso8601String(),
      };
}

// Riverpod provider for fetching NIP Banks
final nipBanksProvider = FutureProvider.family<List<NIPBank>, String?>((ref, searchTerm) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get(
    '/trpc/nipBanks.list',
    params: searchTerm != null && searchTerm.isNotEmpty ? {'search': searchTerm} : {},
  );
  final data = json.decode(response.body);
  if (data['result']['data']['json'] is List) {
    return (data['result']['data']['json'] as List)
        .map((e) => NIPBank.fromJson(e as Map<String, dynamic>))
        .toList();
  } else {
    // Handle cases where the data might be nested differently
    // Assuming the actual list is under a key like 'nipBanks' or similar
    final List<dynamic> nipBanksJson = data['result']['data']['json']['nipBanks'] ?? [];
    return nipBanksJson.map((e) => NIPBank.fromJson(e as Map<String, dynamic>)).toList();
  }
});

class _NIPBanksScreenState extends ConsumerState<NIPBanksScreen> {
  final TextEditingController _searchController = TextEditingController();
  String? _searchTerm;

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

  // Function to show a SnackBar message
  void _showSnackBar(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
      ),
    );
  }

  // Function to handle bank creation
  Future<void> _createBank(String name, String code) async {
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.post(
        '/trpc/nipBanks.create',
        body: {'name': name, 'code': code, 'isActive': true},
      );
      final data = json.decode(response.body);
      if (data['result']['data']['json'] != null) {
        _showSnackBar('Bank created successfully!');
        ref.invalidate(nipBanksProvider);
      } else {
        _showSnackBar('Failed to create bank: ${data['error']['message']}', isError: true);
      }
    } catch (e) {
      _showSnackBar('Error creating bank: $e', isError: true);
    }
  }

  // Function to handle bank update
  Future<void> _updateBank(String id, String name, String code, bool isActive) async {
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.post(
        '/trpc/nipBanks.update',
        body: {'id': id, 'name': name, 'code': code, 'isActive': isActive},
      );
      final data = json.decode(response.body);
      if (data['result']['data']['json'] != null) {
        _showSnackBar('Bank updated successfully!');
        ref.invalidate(nipBanksProvider);
      } else {
        _showSnackBar('Failed to update bank: ${data['error']['message']}', isError: true);
      }
    } catch (e) {
      _showSnackBar('Error updating bank: $e', isError: true);
    }
  }

  // Function to handle bank deletion
  Future<void> _deleteBank(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.post(
        '/trpc/nipBanks.delete',
        body: {'id': id},
      );
      final data = json.decode(response.body);
      if (data['result']['data']['json'] != null) {
        _showSnackBar('Bank deleted successfully!');
        ref.invalidate(nipBanksProvider);
      } else {
        _showSnackBar('Failed to delete bank: ${data['error']['message']}', isError: true);
      }
    } catch (e) {
      _showSnackBar('Error deleting bank: $e', isError: true);
    }
  }

  // Dialog for creating/editing a bank
  void _showBankFormDialog({NIPBank? bank}) {
    final isEditing = bank != null;
    final nameController = TextEditingController(text: bank?.name);
    final codeController = TextEditingController(text: bank?.code);
    bool isActive = bank?.isActive ?? true;

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text(isEditing ? 'Edit Bank' : 'Create Bank', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Bank Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFF6366f1)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFF6366f1)),
                  ),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: codeController,
                decoration: const InputDecoration(
                  labelText: 'Bank Code',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFF6366f1)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFF6366f1)),
                  ),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              if (isEditing) ...[
                const SizedBox(height: 16),
                StatefulBuilder(
                  builder: (BuildContext context, StateSetter setState) {
                    return CheckboxListTile(
                      title: const Text('Is Active', style: TextStyle(color: Color(0xFFf1f5f9))),
                      value: isActive,
                      onChanged: (bool? value) {
                        setState(() {
                          isActive = value ?? false;
                        });
                      },
                      activeColor: const Color(0xFF6366f1),
                      checkColor: const Color(0xFFf1f5f9),
                    );
                  },
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                if (isEditing) {
                  _updateBank(bank!.id, nameController.text, codeController.text, isActive);
                } else {
                  _createBank(nameController.text, codeController.text);
                }
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: Text(isEditing ? 'Update' : 'Create', style: const TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  // Dialog for delete confirmation
  void _showDeleteConfirmationDialog(NIPBank bank) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete Bank', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete ${bank.name}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                _deleteBank(bank.id);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final nipBanksAsyncValue = ref.watch(nipBanksProvider(_searchTerm));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'NIP Banks',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Light text
        ),
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showBankFormDialog(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(nipBanksProvider(_searchTerm).future),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search NIP Banks...', 
                  hintStyle: const TextStyle(color: Color(0xFF94a3b8)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFF94a3b8)),
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
              child: nipBanksAsyncValue.when(
                data: (banks) {
                  if (banks.isEmpty) {
                    return const Center(
                      child: Text(
                        'No NIP Banks found.',
                        style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 18),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: banks.length,
                    itemBuilder: (context, index) {
                      final bank = banks[index];
                      return Card(
                        color: const Color(0xFF1e293b),
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(bank.name, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Code: ${bank.code}', style: const TextStyle(color: Color(0xFFcbd5e1))),
                              Text('Status: ${bank.isActive ? 'Active' : 'Inactive'}', style: TextStyle(color: bank.isActive ? Colors.greenAccent : Colors.redAccent)),
                              Text('Created: ${bank.createdAt.toLocal().toIso8601String().split('T')[0]}', style: const TextStyle(color: Color(0xFFcbd5e1))),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _showBankFormDialog(bank: bank),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(bank),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(
                  child: Text('Error: ${err.toString()}', style: const TextStyle(color: Colors.redAccent)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}