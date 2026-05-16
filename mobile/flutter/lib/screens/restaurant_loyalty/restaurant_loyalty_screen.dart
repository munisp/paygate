import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Theme Colors
const Color kBackgroundColor = Color(0xFF0f172a);
const Color kCardColor = Color(0xFF1e293b);
const Color kTextColor = Color(0xFFf1f5f9);
const Color kAccentColor = Color(0xFF6366f1);

// Dummy Loyalty Program Model (replace with actual tRPC model)
class LoyaltyProgram {
  final String id;
  final String name;
  final String description;
  final double pointsRequired;
  final String reward;
  final bool isActive;
  final DateTime createdAt;

  LoyaltyProgram({
    required this.id,
    required this.name,
    required this.description,
    required this.pointsRequired,
    required this.reward,
    required this.isActive,
    required this.createdAt,
  });

  factory LoyaltyProgram.fromJson(Map<String, dynamic> json) {
    return LoyaltyProgram(
      id: json['id'],
      name: json['name'],
      description: json['description'],
      pointsRequired: json['pointsRequired'].toDouble(),
      reward: json['reward'],
      isActive: json['isActive'],
      createdAt: DateTime.parse(json['createdAt']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'pointsRequired': pointsRequired,
        'reward': reward,
        'isActive': isActive,
        'createdAt': createdAt.toIso8601String(),
      };

  LoyaltyProgram copyWith({
    String? id,
    String? name,
    String? description,
    double? pointsRequired,
    String? reward,
    bool? isActive,
    DateTime? createdAt,
  }) {
    return LoyaltyProgram(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      pointsRequired: pointsRequired ?? this.pointsRequired,
      reward: reward ?? this.reward,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

enum LoyaltyFilter {
  all,
  active,
  inactive,
}

// Riverpod Provider for Loyalty Programs
final loyaltySearchQueryProvider = StateProvider<String>((ref) => '');
final loyaltyFilterProvider = StateProvider<LoyaltyFilter>((ref) => LoyaltyFilter.all);

final restaurantLoyaltyProvider = FutureProvider.autoDispose<List<LoyaltyProgram>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final searchQuery = ref.watch(loyaltySearchQueryProvider);
  final filter = ref.watch(loyaltyFilterProvider);

  try {
    // In a real scenario, pass search and filter params to the API
    // final response = await api.get('/trpc/restaurantLoyalty.list', params: {
    //   'search': searchQuery,
    //   'filter': filter.name,
    // });
    // Dummy data for demonstration
    await Future.delayed(const Duration(milliseconds: 500)); // Simulate network delay
    final List<LoyaltyProgram> allPrograms = [
      LoyaltyProgram(id: '1', name: 'Coffee Lover', description: 'Buy 10 coffees, get 1 free', pointsRequired: 100, reward: 'Free Coffee', isActive: true, createdAt: DateTime(2023, 1, 15)),
      LoyaltyProgram(id: '2', name: 'Pizza Fan', description: 'Every 5th pizza is half price', pointsRequired: 200, reward: '50% off Pizza', isActive: false, createdAt: DateTime(2023, 3, 20)),
      LoyaltyProgram(id: '3', name: 'Burger Bonanza', description: 'Collect points for every burger purchase', pointsRequired: 150, reward: 'Free Burger', isActive: true, createdAt: DateTime(2023, 5, 10)),
      LoyaltyProgram(id: '4', name: 'Dessert Delight', description: 'Get a free dessert after 5 purchases', pointsRequired: 50, reward: 'Free Dessert', isActive: true, createdAt: DateTime(2023, 7, 25)),
    ];

    List<LoyaltyProgram> filteredPrograms = allPrograms.where((program) {
      final matchesSearch = program.name.toLowerCase().contains(searchQuery.toLowerCase()) ||
          program.description.toLowerCase().contains(searchQuery.toLowerCase());
      final matchesFilter = (filter == LoyaltyFilter.all) ||
          (filter == LoyaltyFilter.active && program.isActive) ||
          (filter == LoyaltyFilter.inactive && !program.isActive);
      return matchesSearch && matchesFilter;
    }).toList();

    return filteredPrograms;
    // return (response.data as List).map((e) => LoyaltyProgram.fromJson(e)).toList();
  } catch (e) {
    throw Exception('Failed to load loyalty programs: $e');
  }
});

// CRUD Providers (dummy implementations)
final addLoyaltyProgramProvider = FutureProvider.autoDispose.family<void, LoyaltyProgram>((ref, program) async {
  final api = ref.read(apiServiceProvider);
  try {
    await Future.delayed(const Duration(milliseconds: 500)); // Simulate network delay
    // await api.post('/trpc/restaurantLoyalty.create', body: program.toJson());
    ref.invalidate(restaurantLoyaltyProvider);
  } catch (e) {
    throw Exception('Failed to add loyalty program: $e');
  }
});

final updateLoyaltyProgramProvider = FutureProvider.autoDispose.family<void, LoyaltyProgram>((ref, program) async {
  final api = ref.read(apiServiceProvider);
  try {
    await Future.delayed(const Duration(milliseconds: 500)); // Simulate network delay
    // await api.post('/trpc/restaurantLoyalty.update', body: program.toJson());
    ref.invalidate(restaurantLoyaltyProvider);
  } catch (e) {
    throw Exception('Failed to update loyalty program: $e');
  }
});

final deleteLoyaltyProgramProvider = FutureProvider.autoDispose.family<void, String>((ref, programId) async {
  final api = ref.read(apiServiceProvider);
  try {
    await Future.delayed(const Duration(milliseconds: 500)); // Simulate network delay
    // await api.post('/trpc/restaurantLoyalty.delete', body: {'id': programId});
    ref.invalidate(restaurantLoyaltyProvider);
  } catch (e) {
    throw Exception('Failed to delete loyalty program: $e');
  }
});

class RestaurantLoyaltyScreen extends ConsumerStatefulWidget {
  const RestaurantLoyaltyScreen({super.key});

  @override
  ConsumerState<RestaurantLoyaltyScreen> createState() => _RestaurantLoyaltyScreenState();
}

class _RestaurantLoyaltyScreenState extends ConsumerState<RestaurantLoyaltyScreen> {
  final TextEditingController _searchController = TextEditingController();

  Future<void> _refreshLoyaltyPrograms() async {
    ref.invalidate(restaurantLoyaltyProvider);
  }

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(loyaltySearchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showLoyaltyProgramDialog({LoyaltyProgram? program}) {
    final isEditing = program != null;
    final nameController = TextEditingController(text: program?.name);
    final descriptionController = TextEditingController(text: program?.description);
    final pointsController = TextEditingController(text: program?.pointsRequired.toStringAsFixed(0));
    final rewardController = TextEditingController(text: program?.reward);
    bool isActive = program?.isActive ?? true;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: kCardColor,
              title: Text(isEditing ? 'Edit Loyalty Program' : 'Add Loyalty Program', style: const TextStyle(color: kTextColor)),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nameController,
                      style: const TextStyle(color: kTextColor),
                      decoration: InputDecoration(
                        labelText: 'Program Name',
                        labelStyle: TextStyle(color: kTextColor.withOpacity(0.7)),
                        enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kTextColor)),
                        focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kAccentColor)),
                      ),
                    ),
                    TextField(
                      controller: descriptionController,
                      style: const TextStyle(color: kTextColor),
                      decoration: InputDecoration(
                        labelText: 'Description',
                        labelStyle: TextStyle(color: kTextColor.withOpacity(0.7)),
                        enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kTextColor)),
                        focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kAccentColor)),
                      ),
                    ),
                    TextField(
                      controller: pointsController,
                      style: const TextStyle(color: kTextColor),
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: 'Points Required',
                        labelStyle: TextStyle(color: kTextColor.withOpacity(0.7)),
                        enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kTextColor)),
                        focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kAccentColor)),
                      ),
                    ),
                    TextField(
                      controller: rewardController,
                      style: const TextStyle(color: kTextColor),
                      decoration: InputDecoration(
                        labelText: 'Reward',
                        labelStyle: TextStyle(color: kTextColor.withOpacity(0.7)),
                        enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kTextColor)),
                        focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kAccentColor)),
                      ),
                    ),
                    Row(
                      children: [
                        Text('Is Active:', style: TextStyle(color: kTextColor.withOpacity(0.7))),
                        Switch(
                          value: isActive,
                          onChanged: (value) {
                            setState(() {
                              isActive = value;
                            });
                          },
                          activeColor: kAccentColor,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel', style: TextStyle(color: kTextColor)),
                ),
                ElevatedButton(
                  onPressed: () async {
                    final newProgram = LoyaltyProgram(
                      id: isEditing ? program!.id : UniqueKey().toString(), // Use existing ID for edit, new for create
                      name: nameController.text,
                      description: descriptionController.text,
                      pointsRequired: double.tryParse(pointsController.text) ?? 0,
                      reward: rewardController.text,
                      isActive: isActive,
                      createdAt: isEditing ? program!.createdAt : DateTime.now(),
                    );

                    if (isEditing) {
                      await ref.read(updateLoyaltyProgramProvider(newProgram).future);
                    } else {
                      await ref.read(addLoyaltyProgramProvider(newProgram).future);
                    }
                    Navigator.of(context).pop();
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: kAccentColor),
                  child: Text(isEditing ? 'Save' : 'Add', style: const TextStyle(color: kTextColor)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _confirmDeleteLoyaltyProgram(String programId) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: kCardColor,
          title: const Text('Confirm Delete', style: TextStyle(color: kTextColor)),
          content: const Text('Are you sure you want to delete this loyalty program?', style: TextStyle(color: kTextColor)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: kTextColor)),
            ),
            ElevatedButton(
              onPressed: () async {
                await ref.read(deleteLoyaltyProgramProvider(programId).future);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: kTextColor)),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final loyaltyProgramsAsyncValue = ref.watch(restaurantLoyaltyProvider);
    final selectedFilter = ref.watch(loyaltyFilterProvider);

    return Scaffold(
      backgroundColor: kBackgroundColor,
      appBar: AppBar(
        title: const Text('Restaurant Loyalty', style: TextStyle(color: kTextColor)),
        backgroundColor: kCardColor,
        iconTheme: const IconThemeData(color: kTextColor),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: kTextColor),
              decoration: InputDecoration(
                hintText: 'Search loyalty programs...', 
                hintStyle: TextStyle(color: kTextColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: kTextColor),
                filled: true,
                fillColor: kCardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8.0),
            child: Align(
              alignment: Alignment.centerRight,
              child: DropdownButton<LoyaltyFilter>(
                value: selectedFilter,
                dropdownColor: kCardColor,
                iconEnabledColor: kTextColor,
                style: const TextStyle(color: kTextColor),
                onChanged: (LoyaltyFilter? newValue) {
                  if (newValue != null) {
                    ref.read(loyaltyFilterProvider.notifier).state = newValue;
                  }
                },
                items: const <DropdownMenuItem<LoyaltyFilter>>[
                  DropdownMenuItem(
                    value: LoyaltyFilter.all,
                    child: Text('All Programs'),
                  ),
                  DropdownMenuItem(
                    value: LoyaltyFilter.active,
                    child: Text('Active Programs'),
                  ),
                  DropdownMenuItem(
                    value: LoyaltyFilter.inactive,
                    child: Text('Inactive Programs'),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshLoyaltyPrograms,
              color: kAccentColor,
              child: loyaltyProgramsAsyncValue.when(
                data: (programs) {
                  if (programs.isEmpty) {
                    return Center(
                      child: Text(
                        'No loyalty programs found.',
                        style: TextStyle(color: kTextColor.withOpacity(0.7)),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: programs.length,
                    itemBuilder: (context, index) {
                      final program = programs[index];
                      return Card(
                        color: kCardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                program.name,
                                style: const TextStyle(
                                  color: kTextColor,
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                program.description,
                                style: TextStyle(color: kTextColor.withOpacity(0.8)),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Points Required: ${program.pointsRequired.toStringAsFixed(0)}',
                                style: TextStyle(color: kTextColor.withOpacity(0.8)),
                              ),
                              Text(
                                'Reward: ${program.reward}',
                                style: TextStyle(color: kTextColor.withOpacity(0.8)),
                              ),
                              Text(
                                'Created: ${DateFormat('MMM dd, yyyy').format(program.createdAt)}',
                                style: TextStyle(color: kTextColor.withOpacity(0.8)),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: program.isActive ? Colors.green : Colors.red,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      program.isActive ? 'Active' : 'Inactive',
                                      style: const TextStyle(color: Colors.white, fontSize: 12),
                                    ),
                                  ),
                                  Row(
                                    children: [
                                      IconButton(
                                        icon: const Icon(Icons.edit, color: kAccentColor),
                                        onPressed: () => _showLoyaltyProgramDialog(program: program),
                                      ),
                                      IconButton(
                                        icon: const Icon(Icons.delete, color: Colors.redAccent),
                                        onPressed: () => _confirmDeleteLoyaltyProgram(program.id),
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
                },
                loading: () => const Center(child: CircularProgressIndicator(color: kAccentColor)),
                error: (error, stack) => Center(
                  child: Text(
                    'Error: ${error.toString()}',
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showLoyaltyProgramDialog(),
        backgroundColor: kAccentColor,
        child: const Icon(Icons.add, color: kTextColor),
      ),
    );
  }
}
