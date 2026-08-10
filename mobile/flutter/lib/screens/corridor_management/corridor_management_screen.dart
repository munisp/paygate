import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class CorridorManagementScreen extends ConsumerStatefulWidget {
  const CorridorManagementScreen({super.key});

  @override
  ConsumerState<CorridorManagementScreen> createState() => _CorridorManagementScreenState();
}

class _CorridorManagementScreenState extends ConsumerState<CorridorManagementScreen> {
  List<dynamic> _corridors = [];
  List<dynamic> _filteredCorridors = [];
  bool _isLoading = true;
  String? _error;
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchCorridors();
    _searchController.addListener(_filterCorridors);
  }

  @override
  void dispose() {
    _searchController.removeListener(_filterCorridors);
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchCorridors() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      // Simulate API call for listing corridors
      // In a real app, you might pass search/filter parameters to the API
      final response = await ref.read(apiServiceProvider).get('/trpc/corridor.list');
      _corridors = response.data as List<dynamic>;
      _filterCorridors(); // Apply initial filter after fetching
    } catch (e) {
      _error = e.toString();
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _filterCorridors() {
    final query = _searchController.text.toLowerCase();
    setState(() {
      _filteredCorridors = _corridors.where((corridor) {
        return corridor['name'].toLowerCase().contains(query) ||
               corridor['status'].toLowerCase().contains(query);
      }).toList();
    });
  }

  Future<void> _createCorridor(Map<String, dynamic> newCorridor) async {
    try {
      // Assuming the API returns the created corridor or a success message
      await ref.read(apiServiceProvider).post('/trpc/corridor.create', body: newCorridor);
      await _fetchCorridors(); // Refresh list after creation
    } catch (e) {
      // Handle error, e.g., show a SnackBar
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error creating corridor: $e', style: const TextStyle(color: Color(0xFFf1f5f9)))),
        );
      }
    }
  }

  Future<void> _updateCorridor(String id, Map<String, dynamic> updatedCorridor) async {
    try {
      // Assuming the API returns the updated corridor or a success message
      await ref.read(apiServiceProvider).post('/trpc/corridor.update', body: {'id': id, ...updatedCorridor});
      await _fetchCorridors(); // Refresh list after update
    } catch (e) {
      // Handle error
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error updating corridor: $e', style: const TextStyle(color: Color(0xFFf1f5f9)))),
        );
      }
    }
  }

  Future<void> _deleteCorridor(String id) async {
    try {
      // Assuming the API returns a success message
      await ref.read(apiServiceProvider).post('/trpc/corridor.delete', body: {'id': id});
      await _fetchCorridors(); // Refresh list after deletion
    } catch (e) {
      // Handle error
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error deleting corridor: $e', style: const TextStyle(color: Color(0xFFf1f5f9)))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Corridor Management', style: TextStyle(color: Color(0xFFf1f5f9))), // Light text
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search corridors...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF0f172a), // Darker background for search bar
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchCorridors,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))) // Accent color for spinner
            : _error != null
                ? Center(child: Text('Error: $_error', style: const TextStyle(color: Colors.red))) // Error state
                : _filteredCorridors.isEmpty
                    ? Center(child: Text(
                        _searchController.text.isEmpty ? 'No corridors found.' : 'No matching corridors found.',
                        style: const TextStyle(color: Color(0xFFf1f5f9)),
                      )) // Empty state with search context
                    : ListView.builder(
                        itemCount: _filteredCorridors.length,
                        itemBuilder: (context, index) {
                          final corridor = _filteredCorridors[index];
                          return Card(
                            color: const Color(0xFF1e293b), // Card background
                            margin: const EdgeInsets.all(8.0),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Name: ${corridor['name']}', style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 18, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 8),
                                  Text('Status: ${corridor['status']}', style: TextStyle(color: _getStatusColor(corridor['status']))),
                                  const SizedBox(height: 8),
                                  Text('Amount: ${formatAmount(corridor['amount'], corridor['currency'])}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                                  const SizedBox(height: 8),
                                  Text('Created: ${formatDate(corridor['createdAt'])}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      IconButton(
                                        icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                        onPressed: () => _showEditCorridorDialog(corridor),
                                      ),
                                      IconButton(
                                        icon: const Icon(Icons.delete, color: Colors.redAccent),
                                        onPressed: () => _confirmDeleteCorridor(corridor['id'] as String),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateCorridorDialog,
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'inactive':
        return Colors.orange;
      case 'suspended':
        return Colors.red;
      default:
        return const Color(0xFFf1f5f9);
    }
  }

  String formatAmount(dynamic amount, String currency) {
    if (amount == null) return '';
    String symbol = currency.toUpperCase() == 'NGN' ? '₦' : '$'; // Naira or USD
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String formatDate(String? dateString) {
    if (dateString == null || dateString.isEmpty) return '';
    try {
      final dateTime = DateTime.parse(dateString);
      return '${dateTime.day.toString().padLeft(2, '0')}/${dateTime.month.toString().padLeft(2, '0')}/${dateTime.year}';
    } catch (e) {
      return dateString; // Return original if parsing fails
    }
  }

  void _showCreateCorridorDialog() {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController amountController = TextEditingController();
    final TextEditingController currencyController = TextEditingController(text: 'USD');
    final TextEditingController statusController = TextEditingController(text: 'active');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Create New Corridor', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Corridor Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: amountController,
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                keyboardType: TextInputType.number,
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: currencyController,
                decoration: const InputDecoration(
                  labelText: 'Currency (e.g., USD, NGN)',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: statusController,
                decoration: const InputDecoration(
                  labelText: 'Status (e.g., active, inactive)',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
          ElevatedButton(
            onPressed: () {
              _createCorridor({
                'id': DateTime.now().millisecondsSinceEpoch.toString(), // Unique ID for new corridor
                'name': nameController.text,
                'amount': double.tryParse(amountController.text) ?? 0.0,
                'currency': currencyController.text,
                'status': statusController.text,
                'createdAt': DateTime.now().toIso8601String(), // Example date
              });
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  void _showEditCorridorDialog(Map<String, dynamic> corridor) {
    final TextEditingController nameController = TextEditingController(text: corridor['name']);
    final TextEditingController amountController = TextEditingController(text: corridor['amount'].toString());
    final TextEditingController currencyController = TextEditingController(text: corridor['currency']);
    final TextEditingController statusController = TextEditingController(text: corridor['status']);

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Edit Corridor', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Corridor Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: amountController,
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                keyboardType: TextInputType.number,
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: currencyController,
                decoration: const InputDecoration(
                  labelText: 'Currency (e.g., USD, NGN)',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: statusController,
                decoration: const InputDecoration(
                  labelText: 'Status (e.g., active, inactive)',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
          ElevatedButton(
            onPressed: () {
              _updateCorridor(corridor['id'] as String, {
                'name': nameController.text,
                'amount': double.tryParse(amountController.text) ?? 0.0,
                'currency': currencyController.text,
                'status': statusController.text,
              });
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: const Text('Update', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  void _confirmDeleteCorridor(String id) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: const Text('Are you sure you want to delete this corridor?', style: TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
          ElevatedButton(
            onPressed: () {
              _deleteCorridor(id);
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }
}