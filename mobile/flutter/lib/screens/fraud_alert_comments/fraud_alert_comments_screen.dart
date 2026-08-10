import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Assuming a data structure for FraudAlertComment
class FraudAlertComment {
  final String id;
  String comment;
  String author;
  final DateTime createdAt;
  String status;
  double amount;
  String currency;

  FraudAlertComment({
    required this.id,
    required this.comment,
    required this.author,
    required this.createdAt,
    required this.status,
    required this.amount,
    required this.currency,
  });

  factory FraudAlertComment.fromJson(Map<String, dynamic> json) {
    return FraudAlertComment(
      id: json['id'],
      comment: json['comment'],
      author: json['author'],
      createdAt: DateTime.parse(json['createdAt']),
      status: json['status'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'comment': comment,
        'author': author,
        'createdAt': createdAt.toIso8601String(),
        'status': status,
        'amount': amount,
        'currency': currency,
      };
}

// Riverpod provider for fetching fraud alert comments
final fraudAlertCommentsProvider = FutureProvider.autoDispose<List<FraudAlertComment>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    // Simulate API call delay
    await Future.delayed(const Duration(seconds: 1));
    // Example tRPC call, adjust ROUTER.PROCEDURE as per actual API spec
    // final response = await api.get('/trpc/fraudAlerts.listComments');
    // For demonstration, returning dummy data if API call fails or returns empty
    // if (response == null || (response is List && response.isEmpty)) {
    //   return _generateDummyComments();
    // }
    // return (response as List).map((e) => FraudAlertComment.fromJson(e)).toList();
    return _generateDummyComments(); // Always return dummy data for now
  } catch (e) {
    print('Failed to load fraud alert comments: $e');
    // Return dummy data on error for demonstration, in production, rethrow or handle gracefully
    return _generateDummyComments();
  }
});

List<FraudAlertComment> _generateDummyComments() {
  return [
    FraudAlertComment(
      id: '1',
      comment: 'Suspicious activity detected on account XYZ. High-value transaction to an unusual recipient.',
      author: 'System',
      createdAt: DateTime.now().subtract(const Duration(days: 1)),
      status: 'Pending Review',
      amount: 1500.00,
      currency: 'USD',
    ),
    FraudAlertComment(
      id: '2',
      comment: 'User reported unauthorized transaction. Initiated chargeback process.',
      author: 'Agent A',
      createdAt: DateTime.now().subtract(const Duration(hours: 5)),
      status: 'Resolved',
      amount: 25000.00,
      currency: 'NGN',
    ),
    FraudAlertComment(
      id: '3',
      comment: 'Multiple failed login attempts from different geographical locations.',
      author: 'System',
      createdAt: DateTime.now().subtract(const Duration(days: 3, hours: 10)),
      status: 'Investigation',
      amount: 500.00,
      currency: 'USD',
    ),
    FraudAlertComment(
      id: '4',
      comment: 'Confirmed fraudulent transaction. Account locked and user notified.',
      author: 'Agent B',
      createdAt: DateTime.now().subtract(const Duration(minutes: 30)),
      status: 'Resolved',
      amount: 100000.00,
      currency: 'NGN',
    ),
    FraudAlertComment(
      id: '5',
      comment: 'Customer dispute regarding recent purchase. Awaiting more information.',
      author: 'Agent C',
      createdAt: DateTime.now().subtract(const Duration(days: 2)),
      status: 'Pending Review',
      amount: 75.50,
      currency: 'USD',
    ),
  ];
}

class FraudAlertCommentsScreen extends ConsumerStatefulWidget {
  const FraudAlertCommentsScreen({super.key});

  @override
  ConsumerState<FraudAlertCommentsScreen> createState() => _FraudAlertCommentsScreenState();
}

class _FraudAlertCommentsScreenState extends ConsumerState<FraudAlertCommentsScreen> {
  final Color _backgroundColor = const Color(0xFF0f172a);
  final Color _cardColor = const Color(0xFF1e293b);
  final Color _textColor = const Color(0xFFf1f5f9);
  final Color _accentColor = const Color(0xFF6366f1);

