import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

// --- Mock/Interface Definitions for self-contained code ---
// In a real app, these would be in separate files.

enum TransactionStatus { success, pending, failed, refunded }

class Transaction {
  final String id;
  final double amount;
  final String currency;
  final String reference;
  final String channel;
  final TransactionStatus status;
  final DateTime createdAt;
  final String? description;
  final Customer? customer;
  final Map<String, dynamic>? metadata;

  Transaction({
    required this.id,
    required this.amount,
    required this.currency,
    required this.reference,
    required this.channel,
    required this.status,
    required this.createdAt,
    this.description,
    this.customer,
    this.metadata,
  });
}

class Customer {
  final String name;
  final String email;
  final String? phone;

  Customer({required this.name, required this.email, this.phone});
}

abstract class ApiService {
  Future<Transaction> getTransaction(String id);
  Future<void> refundTransaction(String id);
}

// Riverpod Providers (Mocked for the screen)
final apiServiceProvider = Provider<ApiService>((ref) => throw UnimplementedError());

final transactionProvider = FutureProvider.family<Transaction, String>((ref, id) async {
  final api = ref.watch(apiServiceProvider);
  return api.getTransaction(id);
});

// --- UI Constants (Dark Theme) ---
class AppColors {
  static const background = Color(0xFF0F172A);
  static const surface = Color(0xFF1E293B);
  static const border = Color(0xFF334155);
  static const primary = Color(0xFF3B82F6);
  static const text = Color(0xFFF1F5F9);
  static const muted = Color(0xFF94A3B8);
  static const success = Color(0xFF10B981);
  static const error = Color(0xFFEF4444);
  static const warning = Color(0xFFF59E0B);
}

// --- Screen Implementation ---

class TransactionDetailScreen extends ConsumerStatefulWidget {
  final String transactionId;

  const TransactionDetailScreen({
    super.key,
    required this.transactionId,
  });

  @override
  ConsumerState<TransactionDetailScreen> createState() => _TransactionDetailScreenState();
}

class _TransactionDetailScreenState extends ConsumerState<TransactionDetailScreen> {
  bool _isRefunding = false;

  Future<void> _handleRefresh() async {
    ref.invalidate(transactionProvider(widget.transactionId));
    return ref.read(transactionProvider(widget.transactionId).future).then((_) => null);
  }

  Future<void> _shareTransaction(Transaction tx) async {
    final text = 'Transaction Details\n'
        'Ref: ${tx.reference}\n'
        'Amount: ${tx.currency} ${tx.amount.toStringAsFixed(2)}\n'
        'Status: ${tx.status.name.toUpperCase()}\n'
        'Date: ${DateFormat('MMM dd, yyyy HH:mm').format(tx.createdAt)}';
    await Share.share(text, subject: 'Transaction ${tx.reference}');
  }

  Future<void> _confirmRefund(Transaction tx) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Confirm Refund', style: TextStyle(color: AppColors.text)),
        content: Text(
          'Are you sure you want to refund ${tx.currency} ${tx.amount.toStringAsFixed(2)} for transaction ${tx.reference}?',
          style: const TextStyle(color: AppColors.muted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel', style: TextStyle(color: AppColors.muted)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Refund', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      _performRefund();
    }
  }

