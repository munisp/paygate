import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class BulkCollectionsScreen extends ConsumerStatefulWidget {
  const BulkCollectionsScreen({super.key});

  @override
  ConsumerState<BulkCollectionsScreen> createState() => _BulkCollectionsScreenState();
}

class _BulkCollectionsScreenState extends ConsumerState<BulkCollectionsScreen> {
  Future<List<dynamic>>? _bulkCollectionsFuture;
  String _searchQuery = '';

  final _backgroundColor = const Color(0xFF0f172a);
  final _cardColor = const Color(0xFF1e293b);
  final _textColor = const Color(0xFFf1f5f9);
  final _accentColor = const Color(0xFF6366f1);

  @override
  void initState() {
    super.initState();
    _fetchBulkCollections();
  }

  Future<void> _fetchBulkCollections() async {
    setState(() {
      _bulkCollectionsFuture = ref.read(apiServiceProvider).get('/trpc/bulkCollections.list').then((response) {
        return response['result']['data']['json'];
      });
    });
  }

  Future<void> _deleteBulkCollection(String id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text('Confirm Delete', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete this bulk collection?', style: TextStyle(color: _textColor)),
          backgroundColor: _cardColor,
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text('Cancel', style: TextStyle(color: _accentColor)),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text('Delete', style: TextStyle(color: Colors.red)),
            ),
          ],
        );
      },
    );

    if (confirm == true) {
      try {
        await ref.read(apiServiceProvider).post('/trpc/bulkCollections.delete', body: {'id': id});
        _fetchBulkCollections(); // Refresh list
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Bulk collection deleted successfully!', style: TextStyle(color: _textColor)), backgroundColor: _accentColor),
        );
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete bulk collection: $e', style: TextStyle(color: _textColor)), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _showCreateEditDialog({Map<String, dynamic>? collection}) async {
    final isEditing = collection != null;
    final nameController = TextEditingController(text: collection?['name']);
    final amountController = TextEditingController(text: collection?['amount'] != null ? (collection!['amount'] / 100).toString() : '');
    String? selectedCurrency = collection?['currency'] ?? 'NGN';

    await showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text(isEditing ? 'Edit Bulk Collection' : 'Create Bulk Collection', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: InputDecoration(
                    labelText: 'Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: _cardColor,
                  style: TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: <String>['NGN', 'USD'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value, style: TextStyle(color: _textColor)),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    setState(() {
                      selectedCurrency = newValue;
                    });
                  },
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text('Cancel', style: TextStyle(color: _accentColor)),
            ),
            TextButton(
              onPressed: () async {
                final name = nameController.text;
                final amount = (double.tryParse(amountController.text) ?? 0) * 100; // Convert to kobo/cents
                final currency = selectedCurrency;

                if (name.isEmpty || amount <= 0 || currency == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Please fill all fields correctly.', style: TextStyle(color: _textColor)), backgroundColor: Colors.red),
                  );
                  return;
                }

                try {
                  if (isEditing) {
                    await ref.read(apiServiceProvider).post('/trpc/bulkCollections.update', body: {
                      'id': collection!['id'],
                      'name': name,
                      'amount': amount,
                      'currency': currency,
                    });
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Bulk collection updated successfully!', style: TextStyle(color: _textColor)), backgroundColor: _accentColor),
                    );
                  } else {
                    await ref.read(apiServiceProvider).post('/trpc/bulkCollections.create', body: {
                      'name': name,
                      'amount': amount,
                      'currency': currency,
                    });
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Bulk collection created successfully!', style: TextStyle(color: _textColor)), backgroundColor: _accentColor),
                    );
                  }
                  _fetchBulkCollections(); // Refresh list
                  Navigator.of(context).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to save bulk collection: $e', style: TextStyle(color: _textColor)), backgroundColor: Colors.red),
                  );
                }
              },
              child: Text(isEditing ? 'Save' : 'Create', style: TextStyle(color: _accentColor)),
            ),
          ],
        );
      },
    );
  }

  String _formatAmount(int amount, String currency) {
    final symbol = currency == 'NGN' ? '₦' : '$';
    return '$symbol${(amount / 100).toStringAsFixed(2)}';
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status) {
      case 'Completed':
        color = Colors.green;
        break;
      case 'Pending':
        color = Colors.orange;
        break;
      case 'Failed':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: Text('Bulk Collections', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        actions: [
          IconButton(
            icon: Icon(Icons.add, color: _textColor),
            onPressed: () => _showCreateEditDialog(),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              style: TextStyle(color: _textColor),
              decoration: InputDecoration(
                hintText: 'Search bulk collections...', 
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide(color: _accentColor),
                ),
              ),
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _fetchBulkCollections,
              color: _accentColor,
              backgroundColor: _cardColor,
              child: FutureBuilder<List<dynamic>>(
                future: _bulkCollectionsFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return Center(child: CircularProgressIndicator(color: _accentColor));
                  } else if (snapshot.hasError) {
                    return Center(child: Text('Error: ${snapshot.error}', style: TextStyle(color: Colors.red)));
                  } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
                    return Center(child: Text('No bulk collections found.', style: TextStyle(color: _textColor)));
                  } else {
                    final filteredCollections = snapshot.data!.where((collection) {
                      final nameLower = collection['name'].toLowerCase();
                      final queryLower = _searchQuery.toLowerCase();
                      return nameLower.contains(queryLower);
                    }).toList();

                    if (filteredCollections.isEmpty) {
                      return Center(child: Text('No matching bulk collections found.', style: TextStyle(color: _textColor)));
                    }

                    return ListView.builder(
                      itemCount: filteredCollections.length,
                      itemBuilder: (context, index) {
                        final collection = filteredCollections[index];
                        final dateTime = DateTime.parse(collection['date']);
                        final formattedDate = '${dateTime.day}/${dateTime.month}/${dateTime.year} ${dateTime.hour}:${dateTime.minute}';

                        return Card(
                          color: _cardColor,
                          margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          child: ListTile(
                            title: Text(collection['name'], style: TextStyle(color: _textColor, fontWeight: FontWeight.bold)),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(_formatAmount(collection['amount'], collection['currency']), style: TextStyle(color: _textColor.withOpacity(0.8))),
                                Text('Date: $formattedDate', style: TextStyle(color: _textColor.withOpacity(0.6), fontSize: 12)),
                                const SizedBox(height: 4),
                                _buildStatusBadge(collection['status']),
                              ],
                            ),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: Icon(Icons.edit, color: _accentColor),
                                  onPressed: () => _showCreateEditDialog(collection: collection),
                                ),
                                IconButton(
                                  icon: Icon(Icons.delete, color: Colors.red),
                                  onPressed: () => _deleteBulkCollection(collection['id']),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    );
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
