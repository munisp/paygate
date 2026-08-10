// Security Service — Jailbreak/Root Detection & Certificate Pinning
// Resolves LOW vulnerabilities from SECURITY_AUDIT_v99.md
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';
import 'package:ssl_pinning_plugin/ssl_pinning_plugin.dart';

/// PayGate API certificate fingerprints (SHA-256, colon-separated).
/// Update these when the server certificate is rotated.
const _apiCertFingerprints = [
  // Primary API cert fingerprint — update before production deployment
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
];

class SecurityService {
  static SecurityService? _instance;
  static SecurityService get instance => _instance ??= SecurityService._();
  SecurityService._();

  bool _jailbreakChecked = false;
  bool _isJailbroken = false;

  /// Returns true if the device is rooted (Android) or jailbroken (iOS).
  /// Cached after first check to avoid repeated native calls.
  Future<bool> isDeviceCompromised() async {
    if (_jailbreakChecked) return _isJailbroken;
    try {
      _isJailbroken = await FlutterJailbreakDetection.jailbroken;
      _jailbreakChecked = true;
    } catch (e) {
      debugPrint('[SecurityService] Jailbreak detection failed: $e');
      // Fail open in debug mode, fail closed in release
      _isJailbroken = kReleaseMode;
    }
    return _isJailbroken;
  }

  /// Verifies the SSL certificate of [url] against the pinned fingerprints.
  /// Returns true if the certificate matches, false otherwise.
  Future<bool> verifyCertificate(String url) async {
    if (kDebugMode) {
      // Skip pinning in debug mode to allow local dev server
      return true;
    }
    try {
      final result = await SslPinningPlugin.check(
        serverURL: url,
        headerHttp: {},
        httpMethod: HttpMethod.Get,
        sha: SHA.SHA256,
        allowedSHAFingerprints: _apiCertFingerprints,
        timeout: 60,
      );
      return result == 'CONNECTION_SECURE';
    } catch (e) {
      debugPrint('[SecurityService] Certificate pinning check failed: $e');
      return false;
    }
  }

  /// Performs a full security check on app startup.
  /// Returns a [SecurityCheckResult] with details about any issues found.
  Future<SecurityCheckResult> performStartupCheck(String apiBaseUrl) async {
    final compromised = await isDeviceCompromised();
    if (compromised) {
      return SecurityCheckResult(
        passed: false,
        reason: 'Device appears to be rooted or jailbroken. '
            'For security reasons, PayGate cannot run on compromised devices.',
      );
    }

    // Only verify cert on non-localhost URLs
    if (!apiBaseUrl.contains('localhost') && !apiBaseUrl.contains('127.0.0.1')) {
      final certValid = await verifyCertificate(apiBaseUrl);
      if (!certValid) {
        return SecurityCheckResult(
          passed: false,
          reason: 'SSL certificate verification failed. '
              'The connection may be intercepted. Please check your network.',
        );
      }
    }

    return SecurityCheckResult(passed: true);
  }
}

class SecurityCheckResult {
  final bool passed;
  final String? reason;
  const SecurityCheckResult({required this.passed, this.reason});
}
