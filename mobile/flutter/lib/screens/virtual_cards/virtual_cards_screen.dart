import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

// Note: In a production environment, these models and services would be imported from their respective files.
// For the purpose of this self-contained file, they are defined or mocked below.

class VirtualCard {
  final String id;
  final String label;
  final String cardNumber; // Masked
  final double balance;
  final String currency;
  final String status; // 'active', 'frozen', 'terminated'
  final String expiryDate;
  final double spendingLimit;

  VirtualCard({
    required this.id,
    required this.label,
    required this.cardNumber,
    required this.balance,
    required this.currency,
    required this.status,
    required this.expiryDate,
    required this.spendingLimit,
  });
}

class CardTransaction {
  final String id;
  final String description;
  final double amount;
  final String currency;
  final DateTime timestamp;
  final String status;

  CardTransaction({
    required this.id,
    required this.description,
    required this.amount,
    required this.currency,
    required this.timestamp,
    required this.status,
  });
}

abstract class ApiService {
  Future<List<VirtualCard>> getVirtualCards();
  Future<VirtualCard> createVirtualCard(String label, double limit, String currency);
  Future<void> freezeCard(String cardId);
  Future<void> unfreezeCard(String cardId);
  Future<void> terminateCard(String cardId);
  Future<List<CardTransaction>> getCardTransactions(String cardId);
}

// Provider for the ApiService - should be overridden in the app's ProviderScope
final apiServiceProvider = Provider<ApiService>((ref) => throw UnimplementedError());

// State Provider for the cards list
final virtualCardsProvider = FutureProvider.autoDispose<List<VirtualCard>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  return await api.getVirtualCards();
});

// State Provider for transactions of a specific card
final cardTransactionsProvider = FutureProvider.family.autoDispose<List<CardTransaction>, String>((ref, cardId) async {
  final api = ref.watch(apiServiceProvider);
  return await api.getCardTransactions(cardId);
});

class VirtualCardsScreen extends ConsumerStatefulWidget {
  const VirtualCardsScreen({super.key});

  @override
  ConsumerState<VirtualCardsScreen> createState() => _VirtualCardsScreenState();
}

class _VirtualCardsScreenState extends ConsumerState<VirtualCardsScreen> {
  // Theme Constants
  final Color _bgColor = const Color(0xFF0F172A);
  final Color _surfaceColor = const Color(0xFF1E293B);
  final Color _borderColor = const Color(0xFF334155);
  final Color _primaryColor = const Color(0xFF3B82F6);
  final Color _textColor = const Color(0xFFF1F5F9);
  final Color _mutedColor = const Color(0xFF94A3B8);
  final Color _errorColor = const Color(0xFFEF4444);
  final Color _successColor = const Color(0xFF10B981);

