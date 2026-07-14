/// BiometricTokenService
///
/// Bridges the Flutter `local_auth` biometric prompt with the Go Bridge
/// `/v1/auth/biometric/token` endpoint.
///
/// Flow:
///   1. User triggers biometric prompt (fingerprint / Face ID).
///   2. On success, this service reads the stored `device_id` and `refresh_token`
///      from `flutter_secure_storage`.
///   3. It calls `POST /v1/auth/biometric/token` with a signed challenge to
///      obtain a short-lived access token (15 min) without requiring the user
///      to re-enter their password.
///   4. The new access token is stored back in secure storage.
///
/// The Go Bridge handler (`BiometricTokenExchange`) validates the device
/// registration and issues the token via Keycloak token exchange.
library biometric_token_service;

import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:local_auth/local_auth.dart';

/// Result of a biometric token exchange.
class BiometricTokenResult {
  final bool success;
  final String? accessToken;
  final String? refreshToken;
  final DateTime? expiresAt;
  final String? error;

  const BiometricTokenResult({
    required this.success,
    this.accessToken,
    this.refreshToken,
    this.expiresAt,
    this.error,
  });

  factory BiometricTokenResult.failure(String error) =>
      BiometricTokenResult(success: false, error: error);
}

class BiometricTokenService {
  final LocalAuthentication _localAuth;
  final FlutterSecureStorage _secureStorage;
  final String _bridgeBaseUrl;

  static const _kDeviceIdKey = 'paygate_device_id';
  static const _kRefreshTokenKey = 'paygate_refresh_token';
  static const _kAccessTokenKey = 'paygate_access_token';
  static const _kBiometricEnabledKey = 'paygate_biometric_enabled';

  BiometricTokenService({
    LocalAuthentication? localAuth,
    FlutterSecureStorage? secureStorage,
    String? bridgeBaseUrl,
  })  : _localAuth = localAuth ?? LocalAuthentication(),
        _secureStorage = secureStorage ?? const FlutterSecureStorage(),
        _bridgeBaseUrl = bridgeBaseUrl ?? const String.fromEnvironment(
          'BRIDGE_BASE_URL',
          defaultValue: 'https://bridge.paygate.ng',
        );

  /// Returns true if the device supports biometric authentication and
  /// the user has enabled it for this app.
  Future<bool> isBiometricAvailable() async {
    try {
      final isEnabled = await _secureStorage.read(key: _kBiometricEnabledKey);
      if (isEnabled != 'true') return false;

      final canCheck = await _localAuth.canCheckBiometrics;
      final isDeviceSupported = await _localAuth.isDeviceSupported();
      return canCheck && isDeviceSupported;
    } catch (e) {
      debugPrint('[BiometricTokenService] isBiometricAvailable error: $e');
      return false;
    }
  }

  /// Returns the list of enrolled biometric types on this device.
  Future<List<BiometricType>> getAvailableBiometrics() async {
    try {
      return await _localAuth.getAvailableBiometrics();
    } catch (e) {
      return [];
    }
  }

  /// Enables biometric login for the current session.
  /// Must be called after a successful password/OAuth login.
  Future<void> enableBiometricLogin(String refreshToken) async {
    await _secureStorage.write(key: _kBiometricEnabledKey, value: 'true');
    await _secureStorage.write(key: _kRefreshTokenKey, value: refreshToken);
    debugPrint('[BiometricTokenService] Biometric login enabled');
  }

  /// Disables biometric login and clears stored credentials.
  Future<void> disableBiometricLogin() async {
    await _secureStorage.write(key: _kBiometricEnabledKey, value: 'false');
    await _secureStorage.delete(key: _kRefreshTokenKey);
    debugPrint('[BiometricTokenService] Biometric login disabled');
  }

  /// Authenticates the user biometrically and exchanges the result for a
  /// server-signed access token.
  ///
  /// Returns a [BiometricTokenResult] with the access token on success.
  Future<BiometricTokenResult> authenticateAndGetToken({
    String reason = 'Authenticate to access your PayGate account',
  }) async {
    // 1. Trigger biometric prompt
    bool authenticated = false;
    try {
      authenticated = await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: true,
          useErrorDialogs: true,
        ),
      );
    } catch (e) {
      return BiometricTokenResult.failure('Biometric error: $e');
    }

    if (!authenticated) {
      return BiometricTokenResult.failure('Biometric authentication cancelled');
    }

    // 2. Read stored credentials
    final deviceId = await _getOrCreateDeviceId();
    final refreshToken = await _secureStorage.read(key: _kRefreshTokenKey);

    if (refreshToken == null) {
      return BiometricTokenResult.failure(
          'No session found. Please log in with your password first.');
    }

    // 3. Generate a one-time challenge nonce (prevents replay attacks)
    final nonce = _generateNonce();
    final timestamp = DateTime.now().millisecondsSinceEpoch;

    // 4. Call the bridge token exchange endpoint
    try {
      final response = await http.post(
        Uri.parse('$_bridgeBaseUrl/v1/auth/biometric/token'),
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': deviceId,
        },
        body: jsonEncode({
          'device_id': deviceId,
          'refresh_token': refreshToken,
          'nonce': nonce,
          'timestamp': timestamp,
          'challenge_hash': _computeChallengeHash(deviceId, nonce, timestamp),
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final accessToken = data['access_token'] as String?;
        final newRefreshToken = data['refresh_token'] as String?;
        final expiresIn = data['expires_in'] as int? ?? 900;

        if (accessToken == null) {
          return BiometricTokenResult.failure('Invalid server response');
        }

        // 5. Store the new tokens
        await _secureStorage.write(key: _kAccessTokenKey, value: accessToken);
        if (newRefreshToken != null) {
          await _secureStorage.write(
              key: _kRefreshTokenKey, value: newRefreshToken);
        }

        debugPrint('[BiometricTokenService] Token exchange successful');
        return BiometricTokenResult(
          success: true,
          accessToken: accessToken,
          refreshToken: newRefreshToken ?? refreshToken,
          expiresAt: DateTime.now().add(Duration(seconds: expiresIn)),
        );
      } else if (response.statusCode == 401) {
        // Refresh token expired — user must re-authenticate with password
        await disableBiometricLogin();
        return BiometricTokenResult.failure(
            'Session expired. Please log in with your password.');
      } else {
        final error = jsonDecode(response.body)['message'] ?? 'Token exchange failed';
        return BiometricTokenResult.failure(error.toString());
      }
    } catch (e) {
      debugPrint('[BiometricTokenService] Token exchange error: $e');
      return BiometricTokenResult.failure('Network error: $e');
    }
  }

  /// Reads the stored access token without triggering biometric prompt.
  Future<String?> getStoredAccessToken() =>
      _secureStorage.read(key: _kAccessTokenKey);

  // ── Private helpers ──────────────────────────────────────────────────────

  Future<String> _getOrCreateDeviceId() async {
    var deviceId = await _secureStorage.read(key: _kDeviceIdKey);
    if (deviceId == null) {
      deviceId = _generateDeviceId();
      await _secureStorage.write(key: _kDeviceIdKey, value: deviceId);
    }
    return deviceId;
  }

  String _generateDeviceId() {
    final rng = Random.secure();
    final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  String _generateNonce() {
    final rng = Random.secure();
    final bytes = List<int>.generate(32, (_) => rng.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  String _computeChallengeHash(String deviceId, String nonce, int timestamp) {
    final payload = '$deviceId:$nonce:$timestamp';
    final bytes = utf8.encode(payload);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }
}
