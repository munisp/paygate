import 'package:flutter/material.dart';

class WebhookSimV2Screen extends StatelessWidget {
  const WebhookSimV2Screen({super.key});

  @override
  Widget build(BuildContext context) {
    final logs = [
      {'eventType': 'payment.completed', 'status': 'success', 'responseCode': '200', 'latencyMs': '145'},
      {'eventType': 'payout.initiated', 'status': 'failed', 'responseCode': '404', 'latencyMs': '89'},
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Webhook Simulator V2')),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: logs.length,
        itemBuilder: (context, index) {
          final log = logs[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              title: Text(log['eventType']!),
              subtitle: Text('${log['responseCode']} • ${log['latencyMs']}ms'),
              trailing: Chip(
                label: Text(log['status']!),
                backgroundColor: log['status'] == 'success'
                    ? Colors.green.shade100
                    : Colors.red.shade100,
              ),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {},
        label: const Text('Simulate Event'),
        icon: const Icon(Icons.play_arrow),
      ),
    );
  }
}
