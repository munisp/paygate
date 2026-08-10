import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define custom colors for the dark theme
const Color _darkBackgroundColor = Color(0xFF0f172a);
const Color _darkCardColor = Color(0xFF1e293b);
const Color _darkTextColor = Color(0xFFf1f5f9);
const Color _darkAccentColor = Color(0xFF6366f1);

// Dummy data model for a support ticket
class SupportTicket {
  final String id;
  final String subject;
  final String description;
  final String status;
  final String assignedTo;
  final DateTime createdAt;
  final double amount;

  SupportTicket({
    required this.id,
    required this.subject,
    required this.description,
    required this.status,
    required this.assignedTo,
    required this.createdAt,
    required this.amount,
  });

  factory SupportTicket.fromJson(Map<String, dynamic> json) {
    return SupportTicket(
      id: json['id'],
      subject: json['subject'],
      description: json['description'],
      status: json['status'],
      assignedTo: json['assignedTo'],
      createdAt: DateTime.parse(json['createdAt']),
      amount: (json['amount'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'subject': subject,
        'description': description,
        'status': status,
        'assignedTo': assignedTo,
        'createdAt': createdAt.toIso8601String(),
        'amount': amount,
      };

  SupportTicket copyWith({
    String? id,
    String? subject,
    String? description,
    String? status,
    String? assignedTo,
    DateTime? createdAt,
    double? amount,
  }) {
    return SupportTicket(
      id: id ?? this.id,
      subject: subject ?? this.subject,
      description: description ?? this.description,
      status: status ?? this.status,
      assignedTo: assignedTo ?? this.assignedTo,
      createdAt: createdAt ?? this.createdAt,
      amount: amount ?? this.amount,
    );
  }
}

// State notifier for managing support tickets
class SupportAdminNotifier extends StateNotifier<AsyncValue<List<SupportTicket>>> {
  final ApiService _apiService;

  SupportAdminNotifier(this._apiService) : super(const AsyncValue.loading()) {
    fetchTickets();
  }

  Future<void> fetchTickets({String? query}) async {
    state = const AsyncValue.loading();
    try {
      final response = await _apiService.get('/trpc/support.admin.list', params: {'query': query});
      final List<SupportTicket> tickets = (response['tickets'] as List)
          .map((e) => SupportTicket.fromJson(e as Map<String, dynamic>))
          .toList();
      state = AsyncValue.data(tickets);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> createTicket(SupportTicket ticket) async {
    try {
      await _apiService.post('/trpc/support.admin.create', body: ticket.toJson());
      await fetchTickets(); // Refresh list after creation
    } catch (e, st) {
      // Handle error, e.g., show a snackbar
      debugPrint('Error creating ticket: $e');
    }
  }

  Future<void> updateTicket(SupportTicket ticket) async {
    try {
      await _apiService.post('/trpc/support.admin.update', body: ticket.toJson());
      await fetchTickets(); // Refresh list after update
    } catch (e, st) {
      debugPrint('Error updating ticket: $e');
    }
  }

  Future<void> deleteTicket(String id) async {
    try {
      await _apiService.post('/trpc/support.admin.delete', body: {'id': id});
      await fetchTickets(); // Refresh list after deletion
    } catch (e, st) {
      debugPrint('Error deleting ticket: $e');
    }
  }
}

final supportAdminProvider = StateNotifierProvider<SupportAdminNotifier, AsyncValue<List<SupportTicket>>>((ref) {
  return SupportAdminNotifier(ref.read(apiServiceProvider));
});

class SupportAdminScreen extends ConsumerStatefulWidget {
  const SupportAdminScreen({super.key});

  @override
  ConsumerState<SupportAdminScreen> createState() => _SupportAdminScreenState();
}

class _SupportAdminScreenState extends ConsumerState<SupportAdminScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(supportAdminProvider.notifier).fetchTickets(query: _searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshTickets() async {
    await ref.read(supportAdminProvider.notifier).fetchTickets();
  }

  String _formatAmount(double amount) {
    // Assuming Naira for now, can be extended for USD
    return '₦${amount.toStringAsFixed(2)}';
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'open':
        color = Colors.green;
        break;
      case 'pending':
        color = Colors.orange;
        break;
      case 'closed':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
    }
    return Chip(
      label: Text(status, style: const TextStyle(color: Colors.white)),
      backgroundColor: color,
    );
  }

  Future<void> _showCreateEditDialog({SupportTicket? ticket}) async {
    final isEditing = ticket != null;
    final TextEditingController subjectController = TextEditingController(text: ticket?.subject);
    final TextEditingController descriptionController = TextEditingController(text: ticket?.description);
    final TextEditingController assignedToController = TextEditingController(text: ticket?.assignedTo);
    String? selectedStatus = ticket?.status;

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _darkCardColor,
          title: Text(isEditing ? 'Edit Ticket' : 'Create New Ticket', style: const TextStyle(color: _darkTextColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: subjectController,
                  decoration: const InputDecoration(
                    labelText: 'Subject',
                    labelStyle: TextStyle(color: _darkTextColor),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkTextColor)),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkAccentColor)),
                  ),
                  style: const TextStyle(color: _darkTextColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: descriptionController,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    labelStyle: TextStyle(color: _darkTextColor),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkTextColor)),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkAccentColor)),
                  ),
                  style: const TextStyle(color: _darkTextColor),
                  maxLines: 3,
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: assignedToController,
                  decoration: const InputDecoration(
                    labelText: 'Assigned To',
                    labelStyle: TextStyle(color: _darkTextColor),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkTextColor)),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkAccentColor)),
                  ),
                  style: const TextStyle(color: _darkTextColor),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: _darkCardColor,
                  style: const TextStyle(color: _darkTextColor),
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: _darkTextColor),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkTextColor)),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _darkAccentColor)),
                  ),
                  items: <String>['Open', 'Pending', 'Closed'].map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedStatus = newValue;
                  },
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _darkTextColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: _darkAccentColor),
              onPressed: () {
                if (subjectController.text.isNotEmpty &&
                    descriptionController.text.isNotEmpty &&
                    assignedToController.text.isNotEmpty &&
                    selectedStatus != null) {
                  final newTicket = SupportTicket(
                    id: isEditing ? ticket!.id : DateTime.now().millisecondsSinceEpoch.toString(),
                    subject: subjectController.text,
                    description: descriptionController.text,
                    status: selectedStatus!,
                    assignedTo: assignedToController.text,
                    createdAt: isEditing ? ticket!.createdAt : DateTime.now(),
                    amount: isEditing ? ticket!.amount : 0.0, // Placeholder amount
                  );
                  if (isEditing) {
                    ref.read(supportAdminProvider.notifier).updateTicket(newTicket);
                  } else {
                    ref.read(supportAdminProvider.notifier).createTicket(newTicket);
                  }
                  Navigator.of(dialogContext).pop();
                }
              },
              child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Colors.white)),
            ),
          ],
        );
      },
    );
  }

  Future<void> _showDeleteConfirmationDialog(String ticketId) async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _darkCardColor,
          title: const Text('Confirm Deletion', style: TextStyle(color: _darkTextColor)),
          content: const Text('Are you sure you want to delete this ticket?', style: TextStyle(color: _darkTextColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _darkTextColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () {
                ref.read(supportAdminProvider.notifier).deleteTicket(ticketId);
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Delete', style: TextStyle(color: Colors.white)),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<SupportTicket>> ticketsAsyncValue = ref.watch(supportAdminProvider);

    return Scaffold(
      backgroundColor: _darkBackgroundColor,
      appBar: AppBar(
        title: const Text('Support Admin', style: TextStyle(color: _darkTextColor)),
        backgroundColor: _darkCardColor,
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _darkTextColor),
            onPressed: () => _showCreateEditDialog(),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                labelText: 'Search Tickets',
                labelStyle: const TextStyle(color: _darkTextColor),
                prefixIcon: const Icon(Icons.search, color: _darkTextColor),
                border: const OutlineInputBorder(),
                enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _darkTextColor)),
                focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _darkAccentColor)),
              ),
              style: const TextStyle(color: _darkTextColor),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshTickets,
              color: _darkAccentColor,
              child: ticketsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: _darkAccentColor)),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
                ),
                data: (tickets) {
                  if (tickets.isEmpty) {
                    return const Center(
                      child: Text('No support tickets found.', style: TextStyle(color: _darkTextColor)),
                    );
                  }
                  return ListView.builder(
                    itemCount: tickets.length,
                    itemBuilder: (context, index) {
                      final ticket = tickets[index];
                      return Card(
                        color: _darkCardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                ticket.subject,
                                style: const TextStyle(
                                  color: _darkTextColor,
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 5),
                              Text(
                                'Description: ${ticket.description}',
                                style: const TextStyle(color: _darkTextColor),
                              ),
                              const SizedBox(height: 5),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  _buildStatusBadge(ticket.status),
                                  Text(
                                    'Assigned To: ${ticket.assignedTo}',
                                    style: const TextStyle(color: _darkTextColor),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 5),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Created: ${ticket.createdAt.toLocal().toString().split(' ')[0]}',
                                    style: const TextStyle(color: _darkTextColor),
                                  ),
                                  Text(
                                    'Amount: ${_formatAmount(ticket.amount)}',
                                    style: const TextStyle(color: _darkTextColor),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.edit, color: _darkAccentColor),
                                    onPressed: () => _showCreateEditDialog(ticket: ticket),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete, color: Colors.redAccent),
                                    onPressed: () => _showDeleteConfirmationDialog(ticket.id),
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
              ),
            ),
          ),
        ],
      ),
    );
  }
}
