import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define a data model for notification preferences
class NotificationPreference {
  final String id;
  final String name;
  bool enabled;

  NotificationPreference({required this.id, required this.name, this.enabled = false});

  factory NotificationPreference.fromJson(Map<String, dynamic> json) {
    return NotificationPreference(
      id: json['id'],
      name: json['name'],
      enabled: json['enabled'] ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'enabled': enabled,
  };
}

// State for notification preferences
final notificationPreferencesProvider = StateNotifierProvider<NotificationPreferencesNotifier, AsyncValue<List<NotificationPreference>>>((ref) {
  return NotificationPreferencesNotifier(ref.read(apiServiceProvider));
});

class NotificationPreferencesNotifier extends StateNotifier<AsyncValue<List<NotificationPreference>>> {
  final ApiService _apiService;

  NotificationPreferencesNotifier(this._apiService) : super(const AsyncValue.loading()) {
    fetchPreferences();
  }

  Future<void> fetchPreferences() async {
    state = const AsyncValue.loading();
    try {
      final response = await _apiService.get('/trpc/merchantNotificationPreferences.list');
      final List<NotificationPreference> preferences = (response['data'] as List)
          .map((e) => NotificationPreference.fromJson(e))
          .toList();
      state = AsyncValue.data(preferences);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> updatePreference(String id, bool enabled) async {
    final currentPreferences = state.value;
    if (currentPreferences == null) return;

    // Optimistically update the UI
    state = AsyncValue.data(
      currentPreferences.map((pref) => pref.id == id ? NotificationPreference(id: pref.id, name: pref.name, enabled: enabled) : pref).toList(),
    );

    try {
      await _apiService.post('/trpc/merchantNotificationPreferences.update', body: {'id': id, 'enabled': enabled});
      // Optionally, re-fetch preferences to ensure consistency with backend
      // fetchPreferences();
    } catch (e, st) {
      // Revert state on error
      state = AsyncValue.data(currentPreferences); // Revert to previous state
      rethrow; // Re-throw to be caught by the UI for showing a snackbar
    }
  }
}

class MerchantNotificationPreferencesScreen extends ConsumerStatefulWidget {
  const MerchantNotificationPreferencesScreen({super.key});

  @override
  ConsumerState<MerchantNotificationPreferencesScreen> createState() => _MerchantNotificationPreferencesScreenState();
}

class _MerchantNotificationPreferencesScreenState extends ConsumerState<MerchantNotificationPreferencesScreen> {
  final Color _backgroundColor = const Color(0xFF0f172a);
  final Color _cardColor = const Color(0xFF1e293b);
  final Color _textColor = const Color(0xFFf1f5f9);
  final Color _accentColor = const Color(0xFF6366f1);

  @override
  Widget build(BuildContext context) {
    final preferencesAsyncValue = ref.watch(notificationPreferencesProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: Text(
          'Notification Preferences',
          style: TextStyle(color: _textColor),
        ),
        backgroundColor: _cardColor,
        iconTheme: IconThemeData(color: _textColor), // For back button
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(notificationPreferencesProvider.notifier).fetchPreferences(),
        color: _accentColor,
        child: preferencesAsyncValue.when(
          loading: () => Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Text(
              'Error: ${err.toString()}',
              style: TextStyle(color: _textColor),
            ),
          ),
          data: (preferences) {
            if (preferences.isEmpty) {
              return Center(
                child: Text(
                  'No notification preferences found.',
                  style: TextStyle(color: _textColor),
                ),
              );
            }
            return ListView.builder(
              itemCount: preferences.length,
              itemBuilder: (context, index) {
                final preference = preferences[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          preference.name,
                          style: TextStyle(color: _textColor, fontSize: 16.0),
                        ),
                        Switch(
                          value: preference.enabled,
                          onChanged: (bool value) async {
                            try {
                              await ref.read(notificationPreferencesProvider.notifier).updatePreference(preference.id, value);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('${preference.name} updated successfully.'),
                                  backgroundColor: Colors.green,
                                ),
                              );
                            } catch (e) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('Failed to update ${preference.name}: ${e.toString()}'),
                                  backgroundColor: Colors.red,
                                ),
                              );
                            }
                          },
                          activeColor: _accentColor,
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
    );
  }
}
