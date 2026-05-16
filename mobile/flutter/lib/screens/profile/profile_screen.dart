import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

// Assuming dioProvider is defined elsewhere, e.g., in a providers.dart file
// final dioProvider = Provider<Dio>((ref) => Dio());
// For this example, we'll assume it's accessible.

// Placeholder for the actual dioProvider. In a real app, this would be imported.
final dioProvider = Provider<Dio>((ref) => Dio());

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _isLoading = true;
  String? _error;
  Map<String, dynamic>? _userProfile;

  // Controllers for text fields if we were to make them editable
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final dio = ref.read(dioProvider);
      final response = await dio.get('/api/trpc/auth.me');
      if (response.statusCode == 200 && response.data != null) {
        setState(() {
          _userProfile = response.data['result']['data']; // Adjust based on actual tRPC response structure
          _nameController.text = _userProfile?['name'] ?? '';
          _emailController.text = _userProfile?['email'] ?? '';
        });
      } else {
        setState(() {
          _error = 'Failed to load profile: ${response.statusMessage}';
        });
      }
    } on DioException catch (e) {
      setState(() {
        _error = 'Network error: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred: ${e.toString()}';
      });
    }

    setState(() {
      _isLoading = false;
    });
  }

  Future<void> _updateProfile() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final dio = ref.read(dioProvider);
      final response = await dio.post(
        '/api/trpc/settings.updateProfile',
        data: {
          'name': _nameController.text,
          'email': _emailController.text,
        },
      );

      if (response.statusCode == 200 && response.data != null) {
        // Assuming the update returns the new profile data or a success message
        // For simplicity, we'll just reload the profile after a successful update
        await _loadProfile();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile updated successfully!')),
        );
      } else {
        setState(() {
          _error = 'Failed to update profile: ${response.statusMessage}';
        });
      }
    } on DioException catch (e) {
      setState(() {
        _error = 'Network error during update: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred during update: ${e.toString()}';
      });
    }

    setState(() {
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Text(
                      'Error: $_error',
                      style: const TextStyle(color: Colors.red, fontSize: 16),
                      textAlign: TextAlign.center,
                    ),
                  )
                : _userProfile == null
                    ? const Center(
                        child: Text('No profile data available.'),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TextFormField(
                            controller: _nameController,
                            decoration: const InputDecoration(
                              labelText: 'Name',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _emailController,
                            decoration: const InputDecoration(
                              labelText: 'Email',
                              border: OutlineInputBorder(),
                            ),
                            keyboardType: TextInputType.emailAddress,
                          ),
                          const SizedBox(height: 24),
                          Center(
                            child: ElevatedButton(
                              onPressed: _updateProfile,
                              child: _isLoading
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        color: Colors.white,
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Text('Update Profile'),
                            ),
                          ),
                        ],
                      ),
      ),
    );
  }
}
