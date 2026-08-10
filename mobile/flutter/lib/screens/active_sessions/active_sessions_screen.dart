
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart'; // For date formatting
import '../../services/api_service.dart';

// Placeholder for ActiveSession model
class ActiveSession {
  final String id;
  final String device;
  final String location;
  final DateTime lastActive;

  ActiveSession({
    required this.id,
    required this.device,
    required this.location,
    required this.lastActive,
  });

  factory ActiveSession.fromJson(Map<String, dynamic> json) {
    return ActiveSession(
      id: json['id'],
      device: json['device'],
      location: json['location'],
      lastActive: DateTime.parse(json['lastActive']),
    );
  }
}

// Provider for fetching active sessions
final activeSessionsProvider = FutureProvider<List<ActiveSession>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/activeSessions.list'); // Assuming 'activeSessions.list' is the tRPC procedure
    if (response is Map && response.containsKey('result') && response['result'] is Map && response['result'].containsKey('data')) {
      final List<dynamic> data = response['result']['data'];
      return data.map((json) => ActiveSession.fromJson(json)).toList();
    } else if (response is List) {
      return response.map((json) => ActiveSession.fromJson(json)).toList();
    } else {
      throw Exception('Invalid API response format');
    }
  } catch (e) {
    rethrow;
  }
});

// Provider for search query
final searchQueryProvider = StateProvider<String>((ref) => '');

class ActiveSessionsScreen extends ConsumerStatefulWidget {
  const ActiveSessionsScreen({super.key});

  @override
  ConsumerState<ActiveSessionsScreen> createState() => _ActiveSessionsScreenState();
}

class _ActiveSessionsScreenState extends ConsumerState<ActiveSessionsScreen> {
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  Future<void> _refreshSessions() async {
    ref.invalidate(activeSessionsProvider);
    await ref.read(activeSessionsProvider.future);
  }

  Future<void> _revokeSession(String sessionId) async {
    final api = ref.read(apiServiceProvider);
    try {
      // Assuming 'activeSessions.revoke' is the tRPC mutation
      await api.post('/trpc/activeSessions.revoke', body: {'id': sessionId});
      _refreshSessions(); // Refresh the list after revoking
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Session revoked successfully.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to revoke session: $e')),
        );
      }
    }
  }

  void _confirmRevoke(BuildContext context, ActiveSession session) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Confirm Revocation', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to revoke the session on ${session.device}?', style: const TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                _revokeSession(session.id);
              },
              child: const Text('Revoke', style: TextStyle(color: Colors.red)),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeSessionsAsyncValue = ref.watch(activeSessionsProvider);
    final searchQuery = ref.watch(searchQueryProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Active Sessions', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              onChanged: (query) => ref.read(searchQueryProvider.notifier).state = query,
              style: const TextStyle(color: _textColor),
              decoration: InputDecoration(
                hintText: 'Search sessions by device or location...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: _textColor),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshSessions,
              child: activeSessionsAsyncValue.when(
                data: (sessions) {
                  final filteredSessions = sessions.where((session) {
                    final lowerCaseQuery = searchQuery.toLowerCase();
                    return session.device.toLowerCase().contains(lowerCaseQuery) ||
                           session.location.toLowerCase().contains(lowerCaseQuery);
                  }).toList();

                  if (filteredSessions.isEmpty) {
                    return Center(
                      child: Text(
                        searchQuery.isEmpty ? 'No active sessions found.' : 'No matching sessions found.',
                        style: TextStyle(color: _textColor),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: filteredSessions.length,
                    itemBuilder: (context, index) {
                      final session = filteredSessions[index];
                      final formattedDate = DateFormat('MMM dd, yyyy HH:mm').format(session.lastActive.toLocal());
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.all(8.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Device: ${session.device}', style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold)),
                              Text('Location: ${session.location}', style: const TextStyle(color: _textColor)),
                              Text('Last Active: $formattedDate', style: const TextStyle(color: _textColor)),
                              Align(
                                alignment: Alignment.bottomRight,
                                child: ElevatedButton(
                                  onPressed: () => _confirmRevoke(context, session),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.red,
                                    foregroundColor: _textColor,
                                  ),
                                  child: const Text('Revoke'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
                error: (error, stack) => Center(
                  child: Text(
                    'Error: $error',
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
