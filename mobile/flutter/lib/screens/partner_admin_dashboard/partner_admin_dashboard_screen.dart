import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart'; // For date formatting
import '../../services/api_service.dart';

// Assuming a data model for a Partner
class Partner {
  final String id;
  final String name;
  final String status;
  final double balance;
  final DateTime createdAt;

  Partner({
    required this.id,
    required this.name,
    required this.status,
    required this.balance,
    required this.createdAt,
  });

  factory Partner.fromJson(Map<String, dynamic> json) {
    return Partner(
      id: json['id'] as String,
      name: json['name'] as String,
      status: json['status'] as String,
      balance: (json['balance'] as num).toDouble(),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

// Assuming a data model for the dashboard
class DashboardData {
  final String message;
  final double totalRevenue;
  final int activePartnersCount;
  final List<Partner> partners;

  DashboardData({
    required this.message,
    required this.totalRevenue,
    required this.activePartnersCount,
    required this.partners,
  });

  factory DashboardData.fromJson(Map<String, dynamic> json) {
    return DashboardData(
      message: json['message'] as String,
      totalRevenue: (json['totalRevenue'] as num).toDouble(),
      activePartnersCount: json['activePartnersCount'] as int,
      partners: (json['partners'] as List)
          .map((e) => Partner.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

// Provider for fetching dashboard data
final partnerAdminDashboardProvider = FutureProvider<DashboardData>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    // Simulate API call for dashboard data
    final response = await api.get('/trpc/partnerAdmin.dashboardData');
    return DashboardData.fromJson(response as Map<String, dynamic>);
  } catch (e) {
    throw Exception('Failed to load dashboard data: $e');
  }
});

class PartnerAdminDashboardScreen extends ConsumerStatefulWidget {
  const PartnerAdminDashboardScreen({super.key});

  @override
  ConsumerState<PartnerAdminDashboardScreen> createState() => _PartnerAdminDashboardScreenState();
}

class _PartnerAdminDashboardScreenState extends ConsumerState<PartnerAdminDashboardScreen> {
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  Future<void> _refreshData() async {
    ref.invalidate(partnerAdminDashboardProvider);
  }

  // Helper to format currency
  String _formatCurrency(double amount, {String currencySymbol = '₦'}) {
    final formatter = NumberFormat.currency(locale: 'en_NG', symbol: currencySymbol, decimalDigits: 2);
    return formatter.format(amount);
  }

  // Helper to format date
  String _formatDate(DateTime date) {
    return DateFormat('MMM dd, yyyy').format(date);
  }

  // Helper for status badge color
  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'suspended':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  // Placeholder for Create Partner dialog
  void _showCreatePartnerDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Create New Partner', style: TextStyle(color: _textColor)),
          content: Text('Form for creating a new partner goes here.', style: TextStyle(color: _textColor.withOpacity(0.8))),
          actions: <Widget>[
            TextButton(
              child: Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            TextButton(
              child: Text('Create', style: TextStyle(color: _accentColor)),
              onPressed: () {
                // Implement create logic here
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  // Placeholder for Edit Partner dialog
  void _showEditPartnerDialog(Partner partner) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Edit Partner: ${partner.name}', style: TextStyle(color: _textColor)),
          content: Text('Form for editing partner ${partner.name} goes here.', style: TextStyle(color: _textColor.withOpacity(0.8))),
          actions: <Widget>[
            TextButton(
              child: Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            TextButton(
              child: Text('Save', style: TextStyle(color: _accentColor)),
              onPressed: () {
                // Implement edit logic here
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  // Placeholder for Delete Partner confirmation
  void _showDeletePartnerConfirmation(Partner partner) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Delete Partner', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete partner ${partner.name}?', style: TextStyle(color: _textColor.withOpacity(0.8))),
          actions: <Widget>[
            TextButton(
              child: Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            TextButton(
              child: Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                // Implement delete logic here
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final dashboardDataAsync = ref.watch(partnerAdminDashboardProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text(
          'Partner Admin Dashboard',
          style: TextStyle(color: _textColor),
        ),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _textColor),
            onPressed: _showCreatePartnerDialog,
            tooltip: 'Add New Partner',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        color: _accentColor,
        child: dashboardDataAsync.when(
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (error, stack) => Center(
            child: Text(
              'Error: $error',
              style: const TextStyle(color: Colors.redAccent),
            ),
          ),
          data: (data) {
            if (data.partners.isEmpty) {
              return Center(
                child: Text(
                  'No partners found. Click + to add one.',
                  style: TextStyle(color: _textColor.withOpacity(0.7)),
                ),
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16.0),
              children: [
                // Dashboard Summary Cards
                Card(
                  color: _cardColor,
                  margin: const EdgeInsets.only(bottom: 16.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Welcome, Admin!',
                          style: TextStyle(color: _textColor, fontSize: 24, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8.0),
                        Text(
                          data.message,
                          style: TextStyle(color: _textColor.withOpacity(0.8), fontSize: 16),
                        ),
                      ],
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: Card(
                        color: _cardColor,
                        margin: const EdgeInsets.only(right: 8.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Total Revenue',
                                style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 16),
                              ),
                              const SizedBox(height: 4.0),
                              Text(
                                _formatCurrency(data.totalRevenue),
                                style: TextStyle(color: _textColor, fontSize: 28, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: Card(
                        color: _cardColor,
                        margin: const EdgeInsets.only(left: 8.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Active Partners',
                                style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 16),
                              ),
                              const SizedBox(height: 4.0),
                              Text(
                                data.activePartnersCount.toString(),
                                style: TextStyle(color: _textColor, fontSize: 28, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20.0),
                Text(
                  'Manage Partners',
                  style: TextStyle(color: _textColor, fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 10.0),
                // Search and Filter (Placeholder)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16.0),
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'Search partners...',
                      hintStyle: TextStyle(color: _textColor.withOpacity(0.6)),
                      prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.6)),
                      filled: true,
                      fillColor: _cardColor,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8.0),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    style: TextStyle(color: _textColor),
                    onChanged: (value) {
                      // Implement search logic here
                    },
                  ),
                ),
                // Partners List
                ...data.partners.map((partner) => Card(
                  color: _cardColor,
                  margin: const EdgeInsets.only(bottom: 10.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              partner.name,
                              style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                              decoration: BoxDecoration(
                                color: _getStatusColor(partner.status),
                                borderRadius: BorderRadius.circular(5.0),
                              ),
                              child: Text(
                                partner.status.toUpperCase(),
                                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 5.0),
                        Text(
                          'Balance: ${_formatCurrency(partner.balance)}',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        Text(
                          'Joined: ${_formatDate(partner.createdAt)}',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        const SizedBox(height: 10.0),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: Icon(Icons.edit, color: _accentColor),
                              onPressed: () => _showEditPartnerDialog(partner),
                              tooltip: 'Edit Partner',
                            ),
                            IconButton(
                              icon: Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _showDeletePartnerConfirmation(partner),
                              tooltip: 'Delete Partner',
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                )).toList(),
              ],
            );
          },
        ),
      ),
    );
  }
}
