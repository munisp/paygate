import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Data model for a Go-Live Checklist Item
class GoLiveChecklistItem {
  final String id;
  final String title;
  final String description;
  final bool isCompleted;

  GoLiveChecklistItem({
    required this.id,
    required this.title,
    required this.description,
    required this.isCompleted,
  });

  factory GoLiveChecklistItem.fromJson(Map<String, dynamic> json) {
    return GoLiveChecklistItem(
      id: json['id'],
      title: json['title'],
      description: json['description'],
      isCompleted: json['isCompleted'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'description': description,
        'isCompleted': isCompleted,
      };
}

// State for the Go-Live Checklist
class GoLiveChecklistState {
  final List<GoLiveChecklistItem> items;
  final bool isLoading;
  final String? error;
  final String searchQuery;

  GoLiveChecklistState({
    this.items = const [],
    this.isLoading = false,
    this.error,
    this.searchQuery = '',
  });

  GoLiveChecklistState copyWith({
    List<GoLiveChecklistItem>? items,
    bool? isLoading,
    String? error,
    String? searchQuery,
  }) {
    return GoLiveChecklistState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
      searchQuery: searchQuery ?? this.searchQuery,
    );
  }
}

// StateNotifier for managing the Go-Live Checklist
class GoLiveChecklistNotifier extends StateNotifier<GoLiveChecklistState> {
  final ApiService api;

  GoLiveChecklistNotifier(this.api) : super(GoLiveChecklistState()) {
    fetchChecklistItems();
  }

  Future<void> fetchChecklistItems() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await api.get(
        '/trpc/goLive.listChecklistItems',
        params: {},
      );
      final List<GoLiveChecklistItem> items = (
        response as List
      ).map((item) => GoLiveChecklistItem.fromJson(item)).toList();
      state = state.copyWith(items: items, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
  }

