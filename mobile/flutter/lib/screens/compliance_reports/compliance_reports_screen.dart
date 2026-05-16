import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

class ComplianceReportsScreen extends ConsumerStatefulWidget {
  const ComplianceReportsScreen({super.key});

  @override
  ConsumerState<ComplianceReportsScreen> createState() => _ComplianceReportsScreenState();
}

class _ComplianceReportsScreenState extends ConsumerState<ComplianceReportsScreen> {
  Future<List<dynamic>>? _reportsFuture;
  String _searchQuery = '';
  String? _selectedStatusFilter;

  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchReports();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetchReports() async {
    setState(() {
      _reportsFuture = ref.read(apiServiceProvider).get(
        '/trpc/compliance.listReports',
        params: {
          'search': _searchQuery,
          'status': _selectedStatusFilter,
        },
      );
    });
  }

  Future<void> _createReport(Map<String, dynamic> newReportData) async {
    try {
      await ref.read(apiServiceProvider).post(
        '/trpc/compliance.createReport',
        body: newReportData,
      );
      _fetchReports(); // Refresh list after creation
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Report created successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create report: $e')),
        );
      }
    }
  }

  Future<void> _updateReport(String reportId, Map<String, dynamic> updatedReportData) async {
    try {
      await ref.read(apiServiceProvider).post(
        '/trpc/compliance.updateReport',
        body: {'id': reportId, ...updatedReportData},
      );
      _fetchReports(); // Refresh list after update
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Report updated successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update report: $e')),
        );
      }
    }
  }

  Future<void> _deleteReport(String reportId) async {
    try {
      await ref.read(apiServiceProvider).post(
        '/trpc/compliance.deleteReport',
        body: {'id': reportId},
      );
      _fetchReports(); // Refresh list after deletion
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Report deleted successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete report: $e')),
        );
      }
    }
  }

  void _showCreateEditDialog({Map<String, dynamic>? report}) {
    final isEditing = report != null;
    final TextEditingController idController = TextEditingController(text: report?['id']);
    final TextEditingController statusController = TextEditingController(text: report?['status']);
    final TextEditingController dateController = TextEditingController(text: report?['date']);
    final TextEditingController amountController = TextEditingController(text: report?['amount']?.toString());

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text(isEditing ? 'Edit Report' : 'Create New Report', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isEditing) TextField(
                  controller: idController,
                  readOnly: true,
                  decoration: const InputDecoration(
                    labelText: 'Report ID',
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
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: dateController,
                  decoration: const InputDecoration(
                    labelText: 'Date (YYYY-MM-DD)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number, // Assuming amount is numeric
                  decoration: const InputDecoration(
                    labelText: 'Amount',
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
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                final newReportData = {
                  'status': statusController.text,
                  'date': dateController.text,
                  'amount': double.tryParse(amountController.text) ?? 0.0,
                };
                if (isEditing) {
                  _updateReport(report!['id'], newReportData);
                } else {
                  _createReport(newReportData);
                }
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(String reportId) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete Report', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this report?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                _deleteReport(reportId);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'approved':
        badgeColor = Colors.green;
        break;
      case 'pending':
        badgeColor = Colors.orange;
        break;
      case 'rejected':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  String _formatAmount(double amount, {String currency = '₦'}) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency, decimalDigits: 2);
    return format.format(amount);
  }

  String _formatDate(String dateString) {
    try {
      final dateTime = DateTime.parse(dateString);
      return DateFormat('MMM dd, yyyy').format(dateTime);
    } catch (e) {
      return dateString; // Return original if parsing fails
    }
  }

  @override
  Widget build(BuildContext context) {
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: const Text('Compliance Reports', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(100.0), // Height for search and filter
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  onChanged: (value) {
                    setState(() {
                      _searchQuery = value;
                    });
                    _fetchReports();
                  },
                  decoration: InputDecoration(
                    hintText: 'Search reports...',
                    hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    prefixIcon: Icon(Icons.search, color: textColor.withOpacity(0.7)),
                    filled: true,
                    fillColor: cardColor,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  style: const TextStyle(color: textColor),
                ),
                const SizedBox(height: 8.0),
                DropdownButtonFormField<String>(
                  value: _selectedStatusFilter,
                  decoration: InputDecoration(
                    hintText: 'Filter by status',
                    hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                    filled: true,
                    fillColor: cardColor,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  dropdownColor: cardColor,
                  style: const TextStyle(color: textColor),
                  items: <String>['Approved', 'Pending', 'Rejected', 'All']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value == 'All' ? null : value.toLowerCase(),
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    setState(() {
                      _selectedStatusFilter = newValue;
                    });
                    _fetchReports();
                  },
                ),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchReports,
        color: accentColor,
        child: FutureBuilder<List<dynamic>>(
          future: _reportsFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return Center(child: CircularProgressIndicator(color: accentColor));
            } else if (snapshot.hasError) {
              return Center(
                child: Text(
                  'Error: ${snapshot.error}',
                  style: const TextStyle(color: textColor),
                ),
              );
            } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
              return Center(
                child: Text(
                  'No compliance reports found.',
                  style: const TextStyle(color: textColor),
                ),
              );
            } else {
              final reports = snapshot.data!;
              return ListView.builder(
                itemCount: reports.length,
                itemBuilder: (context, index) {
                  final report = reports[index];
                  return Card(
                    color: cardColor,
                    margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Report ID: ${report['id'] ?? 'N/A'}', style: const TextStyle(color: textColor, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Text('Status: ', style: TextStyle(color: textColor)),
                              _buildStatusBadge(report['status'] ?? 'Unknown'),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text('Date: ${_formatDate(report['date'] ?? '')}', style: const TextStyle(color: textColor)),
                          const SizedBox(height: 4),
                          Text('Amount: ${_formatAmount(report['amount'] ?? 0.0, currency: report['currency'] ?? '₦')}', style: const TextStyle(color: textColor)),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: accentColor),
                                onPressed: () => _showCreateEditDialog(report: report),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(report['id']),
                              ),
                            ],
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
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: accentColor,
        child: const Icon(Icons.add, color: textColor),
      ),
    );
  }
}