  @override
  Widget build(BuildContext context) {
    final cardsAsync = ref.watch(virtualCardsProvider);

    return Scaffold(
      backgroundColor: _bgColor,
      appBar: AppBar(
        backgroundColor: _bgColor,
        elevation: 0,
        title: Text(
          'Virtual Cards',
          style: TextStyle(color: _textColor, fontWeight: FontWeight.bold),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: _borderColor, height: 1),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(virtualCardsProvider.future),
        color: _primaryColor,
        backgroundColor: _surfaceColor,
        child: cardsAsync.when(
          data: (cards) => cards.isEmpty ? _buildEmptyState() : _buildCardsList(cards),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, stack) => _buildErrorState(err.toString()),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateCardSheet(context),
        backgroundColor: _primaryColor,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.credit_card_off_outlined, size: 64, color: _mutedColor),
          const SizedBox(height: 16),
          Text(
            'No virtual cards found',
            style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            'Create your first card to start spending',
            style: TextStyle(color: _mutedColor),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(String error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: _errorColor),
            const SizedBox(height: 16),
            Text(
              'Failed to load cards',
              style: TextStyle(color: _textColor, fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              error,
              textAlign: TextAlign.center,
              style: TextStyle(color: _mutedColor),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => ref.refresh(virtualCardsProvider),
              style: ElevatedButton.styleFrom(backgroundColor: _primaryColor),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCardsList(List<VirtualCard> cards) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: cards.length,
      separatorBuilder: (context, index) => const SizedBox(height: 16),
      itemBuilder: (context, index) {
        final card = cards[index];
        return _CardWidget(
          card: card,
          onTap: () => _showCardDetails(context, card),
          onToggleFreeze: () => _toggleFreeze(card),
          onTerminate: () => _confirmTerminate(card),
          theme: {
            'surface': _surfaceColor,
            'border': _borderColor,
            'primary': _primaryColor,
            'text': _textColor,
            'muted': _mutedColor,
            'error': _errorColor,
            'success': _successColor,
          },
        );
      },
    );
  }

  void _showCreateCardSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: _surfaceColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => _CreateCardSheet(
        onCreated: (label, limit, currency) async {
          try {
            await ref.read(apiServiceProvider).createVirtualCard(label, limit, currency);
            ref.invalidate(virtualCardsProvider);
            if (mounted) Navigator.pop(context);
            _showSnackBar('Card created successfully', _successColor);
          } catch (e) {
            _showSnackBar('Failed to create card: $e', _errorColor);
          }
        },
        theme: {
          'bg': _bgColor,
          'surface': _surfaceColor,
          'border': _borderColor,
          'primary': _primaryColor,
          'text': _textColor,
          'muted': _mutedColor,
        },
      ),
    );
  }

  void _showCardDetails(BuildContext context, VirtualCard card) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: _bgColor,
      useSafeArea: true,
      builder: (context) => _CardDetailsSheet(
        card: card,
        theme: {
          'bg': _bgColor,
          'surface': _surfaceColor,
          'border': _borderColor,
          'primary': _primaryColor,
          'text': _textColor,
          'muted': _mutedColor,
          'error': _errorColor,
          'success': _successColor,
        },
      ),
    );
  }

  Future<void> _toggleFreeze(VirtualCard card) async {
    try {
      final api = ref.read(apiServiceProvider);
      if (card.status == 'active') {
        await api.freezeCard(card.id);
        _showSnackBar('Card frozen', _mutedColor);
      } else {
        await api.unfreezeCard(card.id);
        _showSnackBar('Card unfrozen', _successColor);
      }
      ref.invalidate(virtualCardsProvider);
    } catch (e) {
      _showSnackBar('Operation failed: $e', _errorColor);
    }
  }

  void _confirmTerminate(VirtualCard card) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _surfaceColor,
        title: Text('Terminate Card', style: TextStyle(color: _textColor)),
        content: Text(
          'Are you sure you want to terminate "${card.label}"? This action cannot be undone.',
          style: TextStyle(color: _mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel', style: TextStyle(color: _mutedColor)),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              try {
                await ref.read(apiServiceProvider).terminateCard(card.id);
                ref.invalidate(virtualCardsProvider);
                _showSnackBar('Card terminated', _errorColor);
              } catch (e) {
                _showSnackBar('Failed to terminate: $e', _errorColor);
              }
            },
            child: Text('Terminate', style: TextStyle(color: _errorColor)),
          ),
        ],
      ),
    );
  }

  void _showSnackBar(String message, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

class _CardWidget extends StatelessWidget {
  final VirtualCard card;
  final VoidCallback onTap;
  final VoidCallback onToggleFreeze;
  final VoidCallback onTerminate;
  final Map<String, Color> theme;

  const _CardWidget({
    required this.card,
    required this.onTap,
    required this.onToggleFreeze,
    required this.onTerminate,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    final bool isFrozen = card.status == 'frozen';
    final bool isTerminated = card.status == 'terminated';

    return GestureDetector(
      onTap: isTerminated ? null : onTap,
      child: Opacity(
        opacity: isTerminated ? 0.6 : 1.0,
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: theme['surface'],
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme['border']!),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          card.label,
                          style: TextStyle(
                            color: theme['text'],
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          card.cardNumber,
                          style: TextStyle(color: theme['muted'], letterSpacing: 2),
                        ),
                      ],
                    ),
                  ),
                  _StatusBadge(status: card.status, theme: theme),
                ],
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Balance', style: TextStyle(color: theme['muted'], fontSize: 12)),
                      Text(
                        '${card.currency} ${card.balance.toStringAsFixed(2)}',
                        style: TextStyle(
                          color: theme['text'],
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('Expiry', style: TextStyle(color: theme['muted'], fontSize: 12)),
                      Text(
                        card.expiryDate,
                        style: TextStyle(color: theme['text'], fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ],
              ),
              if (!isTerminated) ...[
                const SizedBox(height: 16),
                const Divider(color: Color(0xFF334155)),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton.icon(
                      onPressed: onToggleFreeze,
                      icon: Icon(isFrozen ? Icons.ac_unit : Icons.pause, size: 18),
                      label: Text(isFrozen ? 'Unfreeze' : 'Freeze'),
                      style: TextButton.styleFrom(foregroundColor: isFrozen ? theme['success'] : theme['primary']),
                    ),
                    const SizedBox(width: 8),
                    TextButton.icon(
                      onPressed: onTerminate,
                      icon: const Icon(Icons.delete_outline, size: 18),
                      label: const Text('Terminate'),
                      style: TextButton.styleFrom(foregroundColor: theme['error']),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  final Map<String, Color> theme;

  const _StatusBadge({required this.status, required this.theme});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case 'active':
        color = theme['success']!;
        break;
      case 'frozen':
        color = Colors.orange;
        break;
      default:
        color = theme['error']!;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _CreateCardSheet extends StatefulWidget {
  final Function(String, double, String) onCreated;
  final Map<String, Color> theme;

  const _CreateCardSheet({required this.onCreated, required this.theme});

  @override
  State<_CreateCardSheet> createState() => _CreateCardSheetState();
}

class _CreateCardSheetState extends State<_CreateCardSheet> {
  final _formKey = GlobalKey<FormState>();
  final _labelController = TextEditingController();
  final _limitController = TextEditingController();
  String _selectedCurrency = 'USD';
  bool _isSubmitting = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
        left: 24,
        right: 24,
        top: 24,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Create Virtual Card',
              style: TextStyle(
                color: widget.theme['text'],
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 24),
            _buildTextField(
              controller: _labelController,
              label: 'Card Label',
              hint: 'e.g. Marketing Ads',
              validator: (v) => v == null || v.isEmpty ? 'Label is required' : null,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: _buildTextField(
                    controller: _limitController,
                    label: 'Spending Limit',
                    hint: '0.00',
                    keyboardType: TextInputType.number,
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Required';
                      if (double.tryParse(v) == null) return 'Invalid number';
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Currency', style: TextStyle(color: widget.theme['muted'], fontSize: 12)),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color: widget.theme['bg'],
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: widget.theme['border']!),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _selectedCurrency,
                            dropdownColor: widget.theme['surface'],
                            style: TextStyle(color: widget.theme['text']),
                            items: ['USD', 'EUR', 'GBP'].map((c) {
                              return DropdownMenuItem(value: c, child: Text(c));
                            }).toList(),
                            onChanged: (v) => setState(() => _selectedCurrency = v!),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _isSubmitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: widget.theme['primary'],
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: _isSubmitting
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Create Card', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: widget.theme['muted'], fontSize: 12)),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          validator: validator,
          style: TextStyle(color: widget.theme['text']),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: widget.theme['muted']?.withOpacity(0.5)),
            filled: true,
            fillColor: widget.theme['bg'],
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: widget.theme['border']!),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: widget.theme['border']!),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: widget.theme['primary']!),
            ),
          ),
        ),
      ],
    );
  }

  void _submit() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isSubmitting = true);
      await widget.onCreated(
        _labelController.text,
        double.parse(_limitController.text),
        _selectedCurrency,
      );
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}