  final TextEditingController _searchController = TextEditingController();
  String? _selectedStatusFilter; // For status filtering

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      // Rebuild the widget to apply search filter
      setState(() {});
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshComments() async {
    ref.invalidate(fraudAlertCommentsProvider);
    await ref.read(fraudAlertCommentsProvider.future);
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Pending Review':
        return Colors.orange;
      case 'Resolved':
        return Colors.green;
      case 'Investigation':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  String _formatCurrency(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$');
    return format.format(amount);
  }

  Future<void> _showCommentDialog({
    FraudAlertComment? comment,
    required Function(FraudAlertComment) onSave,
  }) async {
    final isEditing = comment != null;
    final TextEditingController commentController = TextEditingController(text: comment?.comment);
    final TextEditingController authorController = TextEditingController(text: comment?.author);
    final TextEditingController amountController = TextEditingController(text: comment?.amount.toString());
    String? selectedStatus = comment?.status ?? 'Pending Review';
    String? selectedCurrency = comment?.currency ?? 'USD';

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text(isEditing ? 'Edit Comment' : 'Add New Comment', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: commentController,
                  style: TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Comment',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  maxLines: 3,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: authorController,
                  style: TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Author',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: amountController,
                  style: TextStyle(color: _textColor),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: _cardColor,
                  style: TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: <String>['Pending Review', 'Resolved', 'Investigation']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value, style: TextStyle(color: _textColor)),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      selectedStatus = newValue;
                    }
                  },
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: _cardColor,
                  style: TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: <String>['USD', 'NGN']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value, style: TextStyle(color: _textColor)),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      selectedCurrency = newValue;
                    }
                  },
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
              onPressed: () {
                final newComment = FraudAlertComment(
                  id: comment?.id ?? DateTime.now().millisecondsSinceEpoch.toString(),
                  comment: commentController.text,
                  author: authorController.text,
                  createdAt: comment?.createdAt ?? DateTime.now(),
                  status: selectedStatus!,
                  amount: double.tryParse(amountController.text) ?? 0.0,
                  currency: selectedCurrency!,
                );
                onSave(newComment);
                Navigator.of(dialogContext).pop();
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _addComment() async {
    await _showCommentDialog(
      onSave: (newComment) async {
        final api = ref.read(apiServiceProvider);
        try {
          // await api.post('/trpc/fraudAlerts.createComment', body: newComment.toJson());
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Comment added successfully!')), // Placeholder
          );
          _refreshComments();
        } catch (e) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to add comment: $e')),
          );
        }
      },
    );
  }

  Future<void> _editComment(FraudAlertComment comment) async {
    await _showCommentDialog(
      comment: comment,
      onSave: (updatedComment) async {
        final api = ref.read(apiServiceProvider);
        try {
          // await api.post('/trpc/fraudAlerts.updateComment', body: updatedComment.toJson());
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Comment updated successfully!')), // Placeholder
          );
          _refreshComments();
        } catch (e) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to update comment: $e')),
          );
        }
      },
    );
  }

  Future<void> _deleteComment(String commentId) async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Confirm Delete', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete this comment?', style: TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop(false);
              },
            ),
            TextButton(
              child: Text('Delete', style: TextStyle(color: Colors.red)),
              onPressed: () {
                Navigator.of(dialogContext).pop(true);
              },
            ),
          ],
        );
      },
    );

    if (confirm == true) {
      final api = ref.read(apiServiceProvider);
      try {
        // await api.post('/trpc/fraudAlerts.deleteComment', body: {'id': commentId});
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Comment deleted successfully!')), // Placeholder
        );
        _refreshComments();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete comment: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final fraudAlertCommentsAsyncValue = ref.watch(fraudAlertCommentsProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: Text(
          'Fraud Alert Comments',
          style: TextStyle(color: _textColor),
        ),
        backgroundColor: _cardColor,
        iconTheme: IconThemeData(color: _textColor),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              style: TextStyle(color: _textColor),
              decoration: InputDecoration(
                hintText: 'Search comments...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8.0),
            child: DropdownButtonFormField<String>(
              value: _selectedStatusFilter,
              decoration: InputDecoration(
                hintText: 'Filter by Status',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              dropdownColor: _cardColor,
              style: TextStyle(color: _textColor),
              items: <String>['All', 'Pending Review', 'Resolved', 'Investigation']
                  .map<DropdownMenuItem<String>>((String value) {
                return DropdownMenuItem<String>(
                  value: value == 'All' ? null : value,
                  child: Text(value, style: TextStyle(color: _textColor)),
                );
              }).toList(),
              onChanged: (String? newValue) {
                setState(() {
                  _selectedStatusFilter = newValue;
                });
              },
            ),
          ),
          Expanded(
            child: fraudAlertCommentsAsyncValue.when(
              loading: () => Center(
                child: CircularProgressIndicator(color: _accentColor),
              ),
              error: (err, stack) => Center(
                child: Text(
                  'Error: ${err.toString()}',
                  style: TextStyle(color: _textColor),
                ),
              ),
              data: (comments) {
                if (comments.isEmpty) {
                  return Center(
                    child: Text(
                      'No fraud alert comments found.',
                      style: TextStyle(color: _textColor),
                    ),
                  );
                }

                final filteredComments = comments.where((comment) {
                  final matchesSearch = _searchController.text.isEmpty ||
                      comment.comment.toLowerCase().contains(_searchController.text.toLowerCase()) ||
                      comment.author.toLowerCase().contains(_searchController.text.toLowerCase());
                  final matchesStatus = _selectedStatusFilter == null ||
                      comment.status == _selectedStatusFilter;
                  return matchesSearch && matchesStatus;
                }).toList();

                if (filteredComments.isEmpty) {
                  return Center(
                    child: Text(
                      'No matching fraud alert comments found.',
                      style: TextStyle(color: _textColor),
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: _refreshComments,
                  color: _accentColor,
                  backgroundColor: _cardColor,
                  child: ListView.builder(
                    itemCount: filteredComments.length,
                    itemBuilder: (context, index) {
                      final comment = filteredComments[index];
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.all(8.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      comment.comment,
                                      style: TextStyle(color: _textColor, fontSize: 16, fontWeight: FontWeight.bold),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(comment.status),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      comment.status,
                                      style: const TextStyle(color: Colors.white, fontSize: 12),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Author: ${comment.author}',
                                style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 14),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Amount: ${_formatCurrency(comment.amount, comment.currency)}',
                                style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 14),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Date: ${DateFormat('yyyy-MM-dd HH:mm').format(comment.createdAt.toLocal())}',
                                style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 14),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  TextButton(
                                    onPressed: () => _editComment(comment),
                                    child: Text('Edit', style: TextStyle(color: _accentColor)),
                                  ),
                                  const SizedBox(width: 8),
                                  TextButton(
                                    onPressed: () => _deleteComment(comment.id),
                                    child: Text('Delete', style: TextStyle(color: Colors.red)),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _addComment,
        backgroundColor: _accentColor,
        child: Icon(Icons.add, color: _textColor),
      ),
    );
  }
}