  Future<void> createChecklistItem(String title, String description) async {
    try {
      state = state.copyWith(isLoading: true);
      await api.post(
        '/trpc/goLive.createChecklistItem',
        body: {'title': title, 'description': description, 'isCompleted': false},
      );
      await fetchChecklistItems(); // Refresh list after creation
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> updateChecklistItem(GoLiveChecklistItem item) async {
    try {
      state = state.copyWith(isLoading: true);
      await api.post(
        '/trpc/goLive.updateChecklistItem',
        body: item.toJson(),
      );
      await fetchChecklistItems(); // Refresh list after update
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> deleteChecklistItem(String id) async {
    try {
      state = state.copyWith(isLoading: true);
      await api.post(
        '/trpc/goLive.deleteChecklistItem',
        body: {'id': id},
      );
      await fetchChecklistItems(); // Refresh list after deletion
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

final goLiveChecklistProvider = StateNotifierProvider<
    GoLiveChecklistNotifier, GoLiveChecklistState>((ref) {
  return GoLiveChecklistNotifier(ref.read(apiServiceProvider));
});

class GoLiveChecklistScreen extends ConsumerStatefulWidget {
  const GoLiveChecklistScreen({super.key});

  @override
  ConsumerState<GoLiveChecklistScreen> createState() => _GoLiveChecklistScreenState();
}

class _GoLiveChecklistScreenState extends ConsumerState<GoLiveChecklistScreen> {
  bool _isSearching = false;
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(goLiveChecklistProvider.notifier).setSearchQuery(_searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final Color backgroundColor = Color(0xFF0f172a);
    final Color cardColor = Color(0xFF1e293b);
    final Color textColor = Color(0xFFf1f5f9);
    final Color accentColor = Color(0xFF6366f1);

    final checklistState = ref.watch(goLiveChecklistProvider);

    // Filter items based on search query
    final filteredItems = checklistState.items.where((item) {
      final query = checklistState.searchQuery.toLowerCase();
      return item.title.toLowerCase().contains(query) ||
             item.description.toLowerCase().contains(query);
    }).toList();

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: _isSearching
            ? TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search checklist items...',
                  hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  border: InputBorder.none,
                ),
                style: TextStyle(color: textColor),
              )
            : Text(
                'Go-Live Checklist',
                style: TextStyle(color: textColor),
              ),
        backgroundColor: cardColor,
        iconTheme: IconThemeData(color: textColor), // For back button icon
        actions: [
          IconButton(
            icon: Icon(_isSearching ? Icons.close : Icons.search, color: textColor),
            onPressed: () {
              setState(() {
                _isSearching = !_isSearching;
                if (!_isSearching) {
                  _searchController.clear();
                  ref.read(goLiveChecklistProvider.notifier).setSearchQuery('');
                }
              });
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(goLiveChecklistProvider.notifier).fetchChecklistItems(),
        color: accentColor,
        backgroundColor: cardColor,
        child: Builder(
          builder: (context) {
            if (checklistState.isLoading) {
              return Center(
                child: CircularProgressIndicator(color: accentColor),
              );
            } else if (checklistState.error != null) {
              return Center(
                child: Text(
                  'Error: ${checklistState.error}',
                  style: TextStyle(color: textColor),
                ),
              );
            } else if (filteredItems.isEmpty) {
              return Center(
                child: Text(
                  'No checklist items found.',
                  style: TextStyle(color: textColor),
                ),
              );
            } else {
              return ListView.builder(
                itemCount: filteredItems.length,
                itemBuilder: (context, index) {
                  final item = filteredItems[index];
                  return Card(
                    color: cardColor,
                    margin: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title,
                            style: TextStyle(
                              color: textColor,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            item.description,
                            style: TextStyle(color: textColor.withOpacity(0.7)),
                          ),
                          SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    item.isCompleted ? Icons.check_circle : Icons.radio_button_unchecked,
                                    color: item.isCompleted ? Colors.green : textColor.withOpacity(0.7),
                                  ),
                                  SizedBox(width: 8),
                                  Text(
                                    item.isCompleted ? 'Completed' : 'Pending',
                                    style: TextStyle(
                                      color: item.isCompleted ? Colors.green : textColor.withOpacity(0.7),
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                              Row(
                                children: [
                                  IconButton(
                                    icon: Icon(Icons.edit, color: accentColor),
                                    onPressed: () {
                                      _showEditChecklistItemDialog(context, item);
                                    },
                                  ),
                                  IconButton(
                                    icon: Icon(Icons.delete, color: Colors.redAccent),
                                    onPressed: () {
                                      _showDeleteConfirmationDialog(context, item);
                                    },
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            }
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showCreateChecklistItemDialog(context);
        },
        backgroundColor: accentColor,
        child: Icon(Icons.add, color: textColor),
      ),
    );
  }

  void _showCreateChecklistItemDialog(BuildContext context) {
    final TextEditingController _titleController = TextEditingController();
    final TextEditingController _descriptionController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: Color(0xFF1e293b),
          title: Text('Create New Checklist Item', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _titleController,
                decoration: InputDecoration(
                  labelText: 'Title',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFF6366f1)),
                  ),
                ),
                style: TextStyle(color: Color(0xFFf1f5f9)),
              ),
              SizedBox(height: 16),
              TextField(
                controller: _descriptionController,
                decoration: InputDecoration(
                  labelText: 'Description',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: BorderSide(color: Color(0xFF6366f1)),
                  ),
                ),
                style: TextStyle(color: Color(0xFFf1f5f9)),
                maxLines: 3,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
            ),
            ElevatedButton(
              onPressed: () {
                ref.read(goLiveChecklistProvider.notifier).createChecklistItem(
                  _titleController.text,
                  _descriptionController.text,
                );
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Color(0xFF6366f1)),
              child: Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showEditChecklistItemDialog(BuildContext context, GoLiveChecklistItem item) {
    final TextEditingController _titleController = TextEditingController(text: item.title);
    final TextEditingController _descriptionController = TextEditingController(text: item.description);
    bool _isCompleted = item.isCompleted;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: Color(0xFF1e293b),
              title: Text('Edit Checklist Item', style: TextStyle(color: Color(0xFFf1f5f9))),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: _titleController,
                    decoration: InputDecoration(
                      labelText: 'Title',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                      enabledBorder: OutlineInputBorder(
                        borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderSide: BorderSide(color: Color(0xFF6366f1)),
                      ),
                    ),
                    style: TextStyle(color: Color(0xFFf1f5f9)),
                  ),
                  SizedBox(height: 16),
                  TextField(
                    controller: _descriptionController,
                    decoration: InputDecoration(
                      labelText: 'Description',
                      labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                      enabledBorder: OutlineInputBorder(
                        borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderSide: BorderSide(color: Color(0xFF6366f1)),
                      ),
                    ),
                    style: TextStyle(color: Color(0xFFf1f5f9)),
                    maxLines: 3,
                  ),
                  SizedBox(height: 16),
                  Row(
                    children: [
                      Text('Completed:', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
                      Checkbox(
                        value: _isCompleted,
                        onChanged: (bool? newValue) {
                          setState(() {
                            _isCompleted = newValue ?? false;
                          });
                        },
                        activeColor: Color(0xFF6366f1),
                        checkColor: Color(0xFFf1f5f9),
                      ),
                    ],
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                  child: Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
                ),
                ElevatedButton(
                  onPressed: () {
                    final updatedItem = GoLiveChecklistItem(
                      id: item.id,
                      title: _titleController.text,
                      description: _descriptionController.text,
                      isCompleted: _isCompleted,
                    );
                    ref.read(goLiveChecklistProvider.notifier).updateChecklistItem(updatedItem);
                    Navigator.of(context).pop();
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: Color(0xFF6366f1)),
                  child: Text('Save', style: TextStyle(color: Color(0xFFf1f5f9))),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, GoLiveChecklistItem item) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: Color(0xFF1e293b),
          title: Text('Delete Checklist Item', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete "${item.title}"?',
              style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
            ),
            ElevatedButton(
              onPressed: () {
                ref.read(goLiveChecklistProvider.notifier).deleteChecklistItem(item.id);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }
}
