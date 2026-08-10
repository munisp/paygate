import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class MainShell extends StatelessWidget {
  final Widget child;
  const MainShell({super.key, required this.child});

  static const _tabs = [
    _TabItem(path: '/dashboard', icon: Icons.dashboard_rounded, label: 'Dashboard'),
    _TabItem(path: '/transactions', icon: Icons.receipt_long_rounded, label: 'Transactions'),
    _TabItem(path: '/payouts', icon: Icons.send_rounded, label: 'Payouts'),
    _TabItem(path: '/analytics', icon: Icons.bar_chart_rounded, label: 'Analytics'),
    _TabItem(path: '/virtual-cards', icon: Icons.credit_card_rounded, label: 'Cards'),
    _TabItem(path: '/disputes', icon: Icons.warning_amber_rounded, label: 'Disputes'),
    _TabItem(path: '/notifications', icon: Icons.notifications_rounded, label: 'Alerts'),
    _TabItem(path: '/settings', icon: Icons.settings_rounded, label: 'Settings'),
    _TabItem(path: '/webhooks', icon: Icons.webhook_rounded, label: 'Webhooks'),
  ];

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    for (int i = 0; i < _tabs.length; i++) {
      if (location.startsWith(_tabs[i].path)) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final currentIndex = _currentIndex(context);

    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0xFF334155), width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: currentIndex,
          onTap: (i) => context.go(_tabs[i].path),
          type: BottomNavigationBarType.fixed,
          backgroundColor: const Color(0xFF0f172a),
          selectedItemColor: const Color(0xFF6366f1),
          unselectedItemColor: const Color(0xFF64748b),
          selectedLabelStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
          unselectedLabelStyle: const TextStyle(fontSize: 10),
          items: _tabs.map((t) => BottomNavigationBarItem(
            icon: Icon(t.icon),
            label: t.label,
          )).toList(),
        ),
      ),
    );
  }
}

class _TabItem {
  final String path;
  final IconData icon;
  final String label;
  const _TabItem({required this.path, required this.icon, required this.label});
}
