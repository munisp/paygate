import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Switch,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

/**
 * Design System Colors
 */
const colors = {
  primary: '#6366F1',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  muted: '#94A3B8',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  border: '#334155',
};

/**
 * Types for Settings Items
 */
interface SettingItemProps {
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  isLast?: boolean;
  textColor?: string;
  renderRight?: () => React.ReactNode;
}

/**
 * Reusable Setting Row Component
 */
const SettingItem: React.FC<SettingItemProps> = ({
  label,
  value,
  onPress,
  showChevron = true,
  isLast = false,
  textColor = colors.text,
  renderRight,
}) => (
  <TouchableOpacity
    style={[styles.itemContainer, isLast && styles.noBorder]}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={0.7}
  >
    <View style={styles.itemLabelContainer}>
      <Text style={[styles.itemLabel, { color: textColor }]}>{label}</Text>
    </View>
    <View style={styles.itemRightContainer}>
      {value && <Text style={styles.itemValue}>{value}</Text>}
      {renderRight && renderRight()}
      {showChevron && (
        <Text style={styles.chevron}>›</Text>
      )}
    </View>
  </TouchableOpacity>
);

/**
 * Reusable Section Header Component
 */
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText}>{title.toUpperCase()}</Text>
  </View>
);

/**
 * SettingsScreen Component
 */
const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);

  // tRPC Queries
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile, error: profileError } = trpc.user.getProfile.useQuery();
  const { data: business, isLoading: businessLoading, refetch: refetchBusiness } = trpc.business.getInfo.useQuery();
  const { data: notificationPrefs, isLoading: prefsLoading, refetch: refetchPrefs } = trpc.user.getNotificationPrefs.useQuery();
  
  // tRPC Mutations
  const updatePrefsMutation = trpc.user.updateNotificationPrefs.useMutation({
    onSuccess: () => {
      refetchPrefs();
    },
    onError: (err) => {
      Alert.alert('Error', err.message || 'Failed to update preferences');
    }
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // Navigation logic for logout would go here, e.g., resetting to Auth stack
      Alert.alert('Logged Out', 'You have been successfully logged out.');
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchProfile(), refetchBusiness(), refetchPrefs()]);
    setRefreshing(false);
  }, [refetchProfile, refetchBusiness, refetchPrefs]);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive', 
          onPress: () => logoutMutation.mutate() 
        },
      ]
    );
  };

  const toggleNotification = (key: 'push' | 'email' | 'sms') => {
    if (!notificationPrefs) return;
    updatePrefsMutation.mutate({
      ...notificationPrefs,
      [key]: !notificationPrefs[key],
    });
  };

  if (profileLoading || businessLoading || prefsLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (profileError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load settings</Text>
        <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Account Section */}
        <SectionHeader title="Account" />
        <View style={styles.sectionCard}>
          <SettingItem
            label="Profile"
            value={profile?.name || 'Set up profile'}
            onPress={() => navigation.navigate('ProfileEdit')}
          />
          <SettingItem
            label="Business Info"
            value={business?.name || 'Manage business'}
            onPress={() => navigation.navigate('BusinessInfo')}
            isLast
          />
        </View>

        {/* Security Section */}
        <SectionHeader title="Security" />
        <View style={styles.sectionCard}>
          <SettingItem
            label="Change PIN"
            onPress={() => navigation.navigate('ChangePIN')}
          />
          <SettingItem
            label="Two-Factor Authentication"
            value={profile?.twoFactorEnabled ? 'On' : 'Off'}
            onPress={() => navigation.navigate('TwoFactorSetup')}
          />
          <SettingItem
            label="Biometrics"
            renderRight={() => (
              <Switch
                value={profile?.biometricsEnabled}
                onValueChange={() => {/* Toggle biometrics logic */}}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            )}
            showChevron={false}
            isLast
          />
        </View>

        {/* Notifications Section */}
        <SectionHeader title="Notifications" />
        <View style={styles.sectionCard}>
          <SettingItem
            label="Push Notifications"
            renderRight={() => (
              <Switch
                value={notificationPrefs?.push}
                onValueChange={() => toggleNotification('push')}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                disabled={updatePrefsMutation.isLoading}
              />
            )}
            showChevron={false}
          />
          <SettingItem
            label="Email Alerts"
            renderRight={() => (
              <Switch
                value={notificationPrefs?.email}
                onValueChange={() => toggleNotification('email')}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                disabled={updatePrefsMutation.isLoading}
              />
            )}
            showChevron={false}
            isLast
          />
        </View>

        {/* Payments Section */}
        <SectionHeader title="Payments" />
        <View style={styles.sectionCard}>
          <SettingItem
            label="Bank Accounts"
            onPress={() => navigation.navigate('BankAccounts')}
          />
          <SettingItem
            label="Payout Schedule"
            value={business?.payoutSchedule || 'Daily'}
            onPress={() => navigation.navigate('PayoutSettings')}
            isLast
          />
        </View>

        {/* Danger Zone */}
        <SectionHeader title="Danger Zone" />
        <View style={styles.sectionCard}>
          <SettingItem
            label="Logout"
            onPress={handleLogout}
            textColor={colors.error}
            showChevron={false}
            isLast
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.versionText}>PayGate Merchant v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 1,
  },
  sectionCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  itemLabelContainer: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  itemRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemValue: {
    fontSize: 14,
    color: colors.muted,
    marginRight: 8,
  },
  chevron: {
    fontSize: 20,
    color: colors.muted,
    marginLeft: 4,
    marginTop: -2,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  footer: {
    padding: 40,
    alignItems: 'center',
  },
  versionText: {
    color: colors.muted,
    fontSize: 12,
  },
});

export default SettingsScreen;
