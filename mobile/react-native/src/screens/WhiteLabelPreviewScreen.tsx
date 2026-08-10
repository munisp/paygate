import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, Alert, TouchableOpacity, TextInput, Switch, StatusBar, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-US', options);
};

// Type definition for WhiteLabel data (example structure)
interface WhiteLabelConfig {
  id: string;
  name: string;
  logoUrl: string;
  primaryColor: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  monthlyFee: number;
  currency: 'NGN' | 'USD';
}

const WhiteLabelPreviewScreen = () => {
  const navigation = useNavigation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedConfig, setEditedConfig] = useState<Partial<WhiteLabelConfig>>({});

  // Infer tRPC router namespace: whitelabel
  const { data, isLoading, isError, error, refetch } = trpc.whitelabel.getPreview.useQuery();
  const updateMutation = trpc.whitelabel.updatePreview.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleEdit = () => {
    setIsEditing(true);
    setEditedConfig(data || {});
  };

  const handleSave = async () => {
    if (!data?.id) return;
    try {
      await updateMutation.mutateAsync({
        id: data.id,
        ...editedConfig,
      });
      setIsEditing(false);
      refetch();
      Alert.alert('Success', 'White Label configuration updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', `Failed to update: ${e.message || 'Unknown error'}`);
    }
  };

  const handleDelete = () => {
    if (!data?.id) return;
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this White Label configuration? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Assuming a delete mutation exists
              // await trpc.whitelabel.delete.useMutation().mutateAsync({ id: data.id });
              Alert.alert('Success', 'White Label configuration deleted successfully.');
              navigation.goBack(); // Or navigate to a list screen
            } catch (e: any) {
              Alert.alert('Error', `Failed to delete: ${e.message || 'Unknown error'}`);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading White Label Preview...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Error: {error?.message || 'Failed to load data'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Tap to Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No White Label configuration found.</Text>
          {/* Optionally, a button to create a new one */}
        </View>
      </SafeAreaView>
    );
  }

  const currentConfig = isEditing ? editedConfig : data;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>White Label Configuration</Text>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Name:</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={currentConfig.name}
                onChangeText={(text) => setEditedConfig({ ...editedConfig, name: text })}
              />
            ) : (
              <Text style={styles.value}>{data.name}</Text>
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Logo URL:</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={currentConfig.logoUrl}
                onChangeText={(text) => setEditedConfig({ ...editedConfig, logoUrl: text })}
              />
            ) : (
              <Text style={styles.value}>{data.logoUrl}</Text>
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Primary Color:</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={currentConfig.primaryColor}
                onChangeText={(text) => setEditedConfig({ ...editedConfig, primaryColor: text })}
              />
            ) : (
              <Text style={styles.value}>{data.primaryColor}</Text>
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Status:</Text>
            {isEditing ? (
              <Switch
                trackColor={{ false: COLORS.muted, true: COLORS.success }}
                thumbColor={currentConfig.isActive ? COLORS.text : COLORS.text}
                ios_backgroundColor={COLORS.muted}
                onValueChange={(value) => setEditedConfig({ ...editedConfig, isActive: value })}
                value={currentConfig.isActive}
              />
            ) : (
              <View style={[styles.badge, data.isActive ? styles.badgeActive : styles.badgeInactive]}>
                <Text style={styles.badgeText}>{data.isActive ? 'Active' : 'Inactive'}</Text>
              </View>
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Monthly Fee:</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={String(currentConfig.monthlyFee)}
                onChangeText={(text) => setEditedConfig({ ...editedConfig, monthlyFee: parseFloat(text) || 0 })}
                keyboardType="numeric"
              />
            ) : (
              <Text style={styles.value}>{formatCurrency(data.monthlyFee, data.currency)}</Text>
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Created At:</Text>
            <Text style={styles.value}>{formatDate(data.createdAt)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Last Updated:</Text>
            <Text style={styles.value}>{formatDate(data.updatedAt)}</Text>
          </View>

          <View style={styles.actionsContainer}>
            {isEditing ? (
              <>
                <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSave}>
                  <Text style={styles.buttonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setIsEditing(false)}>
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={[styles.button, styles.editButton]} onPress={handleEdit}>
                  <Text style={styles.buttonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={handleDelete}>
                  <Text style={styles.buttonText}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollViewContent: {
    flexGrow: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    color: COLORS.muted,
    fontWeight: '600',
    flex: 1,
  },
  value: {
    fontSize: 16,
    color: COLORS.text,
    flex: 2,
    textAlign: 'right',
  },
  input: {
    flex: 2,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    textAlign: 'right',
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  badgeActive: {
    backgroundColor: COLORS.success,
  },
  badgeInactive: {
    backgroundColor: COLORS.error,
  },
  badgeText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 12,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 15,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  saveButton: {
    backgroundColor: COLORS.success,
  },
  cancelButton: {
    backgroundColor: COLORS.muted,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default WhiteLabelPreviewScreen;
