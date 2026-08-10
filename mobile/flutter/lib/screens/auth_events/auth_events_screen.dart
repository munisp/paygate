import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class AuthEventsScreen extends ConsumerStatefulWidget {
  const AuthEventsScreen({super.key});

  @override
  ConsumerState<AuthEventsScreen> createState() => _AuthEventsScreenState();
}

class _AuthEventsScreenState extends ConsumerState<AuthEventsScreen> {
  late Future<List<AuthEvent>> _authEventsFuture;

  @override
  void initState() {
    super.initState();
    _fetchAuthEvents();
  }

  Future<void> _fetchAuthEvents() async {
    setState(() {
      _authEventsFuture = ref.read(apiServiceProvider).get('/trpc/authEvents.list');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('Auth Events', style: TextStyle(color: Color(0xFFf1f5f9))), 
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchAuthEvents,
        child: FutureBuilder<List<AuthEvent>>(
          future: _authEventsFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1)));
            } else if (snapshot.hasError) {
              return Center(
                child: Text('Error: ${snapshot.error}', style: const TextStyle(color: Color(0xFFf1f5f9))),
              );
            } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
              return const Center(
                child: Text('No authentication events found.', style: TextStyle(color: Color(0xFFf1f5f9))),
              );
            } else {
              final authEvents = snapshot.data!;
              return ListView.builder(
                itemCount: authEvents.length,
                itemBuilder: (context, index) {
                  final event = authEvents[index];
                  return Card(
                    color: const Color(0xFF1e293b),
                    margin: const EdgeInsets.all(8.0),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Event ID: ${event.id}', style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          Text('User: ${event.userId}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                          const SizedBox(height: 4),
                          Text('Type: ${event.type}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                          const SizedBox(height: 4),
                          Text('Status: ${event.status}', style: TextStyle(color: _getStatusColor(event.status))), // Business logic: status badges
                          const SizedBox(height: 4),
                          Text('Timestamp: ${_formatDate(event.timestamp)}', style: const TextStyle(color: Color(0xFFf1f5f9))), // Business logic: date formatting
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _showEditDialog(event), // CRUD: Edit
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmation(event), // CRUD: Delete
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
        onPressed: _showCreateDialog, // CRUD: Create
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'success':
        return Colors.green;
      case 'failed':
        return Colors.red;
      case 'pending':
        return Colors.orange;
      default:
        return const Color(0xFFf1f5f9);
    }
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute}';
  }

  void _showCreateDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Create Auth Event', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: const Text('Create form goes here', style: TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          TextButton(
            onPressed: () {
              // Implement create logic here
              Navigator.pop(context);
            },
            child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(AuthEvent event) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: Text('Edit Auth Event ${event.id}', style: const TextStyle(color: Color(0xFFf1f5f9))),
        content: const Text('Edit form goes here', style: TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          TextButton(
            onPressed: () {
              // Implement edit logic here
              Navigator.pop(context);
            },
            child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmation(AuthEvent event) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Delete Auth Event', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: Text('Are you sure you want to delete event ${event.id}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          TextButton(
            onPressed: () {
              // Implement delete logic here
              Navigator.pop(context);
            },
            child: const Text('Delete', style: TextStyle(color: Colors.redAccent))),
        ],
      ),
    );
  }
}

// Dummy AuthEvent model for demonstration
class AuthEvent {
  final String id;
  final String userId;
  final String type;
  final String status;
  final DateTime timestamp;

  AuthEvent({
    required this.id,
    required this.userId,
    required this.type,
    required this.status,
    required this.timestamp,
  });

  // Factory constructor to parse from tRPC response (assuming a simple map structure)
  factory AuthEvent.fromJson(Map<String, dynamic> json) {
    return AuthEvent(
      id: json['id'] as String,
      userId: json['userId'] as String,
      type: json['type'] as String,
      status: json['status'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
    );
  }
}
