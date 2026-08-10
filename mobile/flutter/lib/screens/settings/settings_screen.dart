import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:local_auth/local_auth.dart';

// Mocking the required providers and services as they are expected to exist in the project
// In a real app, these would be imported from their respective files.
final apiServiceProvider = Provider((ref) => ApiService());
final authNotifierProvider = StateNotifierProvider<AuthNotifier, bool>((ref) => AuthNotifier());

class ApiService {
  Future<Map<String, dynamic>> getProfile() async {
    await Future.delayed(const Duration(seconds: 1));
    return {'name': 'John Doe', 'email': 'john@paygate.com', 'business': 'PayGate Merchant', 'kycStatus': 'Verified'};
  }

  Future<List<Map<String, dynamic>>> getApiKeys() async {
    await Future.delayed(const Duration(seconds: 1));
    return [{'id': '1', 'key': 'pk_live_xxxxxxxxxxxx', 'name': 'Production Key'}];
  }

  Future<void> createApiKey(String name) async {
    await Future.delayed(const Duration(seconds: 1));
  }

  Future<void> revokeApiKey(String id) async {
    await Future.delayed(const Duration(seconds: 1));
  }

  Future<List<Map<String, dynamic>>> getWebhooks() async {
    await Future.delayed(const Duration(seconds: 1));
    return [{'id': '1', 'url': 'https://api.example.com/webhook', 'events': 'payment.success'}];
  }

  Future<void> createWebhook(String url) async {
    await Future.delayed(const Duration(seconds: 1));
  }

  Future<void> deleteWebhook(String id) async {
    await Future.delayed(const Duration(seconds: 1));
  }

  Future<void> registerPushToken(bool enabled) async {
    await Future.delayed(const Duration(seconds: 1));
  }
}

