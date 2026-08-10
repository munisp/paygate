/// Billing configuration model for PayGate Flutter app.
/// Mirrors the billing_configs table in the portal database.
library;

class BillingConfig {
  final String id;
  final String tenantId;
  final String status;
  final bool active;
  final String pricingModel;
  final double feeRate;
  final int feeCapKobo;
  final int feeFloorKobo;
  final double platformShare;
  final double resellerShare;
  final int signOnFeeKobo;
  final double signOnPlatformShare;
  final int subscriptionFeeKobo;
  final double subscriptionPlatformShare;
  final int version;
  final DateTime? effectiveFrom;

  const BillingConfig({
    required this.id,
    required this.tenantId,
    required this.status,
    required this.active,
    required this.pricingModel,
    required this.feeRate,
    required this.feeCapKobo,
    required this.feeFloorKobo,
    required this.platformShare,
    required this.resellerShare,
    required this.signOnFeeKobo,
    required this.signOnPlatformShare,
    required this.subscriptionFeeKobo,
    required this.subscriptionPlatformShare,
    required this.version,
    this.effectiveFrom,
  });

  factory BillingConfig.fromJson(Map<String, dynamic> json) => BillingConfig(
        id: json['id'] as String,
        tenantId: json['tenantId'] as String,
        status: json['status'] as String,
        active: json['active'] as bool,
        pricingModel: json['pricingModel'] as String,
        feeRate: (json['feeRate'] as num).toDouble(),
        feeCapKobo: json['feeCapKobo'] as int,
        feeFloorKobo: json['feeFloorKobo'] as int,
        platformShare: (json['platformShare'] as num).toDouble(),
        resellerShare: (json['resellerShare'] as num).toDouble(),
        signOnFeeKobo: json['signOnFeeKobo'] as int? ?? 0,
        signOnPlatformShare:
            (json['signOnPlatformShare'] as num?)?.toDouble() ?? 0.70,
        subscriptionFeeKobo: json['subscriptionFeeKobo'] as int? ?? 0,
        subscriptionPlatformShare:
            (json['subscriptionPlatformShare'] as num?)?.toDouble() ?? 0.65,
        version: json['version'] as int,
        effectiveFrom: json['effectiveFrom'] != null
            ? DateTime.parse(json['effectiveFrom'] as String)
            : null,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'tenantId': tenantId,
        'status': status,
        'active': active,
        'pricingModel': pricingModel,
        'feeRate': feeRate,
        'feeCapKobo': feeCapKobo,
        'feeFloorKobo': feeFloorKobo,
        'platformShare': platformShare,
        'resellerShare': resellerShare,
        'signOnFeeKobo': signOnFeeKobo,
        'signOnPlatformShare': signOnPlatformShare,
        'subscriptionFeeKobo': subscriptionFeeKobo,
        'subscriptionPlatformShare': subscriptionPlatformShare,
        'version': version,
        'effectiveFrom': effectiveFrom?.toIso8601String(),
      };
}

class BillingAuditEntry {
  final String id;
  final String actorId;
  final String actorRole;
  final String action;
  final String? reason;
  final DateTime createdAt;

  const BillingAuditEntry({
    required this.id,
    required this.actorId,
    required this.actorRole,
    required this.action,
    this.reason,
    required this.createdAt,
  });

  factory BillingAuditEntry.fromJson(Map<String, dynamic> json) =>
      BillingAuditEntry(
        id: json['id'] as String,
        actorId: json['actorId'] as String,
        actorRole: json['actorRole'] as String,
        action: json['action'] as String,
        reason: json['reason'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
