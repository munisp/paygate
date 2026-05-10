
import 'package:flutter/material.dart';

class LoyaltyRedemptionScreen extends StatefulWidget {
  const LoyaltyRedemptionScreen({super.key});
  @override
  State<LoyaltyRedemptionScreen> createState() => _LoyaltyRedemptionScreenState();
}

class _LoyaltyRedemptionScreenState extends State<LoyaltyRedemptionScreen> {
  final int _balance = 12500;
  final String _tier = 'Gold';
  Map<String, dynamic>? _selectedReward;
  final _pinController = TextEditingController();

  final List<Map<String, dynamic>> _rewards = [
    {'id': '1', 'name': 'Free Transfer', 'points': 500, 'category': 'banking'},
    {'id': '2', 'name': '\u20a61,000 Airtime', 'points': 1000, 'category': 'telecom'},
    {'id': '3', 'name': 'Premium Subscription', 'points': 5000, 'category': 'subscription'},
    {'id': '4', 'name': 'Cash Bonus \u20a6500', 'points': 2500, 'category': 'cash'},
  ];

  void _initiateRedemption(Map<String, dynamic> reward) {
    if (_balance < reward['points']) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Insufficient points balance')),
      );
      return;
    }
    setState(() => _selectedReward = reward);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Enter PIN'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Confirm redemption of \${reward['name']}'),
            const SizedBox(height: 16),
            TextField(
              controller: _pinController,
              obscureText: true,
              keyboardType: TextInputType.number,
              maxLength: 4,
              textAlign: TextAlign.center,
              decoration: const InputDecoration(hintText: '4-digit PIN'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('\${reward['name']} redeemed! Kafka event published.')),
              );
              _pinController.clear();
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Loyalty Redemption')),
      body: Column(
        children: [
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.amber.shade700, Colors.amber.shade400],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('\$_tier Member', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    Text('\$_balance pts', style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                    const Text('Available balance', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  ],
                ),
                const Icon(Icons.star, color: Colors.white, size: 48),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _rewards.length,
              itemBuilder: (ctx, i) {
                final reward = _rewards[i];
                final canAfford = _balance >= reward['points'];
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.card_giftcard, color: Colors.amber),
                    title: Text(reward['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('\${reward['points']} points • \${reward['category']}'),
                    trailing: ElevatedButton(
                      onPressed: canAfford ? () => _initiateRedemption(reward) : null,
                      child: const Text('Redeem'),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }
}
