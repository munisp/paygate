import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class PartnerOnboardScreen extends ConsumerStatefulWidget {
  const PartnerOnboardScreen({super.key});

  @override
  ConsumerState<PartnerOnboardScreen> createState() => _PartnerOnboardScreenState();
}

class _PartnerOnboardScreenState extends ConsumerState<PartnerOnboardScreen> {
  // Define dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  // State variables
  bool _isLoading = true;
  String? _error;
  List<dynamic> _partners = []; // Placeholder for partner data
  String _searchQuery = '';
  String? _filterStatus;

  @override
  void initState() {
    super.initState();
    _fetchPartners();
  }

  Future<void> _fetchPartners() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      // TODO: Replace with actual tRPC API call for listing partners
      // final response = await ref.read(apiServiceProvider).get('/trpc/partnerOnboard.list', params: {});
      // _partners = response.data; // Assuming response.data is a list of partners
      await Future.delayed(const Duration(seconds: 2)); // Simulate network delay
      _partners = [
        {'id': '1', 'name': 'Partner A', 'status': 'active', 'amount': 125000.00, 'date': '2023-01-15'},
        {'id': '2', 'name': 'Partner B', 'status': 'pending', 'amount': 50000.00, 'date': '2023-02-20'},
        {'id': '3', 'name': 'Partner C', 'status': 'inactive', 'amount': 200000.00, 'date': '2023-03-10'},
        {'id': '4', 'name': 'Partner D', 'status': 'active', 'amount': 75000.00, 'date': '2023-04-01'},
        {'id': '5', 'name': 'Partner E', 'status': 'pending', 'amount': 30000.50, 'date': '2023-05-22'},
      ];
    } catch (e) {
      _error = 'Failed to load partners: ${e.toString()}';
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  List<dynamic> get _filteredPartners {
    List<dynamic> filtered = _partners.where((partner) {
      final nameMatches = partner['name'].toLowerCase().contains(_searchQuery.toLowerCase());
      final statusMatches = _filterStatus == null || partner['status'] == _filterStatus;
      return nameMatches && statusMatches;
    }).toList();
    return filtered;
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Filter by Status', style: TextStyle(color: _textColor)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              RadioListTile<String>(
                title: const Text('All', style: TextStyle(color: _textColor)),
                value: null,
                groupValue: _filterStatus,
                onChanged: (value) {
                  setState(() {
                    _filterStatus = value;
                  });
                  Navigator.of(context).pop();
                },
              ),
              RadioListTile<String>(
                title: const Text('Active', style: TextStyle(color: _textColor)),
                value: 'active',
                groupValue: _filterStatus,
                onChanged: (value) {
                  setState(() {
                    _filterStatus = value;
                  });
                  Navigator.of(context).pop();
                },
              ),
              RadioListTile<String>(
                title: const Text('Pending', style: TextStyle(color: _textColor)),
                value: 'pending',
                groupValue: _filterStatus,
                onChanged: (value) {
                  setState(() {
                    _filterStatus = value;
                  });
                  Navigator.of(context).pop();
                },
              ),
              RadioListTile<String>(
                title: const Text('Inactive', style: TextStyle(color: _textColor)),
                value: 'inactive',
                groupValue: _filterStatus,
                onChanged: (value) {
                  setState(() {
                    _filterStatus = value;
                  });
                  Navigator.of(context).pop();
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _createPartner(String name, String status) async {
    // TODO: Replace with actual tRPC API call for creating a partner
    // await ref.read(apiServiceProvider).post('/trpc/partnerOnboard.create', body: {'name': name, 'status': status});
    await Future.delayed(const Duration(seconds: 1));
    final newPartner = {
      'id': (_partners.length + 1).toString(),
      'name': name,
      'status': status,
      'amount': 0.00,
      'date': DateTime.now().toIso8601String().substring(0, 10),
    };
    setState(() {
      _partners.add(newPartner);
    });
  }

  Future<void> _editPartner(String id, String name, String status) async {
    // TODO: Replace with actual tRPC API call for updating a partner
    // await ref.read(apiServiceProvider).post('/trpc/partnerOnboard.update', body: {'id': id, 'name': name, 'status': status});
    await Future.delayed(const Duration(seconds: 1));
    setState(() {
      final index = _partners.indexWhere((partner) => partner['id'] == id);
      if (index != -1) {
        _partners[index]['name'] = name;
        _partners[index]['status'] = status;
      }
    });
  }

  Future<void> _deletePartner(String id) async {
    // TODO: Replace with actual tRPC API call for deleting a partner
    // await ref.read(apiServiceProvider).post('/trpc/partnerOnboard.delete', body: {'id': id});
    await Future.delayed(const Duration(seconds: 1));
    setState(() {
      _partners.removeWhere((partner) => partner['id'] == id);
    });
  }

  void _showCreatePartnerDialog() {
    final TextEditingController nameController = TextEditingController();
    String? selectedStatus = 'active';

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Create New Partner', style: TextStyle(color: _textColor)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Partner Name',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                  focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
              DropdownButtonFormField<String>(
                value: selectedStatus,
                dropdownColor: _cardColor,
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                  focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                items: <String>['active', 'pending', 'inactive'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value, style: const TextStyle(color: _textColor)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  if (newValue != null) {
                    selectedStatus = newValue;
                  }
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
            ),
            ElevatedButton(
              onPressed: () {
                if (nameController.text.isNotEmpty && selectedStatus != null) {
                  _createPartner(nameController.text, selectedStatus!);
                  Navigator.of(context).pop();
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
              child: const Text('Create', style: TextStyle(color: _textColor)),
            ),
          ],
        );
      },
    );
  }

  void _showEditPartnerDialog(Map<String, dynamic> partner) {
    final TextEditingController nameController = TextEditingController(text: partner['name']);
    String? selectedStatus = partner['status'];

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Edit Partner', style: TextStyle(color: _textColor)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Partner Name',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                  focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
              DropdownButtonFormField<String>(
                value: selectedStatus,
                dropdownColor: _cardColor,
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                  focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                items: <String>['active', 'pending', 'inactive'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value, style: const TextStyle(color: _textColor)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  if (newValue != null) {
                    selectedStatus = newValue;
                  }
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
            ),
            ElevatedButton(
              onPressed: () {
                if (nameController.text.isNotEmpty && selectedStatus != null) {
                  _editPartner(partner['id'], nameController.text, selectedStatus!);
                  Navigator.of(context).pop();
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
              child: const Text('Save', style: TextStyle(color: _textColor)),
            ),
          ],
        );
      },
    );
  }

  void _confirmDeletePartner(String id) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Confirm Delete', style: TextStyle(color: _textColor)),
          content: const Text('Are you sure you want to delete this partner?', style: TextStyle(color: _textColor)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
            ),
            ElevatedButton(
              onPressed: () {
                _deletePartner(id);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: _textColor)),
            ),
          ],
        );
      },
    );
  }

  // Helper to format amount
  String _formatAmount(double amount) {
    // TODO: Implement proper currency formatting based on user locale or specific requirements (e.g., Naira ₦ or USD $)
    return '\$${amount.toStringAsFixed(2)}'; // Currently defaults to USD
  }

  // Helper to format date
  String _formatDate(String dateString) {
    try {
      final dateTime = DateTime.parse(dateString);
      return '${dateTime.year}-${dateTime.month.toString().padLeft(2, '0')}-${dateTime.day.toString().padLeft(2, '0')}';
    } catch (e) {
      return dateString; // Return original if parsing fails
    }
  }

  // Helper to get status badge color
  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'inactive':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: TextField(
          onChanged: (value) {
            setState(() {
              _searchQuery = value;
            });
          },
          style: const TextStyle(color: _textColor),
          decoration: InputDecoration(
            hintText: 'Search partners...', 
            hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
            border: InputBorder.none,
          ),
        ),
        backgroundColor: _cardColor,
        foregroundColor: _textColor,
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterDialog,
          ),
        ],
      ),
      body: _buildBody(),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreatePartnerDialog,
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: _textColor),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: _accentColor));
    } else if (_error != null) {
      return Center(
        child: Text(
          _error!,
          style: const TextStyle(color: Colors.redAccent, fontSize: 16),
        ),
      );
    } else if (_filteredPartners.isEmpty) {
      return Center(
        child: Text(
          'No partners found matching your criteria.',
          style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 16),
        ),
      );
    } else {
      return RefreshIndicator(
        onRefresh: _fetchPartners,
        color: _accentColor,
        child: ListView.builder(
          itemCount: _filteredPartners.length,
          itemBuilder: (context, index) {
            final partner = _filteredPartners[index];
            return Card(
              color: _cardColor,
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      partner['name'],
                      style: const TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: _getStatusColor(partner['status']),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            partner['status'].toUpperCase(),
                            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Text(
                          'Amount: ${_formatAmount(partner['amount'])}',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Date: ${_formatDate(partner['date'])}',
                      style: TextStyle(color: _textColor.withOpacity(0.8)),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit, color: _accentColor),
                          onPressed: () => _showEditPartnerDialog(partner),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.redAccent),
                          onPressed: () => _confirmDeletePartner(partner['id']),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      );
    }
  }
}
