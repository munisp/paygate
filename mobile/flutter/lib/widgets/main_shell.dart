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
    _TabItem(path: '/settings', icon: Icons.settings_rounded, label: 'Settings'),
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