class _CardDetailsSheet extends ConsumerWidget {
  final VirtualCard card;
  final Map<String, Color> theme;

  const _CardDetailsSheet({required this.card, required this.theme});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final transactionsAsync = ref.watch(cardTransactionsProvider(card.id));

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: theme['bg'],
            border: Border(bottom: BorderSide(color: theme['border']!)),
          ),
          child: Row(
            children: [
              IconButton(
                icon: Icon(Icons.close, color: theme['text']),
                onPressed: () => Navigator.pop(context),
              ),
              const SizedBox(width: 8),
              Text(
                'Card Details',
                style: TextStyle(color: theme['text'], fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
        Expanded(
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: _CardWidget(
                    card: card,
                    onTap: () {},
                    onToggleFreeze: () {},
                    onTerminate: () {},
                    theme: theme,
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 8.0),
                  child: Text(
                    'Transaction History',
                    style: TextStyle(color: theme['text'], fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
              transactionsAsync.when(
                data: (txs) => txs.isEmpty
                    ? SliverFillRemaining(
                        hasScrollBody: false,
                        child: Center(
                          child: Text('No transactions yet', style: TextStyle(color: theme['muted'])),
                        ),
                      )
                    : SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => _TransactionTile(transaction: txs[index], theme: theme),
                          childCount: txs.length,
                        ),
                      ),
                loading: () => const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (err, _) => SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: Text('Error: $err', style: TextStyle(color: theme['error']))),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TransactionTile extends StatelessWidget {
  final CardTransaction transaction;
  final Map<String, Color> theme;

  const _TransactionTile({required this.transaction, required this.theme});

  @override
  Widget build(BuildContext context) {
    final isNegative = transaction.amount < 0;
    final dateStr = DateFormat('MMM dd, yyyy • HH:mm').format(transaction.timestamp);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme['surface'],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme['border']!),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: theme['bg'],
              shape: BoxShape.circle,
            ),
            child: Icon(
              isNegative ? Icons.shopping_bag_outlined : Icons.account_balance_wallet_outlined,
              color: theme['primary'],
              size: 20,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  transaction.description,
                  style: TextStyle(color: theme['text'], fontWeight: FontWeight.w600),
                ),
                Text(
                  dateStr,
                  style: TextStyle(color: theme['muted'], fontSize: 12),
                ),
              ],
            ),
          ),
          Text(
            '${isNegative ? '-' : '+'}${transaction.currency} ${transaction.amount.abs().toStringAsFixed(2)}',
            style: TextStyle(
              color: isNegative ? theme['text'] : theme['success'],
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
