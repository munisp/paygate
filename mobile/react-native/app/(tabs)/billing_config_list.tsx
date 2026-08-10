import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';

// Define types for billing configuration and analytics
interface BillingConfig {
  id: string;
  name: string;
  tier: string;
  price: number;
  features: string[];
  isActive: boolean;
}

interface AnalyticsSummary {
  totalRevenue: number;
  activeMerchants: number;
  averageTransactionValue: number;
  monthlyGrowthRate: number;
}

export default function BillingConfigListScreen() {
  const [searchText, setSearchText] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newConfigName, setNewConfigName] = useState('');
  const [newConfigTier, setNewConfigTier] = useState('');
  const [newConfigPrice, setNewConfigPrice] = useState('');

  const { data: configs, isLoading: isLoadingConfigs, error: errorConfigs, refetch: refetchConfigs } = trpc.billing.listConfigs.useQuery();
  const { data: analytics, isLoading: isLoadingAnalytics, error: errorAnalytics } = trpc.billingExt.getAnalytics.useQuery();

  const createConfigMutation = trpc.billing.create.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Billing configuration created successfully!');
      setIsCreating(false);
      setNewConfigName('');
      setNewConfigTier('');
      setNewConfigPrice('');
      refetchConfigs();
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to create billing configuration: ${err.message}`);
    },
  });

  const updateConfigMutation = trpc.billing.update.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Billing configuration updated successfully!');
      refetchConfigs();
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to update billing configuration: ${err.message}`);
    },
  });

  const deleteConfigMutation = trpc.billing.delete.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Billing configuration deleted successfully!');
      refetchConfigs();
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to delete billing configuration: ${err.message}`);
    },
  });

  const handleCreateConfig = () => {
    if (!newConfigName || !newConfigTier || !newConfigPrice) {
      Alert.alert('Error', 'Please fill all fields for new configuration.');
      return;
    }
    createConfigMutation.mutate({
      name: newConfigName,
      tier: newConfigTier,
      price: parseFloat(newConfigPrice),
      features: [], // Assuming features can be added later or are default
      isActive: true,
    });
  };

  const handleUpdateConfig = (id: string, updates: Partial<BillingConfig>) => {
    updateConfigMutation.mutate({ id, ...updates });
  };

  const handleDeleteConfig = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this billing configuration?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteConfigMutation.mutate({ id }) },
      ]
    );
  };

  const filteredConfigs = configs?.filter(config =>
    config.name.toLowerCase().includes(searchText.toLowerCase()) ||
    config.tier.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderConfigItem = ({ item }: { item: BillingConfig }) => (
    <View style={styles.card}>
      <View style={styles.configHeader}>
        <Text style={styles.configName}>{item.name}</Text>
        <Text style={styles.configTier}>{item.tier}</Text>
      </View>
      <Text style={styles.configPrice}>₦{item.price.toLocaleString()}</Text>
      <Text style={styles.configFeatures}>Features: {item.features.join(', ') || 'No specific features'}</Text>
      <Text style={item.isActive ? styles.activeStatus : styles.inactiveStatus}>
        {item.isActive ? 'Active' : 'Inactive'}
      </Text>
      <View style={styles.configActions}>
        <TouchableOpacity onPress={() => Alert.alert('Edit', `Edit ${item.name}`)} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteConfig(item.id)} style={[styles.actionButton, styles.deleteButton]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Billing Configurations' }} />
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.header}>Billing Configurations</Text>

        {/* Analytics Summary Cards */}
        <Text style={styles.subHeader}>Analytics Summary</Text>
        {isLoadingAnalytics ? (
          <ActivityIndicator size="large" color={colors.accent} />
        ) : errorAnalytics ? (
          <Text style={styles.errorText}>Failed to load analytics: {errorAnalytics.message}</Text>
        ) : analytics ? (
          <View style={styles.analyticsContainer}>
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>Total Revenue</Text>
              <Text style={styles.analyticsValue}>₦{analytics.totalRevenue.toLocaleString()}</Text>
            </View>
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>Active Merchants</Text>
              <Text style={styles.analyticsValue}>{analytics.activeMerchants.toLocaleString()}</Text>
            </View>
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>Avg. Transaction Value</Text>
              <Text style={styles.analyticsValue}>₦{analytics.averageTransactionValue.toLocaleString()}</Text>
            </View>
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>Monthly Growth</Text>
              <Text style={styles.analyticsValue}>{analytics.monthlyGrowthRate.toFixed(2)}%</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyStateText}>No analytics data available. Perhaps the system is still gathering insights from transactions across Nigeria.</Text>
        )}

        {/* Search and Filter */}
        <TextInput
          style={styles.searchInput}
          placeholder="Search configurations..."
          placeholderTextColor={colors.muted}
          value={searchText}
          onChangeText={setSearchText}
        />

        {/* Create New Config */}
        <TouchableOpacity style={styles.createButton} onPress={() => setIsCreating(!isCreating)}>
          <Text style={styles.createButtonText}>{isCreating ? 'Cancel' : 'Create New Configuration'}</Text>
        </TouchableOpacity>

        {isCreating && (
          <View style={styles.createForm}>
            <TextInput
              style={styles.formInput}
              placeholder="Configuration Name (e.g., Standard Plan)"
              placeholderTextColor={colors.muted}
              value={newConfigName}
              onChangeText={setNewConfigName}
            />
            <TextInput
              style={styles.formInput}
              placeholder="Tier (e.g., Basic, Premium)"
              placeholderTextColor={colors.muted}
              value={newConfigTier}
              onChangeText={setNewConfigTier}
            />
            <TextInput
              style={styles.formInput}
              placeholder="Price (e.g., 5000)"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={newConfigPrice}
              onChangeText={setNewConfigPrice}
            />
            <TouchableOpacity style={styles.submitButton} onPress={handleCreateConfig}>
              <Text style={styles.submitButtonText}>Submit New Configuration</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Billing Config List */}
        <Text style={styles.subHeader}>All Configurations</Text>
        {isLoadingConfigs ? (
          <ActivityIndicator size="large" color={colors.accent} />
        ) : errorConfigs ? (
          <Text style={styles.errorText}>Failed to load billing configurations: {errorConfigs.message}</Text>
        ) : filteredConfigs && filteredConfigs.length > 0 ? (
          <FlatList
            data={filteredConfigs}
            renderItem={renderConfigItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            scrollEnabled={false} // Nested ScrollView handles scrolling
          />
        ) : (
          <Text style={styles.emptyStateText}>No billing configurations found. Time to set up some attractive plans for Nigerian merchants!</Text>
        )}
      </ScrollView>
    </View>
  );
}

const colors = {
  background: '#0f172a',
  card: '#1e293b',
  accent: '#6366f1',
  text: '#f8fafc',
  muted: '#94a3b8',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollViewContent: {
    padding: 16,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  subHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 20,
    marginBottom: 15,
  },
  searchInput: {
    height: 45,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: colors.text,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.muted,
  },
  createButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  createButtonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  createForm: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.muted,
  },
  formInput: {
    height: 45,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: colors.text,
    fontSize: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.muted,
  },
  submitButton: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  analyticsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  analyticsCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 15,
    width: '48%', // Roughly half width for two cards per row
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.muted,
  },
  analyticsTitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 5,
  },
  analyticsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.muted,
  },
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  configName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  configTier: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: '600',
  },
  configPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 5,
  },
  configFeatures: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 10,
  },
  activeStatus: {
    color: '#4CAF50', // Green for active
    fontWeight: 'bold',
    marginBottom: 10,
  },
  inactiveStatus: {
    color: '#FFC107', // Amber for inactive
    fontWeight: 'bold',
    marginBottom: 10,
  },
  configActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  deleteButton: {
    backgroundColor: '#DC3545', // Red for delete
  },
  actionButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#DC3545',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  emptyStateText: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    lineHeight: 24,
  },
});
