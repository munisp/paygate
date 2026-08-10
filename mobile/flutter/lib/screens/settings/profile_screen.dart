import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import '../../providers/auth_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _businessCtrl = TextEditingController();
  bool _isLoading = true;
  bool _isSaving = false;
  Map<String, dynamic>? _profile;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _businessCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() => _isLoading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.get('/trpc/auth.me');
      final data = result['result']?['data'] ?? result['data'];
      if (data != null) {
        setState(() {
          _profile = data as Map<String, dynamic>;
          _nameCtrl.text = data['name'] ?? '';
          _emailCtrl.text = data['email'] ?? '';
          _phoneCtrl.text = data['phone'] ?? '';
          _businessCtrl.text = data['businessName'] ?? data['business_name'] ?? '';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/settings.updateProfile', body: {
        'name': _nameCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim(),
        'businessName': _businessCtrl.text.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile updated'), backgroundColor: Color(0xFF22c55e)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: const Color(0xFFef4444)),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Profile', style: TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.w700)),
        elevation: 0,
        actions: [
          if (!_isLoading)
            TextButton(
              onPressed: _isSaving ? null : _saveProfile,
              child: _isSaving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF3b82f6)))
                  : const Text('Save', style: TextStyle(color: Color(0xFF3b82f6), fontWeight: FontWeight.w700)),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF3b82f6)))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Avatar
                    Center(
                      child: Stack(
                        children: [
                          CircleAvatar(
                            radius: 48,
                            backgroundColor: const Color(0xFF3b82f6).withOpacity(0.2),
                            child: Text(
                              (_nameCtrl.text.isNotEmpty ? _nameCtrl.text[0] : 'M').toUpperCase(),
                              style: const TextStyle(color: Color(0xFF3b82f6), fontSize: 36, fontWeight: FontWeight.w700),
                            ),
                          ),
                          Positioned(
                            bottom: 0, right: 0,
                            child: Container(
                              width: 32, height: 32,
                              decoration: BoxDecoration(
                                color: const Color(0xFF3b82f6),
                                shape: BoxShape.circle,
                                border: Border.all(color: const Color(0xFF0f172a), width: 2),
                              ),
                              child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 16),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // KYC Status
                    if (_profile?['kycStatus'] != null) ...[
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: _kycColor(_profile!['kycStatus'] as String).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _kycColor(_profile!['kycStatus'] as String).withOpacity(0.3)),
                        ),
                        child: Row(children: [
                          Icon(_kycIcon(_profile!['kycStatus'] as String),
                            color: _kycColor(_profile!['kycStatus'] as String), size: 20),
                          const SizedBox(width: 10),
                          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('KYC Status', style: TextStyle(color: Color(0xFF94a3b8), fontSize: 12)),
                            Text((_profile!['kycStatus'] as String).toUpperCase(),
                              style: TextStyle(color: _kycColor(_profile!['kycStatus'] as String),
                                fontWeight: FontWeight.w700, fontSize: 14)),
                          ]),
                        ]),
                      ),
                      const SizedBox(height: 20),
                    ],

                    _sectionLabel('Personal Information'),
                    const SizedBox(height: 12),
                    _buildField('Full Name', _nameCtrl, Icons.person_rounded,
                      validator: (v) => v!.isEmpty ? 'Name is required' : null),
                    const SizedBox(height: 14),
                    _buildField('Email Address', _emailCtrl, Icons.email_rounded,
                      readOnly: true, hint: 'Cannot be changed'),
                    const SizedBox(height: 14),
                    _buildField('Phone Number', _phoneCtrl, Icons.phone_rounded,
                      keyboardType: TextInputType.phone),
                    const SizedBox(height: 24),

                    _sectionLabel('Business Information'),
                    const SizedBox(height: 12),
                    _buildField('Business Name', _businessCtrl, Icons.business_rounded),
                    const SizedBox(height: 32),

                    // Account info
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1e293b),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF334155)),
                      ),
                      child: Column(children: [
                        _infoRow('Account ID', _profile?['id']?.toString() ?? '-'),
                        const Divider(color: Color(0xFF334155)),
                        _infoRow('Member Since', _profile?['createdAt'] ?? _profile?['created_at'] ?? '-'),
                        const Divider(color: Color(0xFF334155)),
                        _infoRow('Role', _profile?['role'] ?? 'merchant'),
                      ]),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _sectionLabel(String text) => Text(text,
    style: const TextStyle(color: Color(0xFF94a3b8), fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.8));

  Widget _buildField(String label, TextEditingController ctrl, IconData icon,
      {bool readOnly = false, String? hint, TextInputType? keyboardType,
       String? Function(String?)? validator}) {
    return TextFormField(
      controller: ctrl,
      readOnly: readOnly,
      keyboardType: keyboardType,
      validator: validator,
      style: TextStyle(color: readOnly ? const Color(0xFF64748b) : const Color(0xFFf1f5f9)),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, color: const Color(0xFF64748b), size: 20),
        filled: true,
        fillColor: const Color(0xFF1e293b),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF334155))),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF334155))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF3b82f6), width: 2)),
      ),
    );
  }

  Widget _infoRow(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Text(label, style: const TextStyle(color: Color(0xFF64748b), fontSize: 13)),
      const Spacer(),
      Text(value, style: const TextStyle(color: Color(0xFF94a3b8), fontSize: 13)),
    ]),
  );

  Color _kycColor(String status) {
    switch (status.toLowerCase()) {
      case 'verified': return const Color(0xFF22c55e);
      case 'pending': return const Color(0xFFf59e0b);
      case 'rejected': return const Color(0xFFef4444);
      default: return const Color(0xFF94a3b8);
    }
  }

  IconData _kycIcon(String status) {
    switch (status.toLowerCase()) {
      case 'verified': return Icons.verified_rounded;
      case 'pending': return Icons.hourglass_empty_rounded;
      case 'rejected': return Icons.cancel_rounded;
      default: return Icons.help_outline_rounded;
    }
  }
}