  Future<void> _performRefund() async {
    setState(() => _isRefunding = true);
    try {
      await ref.read(apiServiceProvider).refundTransaction(widget.transactionId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Refund processed successfully'), backgroundColor: AppColors.success),
        );
        ref.invalidate(transactionProvider(widget.transactionId));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Refund failed: ${e.toString()}'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _isRefunding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final transactionAsync = ref.watch(transactionProvider(widget.transactionId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        title: const Text('Transaction Details', style: TextStyle(color: AppColors.text, fontSize: 18, fontWeight: FontWeight.w600)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.text),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          transactionAsync.when(
            data: (tx) => IconButton(
              icon: const Icon(Icons.share_outlined, color: AppColors.text),
              onPressed: () => _shareTransaction(tx),
            ),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: transactionAsync.when(
        data: (tx) => RefreshIndicator(
          onRefresh: _handleRefresh,
          color: AppColors.primary,
          backgroundColor: AppColors.surface,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildHeroHeader(tx),
              const SizedBox(height: 24),
              _buildSectionTitle('Transaction Details'),
              _buildDetailCard([
                _DetailRow(label: 'Reference', value: tx.reference, copyable: true),
                _DetailRow(label: 'Amount', value: '${tx.currency} ${tx.amount.toStringAsFixed(2)}'),
                _DetailRow(label: 'Channel', value: tx.channel.toUpperCase()),
                _DetailRow(label: 'Status', value: tx.status.name.toUpperCase(), valueColor: _getStatusColor(tx.status)),
                _DetailRow(label: 'Date', value: DateFormat('MMM dd, yyyy • HH:mm:ss').format(tx.createdAt)),
                if (tx.description != null) _DetailRow(label: 'Description', value: tx.description!),
              ]),
              if (tx.customer != null) ...[
                const SizedBox(height: 24),
                _buildSectionTitle('Customer Information'),
                _buildDetailCard([
                  _DetailRow(label: 'Name', value: tx.customer!.name),
                  _DetailRow(label: 'Email', value: tx.customer!.email),
                  if (tx.customer!.phone != null) _DetailRow(label: 'Phone', value: tx.customer!.phone!),
                ]),
              ],
              if (tx.metadata != null && tx.metadata!.isNotEmpty) ...[
                const SizedBox(height: 24),
                _buildSectionTitle('Metadata'),
                _buildDetailCard(
                  tx.metadata!.entries.map((e) => _DetailRow(label: e.key, value: e.value.toString())).toList(),
                ),
              ],
              const SizedBox(height: 40),
              if (tx.status == TransactionStatus.success)
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isRefunding ? null : () => _confirmRefund(tx),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.error.withOpacity(0.1),
                      foregroundColor: AppColors.error,
                      side: const BorderSide(color: AppColors.error),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    child: _isRefunding
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.error))
                        : const Text('Refund Transaction', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              const SizedBox(height: 24),
            ],
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (err, stack) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: AppColors.error),
                const SizedBox(height: 16),
                Text('Failed to load transaction', style: TextStyle(color: AppColors.text, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(err.toString(), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => ref.invalidate(transactionProvider(widget.transactionId)),
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeroHeader(Transaction tx) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: _getStatusColor(tx.status).withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(
            _getStatusIcon(tx.status),
            color: _getStatusColor(tx.status),
            size: 40,
          ),
        ),
        const SizedBox(height: 16),
        Hero(
          tag: 'amount_${tx.id}',
          child: Material(
            color: Colors.transparent,
            child: Text(
              '${tx.currency} ${tx.amount.toStringAsFixed(2)}',
              style: const TextStyle(
                color: AppColors.text,
                fontSize: 32,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          tx.status.name.toUpperCase(),
          style: TextStyle(
            color: _getStatusColor(tx.status),
            fontWeight: FontWeight.w600,
            letterSpacing: 1.2,
          ),
        ),
      ],
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          color: AppColors.muted,
          fontSize: 12,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.1,
        ),
      ),
    );
  }

  Widget _buildDetailCard(List<_DetailRow> rows) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: rows.asMap().entries.map((entry) {
          final index = entry.key;
          final row = entry.value;
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 2,
                      child: Text(row.label, style: const TextStyle(color: AppColors.muted, fontSize: 14)),
                    ),
                    Expanded(
                      flex: 3,
                      child: GestureDetector(
                        onLongPress: row.copyable
                            ? () {
                                Clipboard.setData(ClipboardData(text: row.value));
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('${row.label} copied to clipboard')),
                                );
                              }
                            : null,
                        child: Text(
                          row.value,
                          textAlign: TextAlign.right,
                          style: TextStyle(
                            color: row.valueColor ?? AppColors.text,
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (index < rows.length - 1)
                const Divider(height: 1, color: AppColors.border, indent: 16, endIndent: 16),
            ],
          );
        }).toList(),
      ),
    );
  }

  Color _getStatusColor(TransactionStatus status) {
    switch (status) {
      case TransactionStatus.success:
        return AppColors.success;
      case TransactionStatus.pending:
        return AppColors.warning;
      case TransactionStatus.failed:
        return AppColors.error;
      case TransactionStatus.refunded:
        return AppColors.muted;
    }
  }

  IconData _getStatusIcon(TransactionStatus status) {
    switch (status) {
      case TransactionStatus.success:
        return Icons.check_circle_rounded;
      case TransactionStatus.pending:
        return Icons.access_time_filled_rounded;
      case TransactionStatus.failed:
        return Icons.cancel_rounded;
      case TransactionStatus.refunded:
        return Icons.replay_rounded;
    }
  }
}

class _DetailRow {
  final String label;
  final String value;
  final Color? valueColor;
  final bool copyable;

  _DetailRow({
    required this.label,
    required this.value,
    this.valueColor,
    this.copyable = false,
  });
}
