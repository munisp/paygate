import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class VendorsScreen extends ConsumerStatefulWidget {
  const VendorsScreen({super.key});

  @override
  ConsumerState<VendorsScreen> createState() => _VendorsScreenState();
}

class _VendorsScreenState extends ConsumerState<VendorsScreen> {
  // Dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  // State for data, loading, error
  AsyncValue<List<dynamic>> _vendors = const AsyncValue.loading();
  String _searchQuery = '';

  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _statusController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchVendors();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _statusController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _fetchVendors() async {
    setState(() {
      _vendors = const AsyncValue.loading();
    });
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.get('/trpc/vendors.list', params: {'query': _searchQuery});
      setState(() {
        _vendors = AsyncValue.data(response['data'] ?? []); // Ensure it's a list
      });
    } catch (e, st) {
      setState(() {
        _vendors = AsyncValue.error(e, st);
      });
    }
  }

  Future<void> _createVendor(Map<String, dynamic> newVendor) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/vendors.create', body: newVendor);
      _fetchVendors(); // Refresh list after creation
    } catch (e) {
      _showErrorSnackbar('Failed to create vendor: $e');
    }
  }

  Future<void> _updateVendor(String vendorId, Map<String, dynamic> updatedVendor) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/vendors.update', body: {'id': vendorId, ...updatedVendor});
      _fetchVendors(); // Refresh list after update
    } catch (e) {
      _showErrorSnackbar('Failed to update vendor: $e');
    }
  }

  Future<void> _deleteVendor(String vendorId) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/vendors.delete', body: {'id': vendorId});
      _fetchVendors(); // Refresh list after deletion
    } catch (e) {
      _showErrorSnackbar('Failed to delete vendor: $e');
    }
  }

  void _showErrorSnackbar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'active':
        badgeColor = Colors.green;
        break;
      case 'pending':
        badgeColor = Colors.orange;
        break;
      case 'inactive':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Vendors', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
                _fetchVendors();
              },
              style: const TextStyle(color: _textColor),
              decoration: InputDecoration(
                hintText: 'Search vendors...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchVendors,
        color: _accentColor,
        child: _vendors.when(
          data: (vendors) {
            if (vendors.isEmpty) {
              return const Center(
                child: Text(
                  'No vendors found.',
                  style: TextStyle(color: _textColor, fontSize: 18),
                ),
              );
            }
            return ListView.builder(
              itemCount: vendors.length,
              itemBuilder: (context, index) {
                final vendor = vendors[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          vendor['name'] ?? 'N/A',
                          style: const TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Text('Status: ', style: TextStyle(color: _textColor)),
                            _buildStatusBadge(vendor['status'] ?? 'Unknown'),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Amount: ${vendor['amount'] != null ? '₦${vendor['amount']}' : 'N/A'}' ,
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Created: ${vendor['createdAt'] != null ? DateTime.parse(vendor['createdAt']).toLocal().toString().split(' ')[0] : 'N/A'}',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: _accentColor),
                              onPressed: () => _showEditVendorDialog(context, vendor),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _showDeleteConfirmationDialog(context, vendor['id']),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Text(
              'Error: ${err.toString()}',
              style: const TextStyle(color: Colors.red, fontSize: 16),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateVendorDialog(context),
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: _textColor),
      ),
    );
  }

  void _showCreateVendorDialog(BuildContext context) {
    _nameController.clear();
    _statusController.clear();
    _amountController.clear();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Create Vendor', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: _nameController,
                  decoration: InputDecoration(
                    labelText: 'Vendor Name',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: _accentColor),
                    ),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _statusController,
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: _accentColor),
                    ),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _amountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: _accentColor),
                    ),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: _accentColor)),
              onPressed: () {
                _createVendor({
                  'name': _nameController.text,
                  'status': _statusController.text,
                  'amount': double.tryParse(_amountController.text) ?? 0.0,
                });
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditVendorDialog(BuildContext context, Map<String, dynamic> vendor) {
    _nameController.text = vendor['name'] ?? '';
    _statusController.text = vendor['status'] ?? '';
    _amountController.text = (vendor['amount'] ?? 0.0).toString();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Edit Vendor', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: _nameController,
                  decoration: InputDecoration(
                    labelText: 'Vendor Name',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: _accentColor),
                    ),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _statusController,
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: _accentColor),
                    ),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _amountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: _accentColor),
                    ),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: _accentColor)),
              onPressed: () {
                _updateVendor(vendor['id'], {
                  'name': _nameController.text,
                  'status': _statusController.text,
                  'amount': double.tryParse(_amountController.text) ?? 0.0,
                });
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, String vendorId) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Delete Vendor', style: TextStyle(color: _textColor)),
          content: const Text('Are you sure you want to delete this vendor?', style: TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                _deleteVendor(vendorId);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}