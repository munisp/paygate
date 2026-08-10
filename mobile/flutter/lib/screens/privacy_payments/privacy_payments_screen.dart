import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Define colors for the dark theme
const Color _backgroundColor = Color(0xFF0f172a);
const Color _cardColor = Color(0xFF1e293b);
const Color _textColor = Color(0xFFf1f5f9);
const Color _accentColor = Color(0xFF6366f1);

// Data model for Privacy Payments settings
class PrivacySettings {
  final bool enableTwoFactorAuth;
  final String dataRetentionPolicy;
  final String privacyContactEmail;
  final double transactionLimit;
  final String currency;
  final DateTime lastUpdated;

  PrivacySettings({
    required this.enableTwoFactorAuth,
    required this.dataRetentionPolicy,
    required this.privacyContactEmail,
    required this.transactionLimit,
    required this.currency,
    required this.lastUpdated,
  });

  factory PrivacySettings.fromJson(Map<String, dynamic> json) {
    return PrivacySettings(
      enableTwoFactorAuth: json['enableTwoFactorAuth'] ?? false,
      dataRetentionPolicy: json['dataRetentionPolicy'] ?? '3 years',
      privacyContactEmail: json['privacyContactEmail'] ?? 'privacy@example.com',
      transactionLimit: (json['transactionLimit'] as num?)?.toDouble() ?? 10000.0,
      currency: json['currency'] ?? 'USD',
      lastUpdated: DateTime.parse(json['lastUpdated'] ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'enableTwoFactorAuth': enableTwoFactorAuth,
      'dataRetentionPolicy': dataRetentionPolicy,
      'privacyContactEmail': privacyContactEmail,
      'transactionLimit': transactionLimit,
      'currency': currency,
      'lastUpdated': lastUpdated.toIso8601String(),
    };
  }

  PrivacySettings copyWith({
    bool? enableTwoFactorAuth,
    String? dataRetentionPolicy,
    String? privacyContactEmail,
    double? transactionLimit,
    String? currency,
    DateTime? lastUpdated,
  }) {
    return PrivacySettings(
      enableTwoFactorAuth: enableTwoFactorAuth ?? this.enableTwoFactorAuth,
      dataRetentionPolicy: dataRetentionPolicy ?? this.dataRetentionPolicy,
      privacyContactEmail: privacyContactEmail ?? this.privacyContactEmail,
      transactionLimit: transactionLimit ?? this.transactionLimit,
      currency: currency ?? this.currency,
      lastUpdated: lastUpdated ?? this.lastUpdated,
    );
  }
}

// Riverpod provider for privacy settings
final privacySettingsProvider = FutureProvider.autoDispose<PrivacySettings>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/privacyPayments.get');
    return PrivacySettings.fromJson(response as Map<String, dynamic>);
  } catch (e) {
    throw Exception('Failed to fetch privacy settings: $e');
  }
});

class PrivacyPaymentsScreen extends ConsumerStatefulWidget {
  const PrivacyPaymentsScreen({super.key});

  @override
  ConsumerState<PrivacyPaymentsScreen> createState() => _PrivacyPaymentsScreenState();
}

class _PrivacyPaymentsScreenState extends ConsumerState<PrivacyPaymentsScreen> {
  Future<void> _refreshSettings() async {
    ref.invalidate(privacySettingsProvider);
    await ref.read(privacySettingsProvider.future);
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$');
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('MMM dd, yyyy - hh:mm a').format(date);
  }

