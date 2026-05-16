import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { useTrpc } from '../hooks/useTrpc'; // Assuming this path

// Define color scheme
const Colors = {
  primary: '#6366f1',
  background: '#0f172a',
  card: '#1e293b',
  text: 'white',
  subtext: '#94a3b8',
};

const ProfileScreen = () => {
  const { query, mutation } = useTrpc();

  const { 
    data: profileData,
    isLoading: isLoadingProfile,
    isError: isErrorProfile,
    error: profileError,
    refetch: refetchProfile,
  } = query.auth.me.useQuery();

  const {
    mutate: updateProfile,
    isLoading: isUpdatingProfile,
    isError: isErrorUpdatingProfile,
    error: updateProfileError,
  } = mutation.settings.updateProfile.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Profile updated successfully!');
      refetchProfile(); // Refresh profile data after successful update
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to update profile: ${err.message}`);
    },
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (profileData) {
      setName(profileData.name || '');
      setEmail(profileData.email || '');
      setPhone(profileData.phone || '');
    }
  }, [profileData]);

  const handleUpdateProfile = () => {
    updateProfile({ name, email, phone });
  };

  const onRefresh = useCallback(() => {
    refetchProfile();
  }, []);

  if (isLoadingProfile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (isErrorProfile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {profileError?.message || 'Failed to load profile.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetchProfile()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Empty state check (if profileData is null or essential fields are missing)
  if (!profileData || (!profileData.name && !profileData.email && !profileData.phone)) {
    return (
      <ScrollView
        contentContainerStyle={styles.centered}
        refreshControl={
          <RefreshControl refreshing={isLoadingProfile} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        <Text style={styles.emptyText}>No profile data available. Pull to refresh or contact support.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetchProfile()}>
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={isLoadingProfile} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>User Profile</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Enter your name"
          placeholderTextColor={Colors.subtext}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Enter your email"
          placeholderTextColor={Colors.subtext}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="Enter your phone number"
          placeholderTextColor={Colors.subtext}
          keyboardType="phone-pad"
        />

        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleUpdateProfile}
          disabled={isUpdatingProfile}
        >
          {isUpdatingProfile ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <Text style={styles.saveButtonText}>Save Profile</Text>
          )}
        </TouchableOpacity>
        {isErrorUpdatingProfile && (
          <Text style={styles.updateErrorText}>Update Error: {updateProfileError?.message || 'Failed to update.'}</Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: Colors.subtext,
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
  },
  retryButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxWidth: 500, // Optional: for larger screens
    alignSelf: 'center',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    color: Colors.subtext,
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: Colors.background,
    color: Colors.text,
    padding: 12,
    borderRadius: 5,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: Colors.subtext,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  updateErrorText: {
    color: 'red',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
  },
});

export default ProfileScreen;
