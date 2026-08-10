import 'package:flutter/material.dart';
import '../../../services/api_service.dart';

class QRPaymentsScreen extends StatefulWidget {
  const QRPaymentsScreen({Key? key}) : super(key: key);

  @override
  State<QRPaymentsScreen> createState() => _QRPaymentsScreenState();
}

class _QRPaymentsScreenState extends State<QRPaymentsScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _data = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      setState(() { _isLoading = true; _error = null; });
      // TODO: wire to real API endpoint
      await Future.delayed(const Duration(milliseconds: 500));
      setState(() { _data = []; _isLoading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _isLoading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('QR Payments', style: TextStyle(color: Colors.white)),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1)))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_error!, style: const TextStyle(color: Color(0xFFf87171))),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadData,
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _data.isEmpty
                  ? const Center(
                      child: Text('No data available.',
                          style: TextStyle(color: Color(0xFF64748b))),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        itemCount: _data.length,
                        itemBuilder: (context, index) {
                          final item = _data[index];
                          return Card(
                            color: const Color(0xFF1e293b),
                            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                            child: ListTile(
                              title: Text(item['id']?.toString() ?? 'Item',
                                  style: const TextStyle(color: Colors.white)),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