  Future<void> _showEditDialog(PrivacySettings currentSettings) async {
    bool enableTwoFactorAuth = currentSettings.enableTwoFactorAuth;
    String dataRetentionPolicy = currentSettings.dataRetentionPolicy;
    String privacyContactEmail = currentSettings.privacyContactEmail;
    TextEditingController transactionLimitController = TextEditingController(text: currentSettings.transactionLimit.toString());

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: _cardColor,
              title: Text('Edit Privacy Settings', style: TextStyle(color: _textColor)),
              content: SingleChildScrollView(
                child: ListBody(
                  children: <Widget>[
                    SwitchListTile(
                      title: Text('Enable Two-Factor Auth', style: TextStyle(color: _textColor)),
                      value: enableTwoFactorAuth,
                      onChanged: (bool value) {
                        setState(() {
                          enableTwoFactorAuth = value;
                        });
                      },
                      activeColor: _accentColor,
                    ),
                    TextFormField(
                      initialValue: dataRetentionPolicy,
                      style: TextStyle(color: _textColor),
                      decoration: InputDecoration(
                        labelText: 'Data Retention Policy',
                        labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                      ),
                      onChanged: (value) => dataRetentionPolicy = value,
                    ),
                    TextFormField(
                      initialValue: privacyContactEmail,
                      style: TextStyle(color: _textColor),
                      decoration: InputDecoration(
                        labelText: 'Privacy Contact Email',
                        labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                      ),
                      onChanged: (value) => privacyContactEmail = value,
                    ),
                    TextFormField(
                      controller: transactionLimitController,
                      style: TextStyle(color: _textColor),
                      keyboardType: TextInputType.number, // Ensure numeric input
                      decoration: InputDecoration(
                        labelText: 'Transaction Limit',
                        labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                      ),
                    ),
                  ],
                ),
              ),
              actions: <Widget>[
                TextButton(
                  child: Text('Cancel', style: TextStyle(color: _textColor)),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                  },
                ),
                TextButton(
                  child: Text('Save', style: TextStyle(color: _accentColor)),
                  onPressed: () async {
                    Navigator.of(dialogContext).pop();
                    // Simulate API call to update settings
                    try {
                      final api = ref.read(apiServiceProvider);
                      await api.post(
                        '/trpc/privacyPayments.update',
                        body: {
                          'enableTwoFactorAuth': enableTwoFactorAuth,
                          'dataRetentionPolicy': dataRetentionPolicy,
                          'privacyContactEmail': privacyContactEmail,
                          'transactionLimit': double.tryParse(transactionLimitController.text) ?? currentSettings.transactionLimit,
                        },
                      );
                      _refreshSettings(); // Refresh data after successful update
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Settings updated successfully!', style: TextStyle(color: _textColor)), backgroundColor: _accentColor),
                      );
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Failed to update settings: $e', style: TextStyle(color: _textColor)), backgroundColor: Colors.red),
                      );
                    }
                  },
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final privacySettingsAsyncValue = ref.watch(privacySettingsProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: Text('Privacy Payments', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: IconThemeData(color: _textColor), // For back button color
      ),
      body: RefreshIndicator(
        onRefresh: _refreshSettings,
        color: _accentColor,
        child: privacySettingsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, color: Colors.red, size: 48),
                  SizedBox(height: 16),
                  Text(
                    'Error: ${err.toString()}',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: _textColor, fontSize: 16),
                  ),
                  SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _refreshSettings,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _accentColor,
                      foregroundColor: _textColor,
                    ),
                    child: Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (settings) {
            // Empty state example (if settings could be null or represent an empty state)
            if (settings == null) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.info_outline, color: _textColor.withOpacity(0.7), size: 48),
                    SizedBox(height: 16),
                    Text(
                      'No privacy settings found.',
                      style: TextStyle(color: _textColor, fontSize: 16),
                    ),
                    SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () { /* Action to create new settings */ },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _accentColor,
                        foregroundColor: _textColor,
                      ),
                      child: Text('Create Settings'),
                    ),
                  ],
                ),
              );
            }

            return ListView(
              padding: const EdgeInsets.all(16.0),
              children: [
                Card(
                  color: _cardColor,
                  elevation: 4,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('General Privacy Settings', style: TextStyle(color: _textColor, fontSize: 20, fontWeight: FontWeight.bold)),
                        SizedBox(height: 20),
                        _buildSettingRow(
                          'Two-Factor Authentication',
                          settings.enableTwoFactorAuth ? 'Enabled' : 'Disabled',
                          statusColor: settings.enableTwoFactorAuth ? Colors.green : Colors.redAccent,
                        ),
                        _buildSettingRow('Data Retention Policy', settings.dataRetentionPolicy),
                        _buildSettingRow('Privacy Contact Email', settings.privacyContactEmail),
                        _buildSettingRow('Transaction Limit',
                            _formatAmount(settings.transactionLimit, settings.currency)),
                        _buildSettingRow('Last Updated', _formatDate(settings.lastUpdated)),
                        SizedBox(height: 20),
                        Align(
                          alignment: Alignment.centerRight,
                          child: ElevatedButton.icon(
                            onPressed: () => _showEditDialog(settings),
                            icon: Icon(Icons.edit, color: _textColor),
                            label: Text('Edit Settings', style: TextStyle(color: _textColor)),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _accentColor,
                              padding: EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                // Add more cards or sections for other privacy-related payment aspects if needed
                SizedBox(height: 20),
                Card(
                  color: _cardColor,
                  elevation: 4,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Payment Data Handling', style: TextStyle(color: _textColor, fontSize: 20, fontWeight: FontWeight.bold)),
                        SizedBox(height: 10),
                        Text(
                          'Details about how payment data is processed and stored. This section could include information about PCI DSS compliance, encryption standards, and data anonymization practices.',
                          style: TextStyle(color: _textColor.withOpacity(0.8), fontSize: 14),
                        ),
                        SizedBox(height: 10),
                        ElevatedButton.icon(
                          onPressed: () { /* Navigate to a detailed policy page */ },
                          icon: Icon(Icons.policy, color: _textColor),
                          label: Text('View Full Policy', style: TextStyle(color: _textColor)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _accentColor,
                            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildSettingRow(String title, String value, {Color? statusColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: TextStyle(color: _textColor.withOpacity(0.8), fontSize: 16)),
          Row(
            children: [
              if (statusColor != null)
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: statusColor,
                    shape: BoxShape.circle,
                  ),
                  margin: EdgeInsets.only(right: 8),
                ),
              Text(value, style: TextStyle(color: _textColor, fontSize: 16, fontWeight: FontWeight.w500)),
            ],
          ),
        ],
      ),
    );
  }
}