class AuthNotifier extends StateNotifier<bool> {
  AuthNotifier() : super(true);
  Future<void> logout() async {
    state = false;
  }
}

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final LocalAuthentication auth = LocalAuthentication();
  bool _isBiometricEnabled = false;
  bool _isPushEnabled = true;
  String _appVersion = '1.0.0';
  bool _isLoading = true;
  String? _errorMessage;

  Map<String, dynamic>? _profile;
  List<Map<String, dynamic>> _apiKeys = [];
  List<Map<String, dynamic>> _webhooks = [];

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final api = ref.read(apiServiceProvider);
      final packageInfo = await PackageInfo.fromPlatform();
      
      final results = await Future.wait([
        api.getProfile(),
        api.getApiKeys(),
        api.getWebhooks(),
      ]);

      setState(() {
        _profile = results[0] as Map<String, dynamic>;
        _apiKeys = results[1] as List<Map<String, dynamic>>;
        _webhooks = results[2] as List<Map<String, dynamic>>;
        _appVersion = "${packageInfo.version} (${packageInfo.buildNumber})";
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _toggleBiometrics(bool value) async {
    final canCheck = await auth.canCheckBiometrics;
    if (canCheck) {
      final authenticated = await auth.authenticate(
        localizedReason: 'Please authenticate to enable biometrics',
        options: const AuthenticationOptions(biometricOnly: true),
      );
      if (authenticated) {
        setState(() => _isBiometricEnabled = value);
      }
    }
  }

  Future<void> _togglePush(bool value) async {
    try {
      await ref.read(apiServiceProvider).registerPushToken(value);
      setState(() => _isPushEnabled = value);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to update notifications: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    const bgColor = Color(0xFF0F172A);
    const surfaceColor = Color(0xFF1E293B);
    const borderColor = Color(0xFF334155);
    const primaryColor = Color(0xFF3B82F6);
    const textColor = Color(0xFFF1F5F9);
    const mutedColor = Color(0xFF94A3B8);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        title: const Text('Settings', style: TextStyle(color: textColor, fontWeight: FontWeight.bold)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: borderColor, height: 1),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _loadInitialData,
        color: primaryColor,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: primaryColor))
            : _errorMessage != null
                ? _buildErrorState(textColor, primaryColor)
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildSectionHeader('ACCOUNT', mutedColor),
                      _buildSettingsCard(surfaceColor, borderColor, [
                        _buildListTile('Profile', _profile?['name'] ?? 'N/A', Icons.person_outline, textColor, mutedColor),
                        _buildDivider(borderColor),
                        _buildListTile('Business Info', _profile?['business'] ?? 'N/A', Icons.business_outlined, textColor, mutedColor),
                        _buildDivider(borderColor),
                        _buildListTile('KYC Status', _profile?['kycStatus'] ?? 'Pending', Icons.verified_user_outlined, textColor, 
                          _profile?['kycStatus'] == 'Verified' ? Colors.green : Colors.orange),
                      ]),
                      const SizedBox(height: 24),
                      
                      _buildSectionHeader('SECURITY', mutedColor),
                      _buildSettingsCard(surfaceColor, borderColor, [
                        _buildListTile('Change Password', null, Icons.lock_outline, textColor, mutedColor, onTap: () {}),
                        _buildDivider(borderColor),
                        _buildListTile('Two-Factor Auth', 'Enabled', Icons.security_outlined, textColor, Colors.green, onTap: () {}),
                        _buildDivider(borderColor),
                        SwitchListTile(
                          value: _isBiometricEnabled,
                          onChanged: _toggleBiometrics,
                          title: const Text('Biometrics', style: TextStyle(color: textColor)),
                          secondary: const Icon(Icons.fingerprint, color: mutedColor),
                          activeColor: primaryColor,
                        ),
                      ]),
                      const SizedBox(height: 24),

                      _buildSectionHeader('DEVELOPER', mutedColor),
                      _buildSettingsCard(surfaceColor, borderColor, [
                        _buildListTile('API Keys', '${_apiKeys.length} active', Icons.vpn_key_outlined, textColor, mutedColor, onTap: _showApiKeysDialog),
                        _buildDivider(borderColor),
                        _buildListTile('Webhooks', '${_webhooks.length} configured', Icons.webhook_outlined, textColor, mutedColor, onTap: _showWebhooksDialog),
                      ]),
                      const SizedBox(height: 24),

                      _buildSectionHeader('NOTIFICATIONS', mutedColor),
                      _buildSettingsCard(surfaceColor, borderColor, [
                        SwitchListTile(
                          value: _isPushEnabled,
                          onChanged: _togglePush,
                          title: const Text('Push Notifications', style: TextStyle(color: textColor)),
                          secondary: const Icon(Icons.notifications_outlined, color: mutedColor),
                          activeColor: primaryColor,
                        ),
                      ]),
                      const SizedBox(height: 24),

                      _buildSectionHeader('ABOUT', mutedColor),
                      _buildSettingsCard(surfaceColor, borderColor, [
                        _buildListTile('App Version', _appVersion, Icons.info_outline, textColor, mutedColor),
                        _buildDivider(borderColor),
                        _buildListTile('Terms of Service', null, Icons.description_outlined, textColor, mutedColor, onTap: () {}),
                        _buildDivider(borderColor),
                        _buildListTile('Privacy Policy', null, Icons.privacy_tip_outlined, textColor, mutedColor, onTap: () {}),
                      ]),
                      const SizedBox(height: 32),

                      ElevatedButton(
                        onPressed: () async {
                          await ref.read(authNotifierProvider.notifier).logout();
                          if (mounted) Navigator.of(context).pushReplacementNamed('/login');
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.redAccent.withOpacity(0.1),
                          foregroundColor: Colors.redAccent,
                          side: const BorderSide(color: Colors.redAccent),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('Logout', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                      const SizedBox(height: 40),
                    ],
                  ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, Color color) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(title, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
    );
  }

  Widget _buildSettingsCard(Color bg, Color border, List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildListTile(String title, String? subtitle, IconData icon, Color titleColor, Color subtitleColor, {VoidCallback? onTap}) {
    return ListTile(
      onTap: onTap,
      leading: Icon(icon, color: const Color(0xFF94A3B8)),
      title: Text(title, style: TextStyle(color: titleColor, fontSize: 15)),
      subtitle: subtitle != null ? Text(subtitle, style: TextStyle(color: subtitleColor, fontSize: 13)) : null,
      trailing: onTap != null ? const Icon(Icons.chevron_right, color: Color(0xFF334155)) : null,
    );
  }

  Widget _buildDivider(Color color) {
    return Divider(height: 1, thickness: 1, color: color, indent: 56);
  }

  Widget _buildErrorState(Color textColor, Color primaryColor) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.redAccent),
            const SizedBox(height: 16),
            Text('Something went wrong', style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(_errorMessage ?? 'Unknown error', textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF94A3B8))),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loadInitialData,
              style: ElevatedButton.styleFrom(backgroundColor: primaryColor),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  void _showApiKeysDialog() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.between,
                children: [
                  const Text('API Keys', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                  IconButton(
                    icon: const Icon(Icons.add, color: Color(0xFF3B82F6)),
                    onPressed: () async {
                      await ref.read(apiServiceProvider).createApiKey('New Key');
                      _loadInitialData();
                      if (context.mounted) Navigator.pop(context);
                    },
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Expanded(
                child: _apiKeys.isEmpty
                    ? const Center(child: Text('No API keys found', style: TextStyle(color: Color(0xFF94A3B8))))
                    : ListView.builder(
                        itemCount: _apiKeys.length,
                        itemBuilder: (context, index) {
                          final key = _apiKeys[index];
                          return ListTile(
                            title: Text(key['name'], style: const TextStyle(color: Colors.white)),
                            subtitle: Text(key['key'], style: const TextStyle(color: Color(0xFF94A3B8))),
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                              onPressed: () async {
                                await ref.read(apiServiceProvider).revokeApiKey(key['id']);
                                _loadInitialData();
                                if (context.mounted) Navigator.pop(context);
                              },
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showWebhooksDialog() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.between,
              children: [
                const Text('Webhooks', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                IconButton(
                  icon: const Icon(Icons.add, color: Color(0xFF3B82F6)),
                  onPressed: () async {
                    await ref.read(apiServiceProvider).createWebhook('https://example.com/callback');
                    _loadInitialData();
                    if (context.mounted) Navigator.pop(context);
                  },
                ),
              ],
            ),
            const SizedBox(height: 16),
            Expanded(
              child: _webhooks.isEmpty
                  ? const Center(child: Text('No webhooks configured', style: TextStyle(color: Color(0xFF94A3B8))))
                  : ListView.builder(
                      itemCount: _webhooks.length,
                      itemBuilder: (context, index) {
                        final webhook = _webhooks[index];
                        return ListTile(
                          title: Text(webhook['url'], style: const TextStyle(color: Colors.white)),
                          subtitle: Text(webhook['events'], style: const TextStyle(color: Color(0xFF94A3B8))),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                            onPressed: () async {
                              await ref.read(apiServiceProvider).deleteWebhook(webhook['id']);
                              _loadInitialData();
                              if (context.mounted) Navigator.pop(context);
                            },
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
