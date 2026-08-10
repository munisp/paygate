/// BiometricGateScreen
///
/// Shown when the app returns to the foreground and requires the user to
/// re-authenticate biometrically before accessing protected routes.
///
/// This screen is pushed by the [AppNavigator._AuthGuard] when
/// `paygate_biometric_pending` is set to `'true'` in secure storage.
/// The flag is set by the app lifecycle observer when the app is backgrounded
/// for more than [_lockoutDurationSeconds] seconds.
library biometric_gate_screen;

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../services/biometric_token_service.dart';
import 'app_navigator.dart';

class BiometricGateScreen extends StatefulWidget {
  const BiometricGateScreen({super.key});

  @override
  State<BiometricGateScreen> createState() => _BiometricGateScreenState();
}

class _BiometricGateScreenState extends State<BiometricGateScreen> {
  static const _primaryColor = Color(0xFF6C63FF);
  static const _bgColor = Color(0xFF0A0A0F);
  static const _surfaceColor = Color(0xFF1A1A2E);

  final _biometricService = BiometricTokenService();
  final _secureStorage = const FlutterSecureStorage();

  bool _isAuthenticating = false;
  String? _errorMessage;
  int _failedAttempts = 0;
  static const _maxFailedAttempts = 3;

  @override
  void initState() {
    super.initState();
    // Auto-trigger biometric prompt on screen open
    WidgetsBinding.instance.addPostFrameCallback((_) => _authenticate());
  }

  Future<void> _authenticate() async {
    if (_isAuthenticating) return;
    setState(() {
      _isAuthenticating = true;
      _errorMessage = null;
    });

    final result = await _biometricService.authenticateAndGetToken(
      reason: 'Verify your identity to continue',
    );

    if (!mounted) return;

    if (result.success) {
      // Clear the biometric pending flag
      await _secureStorage.write(
          key: 'paygate_biometric_pending', value: 'false');

      // Navigate to the return route (or dashboard as fallback)
      final args = ModalRoute.of(context)?.settings.arguments;
      final returnRoute = (args is Map<String, dynamic>)
          ? (args['return_route'] as String? ?? AppRoutes.dashboard)
          : AppRoutes.dashboard;

      if (mounted) {
        AppNavigator.replace(context, returnRoute);
      }
    } else {
      _failedAttempts++;
      setState(() {
        _isAuthenticating = false;
        _errorMessage = result.error;
      });

      if (_failedAttempts >= _maxFailedAttempts) {
        // Too many failed attempts — force full logout
        await _forceLogout();
      }
    }
  }

  Future<void> _forceLogout() async {
    await _secureStorage.deleteAll();
    if (mounted) {
      AppNavigator.popToRoot(context, AppRoutes.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bgColor,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Lock icon
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: _surfaceColor,
                  shape: BoxShape.circle,
                  border: Border.all(color: _primaryColor.withOpacity(0.3), width: 2),
                ),
                child: const Icon(
                  Icons.fingerprint,
                  color: _primaryColor,
                  size: 48,
                ),
              ),
              const SizedBox(height: 32),
              const Text(
                'Verify Your Identity',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              const Text(
                'PayGate requires biometric verification\nto keep your account secure.',
                style: TextStyle(color: Colors.white54, fontSize: 14, height: 1.5),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 48),

              // Error message
              if (_errorMessage != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: Colors.red, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(color: Colors.red, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                if (_failedAttempts >= _maxFailedAttempts)
                  Text(
                    'Too many failed attempts. Please log in again.',
                    style: TextStyle(color: Colors.red.shade300, fontSize: 13),
                    textAlign: TextAlign.center,
                  ),
              ],

              // Retry button
              if (!_isAuthenticating && _failedAttempts < _maxFailedAttempts)
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _authenticate,
                    icon: const Icon(Icons.fingerprint),
                    label: const Text('Use Biometrics'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _primaryColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),

              if (_isAuthenticating)
                const CircularProgressIndicator(color: _primaryColor),

              const SizedBox(height: 16),

              // Fallback: log in with password
              TextButton(
                onPressed: _forceLogout,
                child: const Text(
                  'Use password instead',
                  style: TextStyle(color: Colors.white38, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
