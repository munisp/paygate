import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../services/api_service.dart';

const _storage = FlutterSecureStorage();

class AuthState {
  final bool isAuthenticated;
  final Map<String, dynamic>? user;
  final String? error;

  const AuthState({
    this.isAuthenticated = false,
    this.user,
    this.error,
  });

  AuthState copyWith({bool? isAuthenticated, Map<String, dynamic>? user, String? error}) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      user: user ?? this.user,
      error: error,
    );
  }
}

class AuthNotifier extends AsyncNotifier<AuthState> {
  @override
  Future<AuthState> build() async {
    final token = await _storage.read(key: 'session_token');
    if (token == null) return const AuthState(isAuthenticated: false);

    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.getMe();
      final user = result['data'] as Map<String, dynamic>?;
      if (user != null) {
        return AuthState(isAuthenticated: true, user: user);
      }
    } catch (_) {
      await _storage.delete(key: 'session_token');
    }
    return const AuthState(isAuthenticated: false);
  }

  Future<void> loginWithToken(String token) async {
    await _storage.write(key: 'session_token', value: token);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final api = ref.read(apiServiceProvider);
      final result = await api.getMe();
      final user = result['data'] as Map<String, dynamic>?;
      return AuthState(isAuthenticated: user != null, user: user);
    });
  }

  Future<void> logout() async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.logout();
    } catch (_) {}
    await _storage.delete(key: 'session_token');
    state = const AsyncValue.data(AuthState(isAuthenticated: false));
  }
}

final authStateProvider = AsyncNotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

// Convenience selector
final currentUserProvider = Provider<Map<String, dynamic>?>((ref) {
  return ref.watch(authStateProvider).value?.user;
});
