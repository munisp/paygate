import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Button,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Dummy type for notification preference, replace with actual tRPC type
interface NotificationPreference {
  id: string;
  type: string;
  enabled: boolean;
  threshold?: number;
  lastUpdated: Date;
}

const MerchantNotificationPreferencesScreen = () => {
  const navigation = useNavigation();

  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentPreference, setCurrentPreference] = useState<NotificationPreference | null>(null);

  // tRPC queries and mutations
  const { data, isLoading, isError, refetch } = trpc.merchantNotificationPreferences.list.useQuery();
  const createMutation = trpc.merchantNotificationPreferences.create.useMutation();
  const updateMutation = trpc.merchantNotificationPreferences.update.useMutation();
  const deleteMutation = trpc.merchantNotificationPreferences.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(pref =>
    pref.type.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const handleCreate = async (newPref: Omit<NotificationPreference, 'id' | 'lastUpdated'>) => {
    try {
      await createMutation.mutateAsync(newPref);
      refetch();
      setCreateModalVisible(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to create preference.');
    }
  };

  const handleUpdate = async (updatedPref: NotificationPreference) => {
    try {
      await updateMutation.mutateAsync(updatedPref);
      refetch();
      setEditModalVisible(false);
      setCurrentPreference(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to update preference.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this preference?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete preference.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: NotificationPreference }) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemContent}>
        <Text style={styles.itemType}>{item.type}</Text>
        <View style={[styles.badge, { backgroundColor: item.enabled ? COLORS.success : COLORS.muted }]}>
          <Text style={styles.badgeText}>{item.enabled ? 'Active' : 'Inactive'}</Text>
        </View>
        {item.threshold !== undefined && (
          <Text style={styles.itemDetail}>Threshold: {item.threshold}</Text>
        )}
        <Text style={styles.itemDetail}>Last Updated: {item.lastUpdated.toLocaleDateString()}</Text>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]}
          onPress={() => {
            setCurrentPreference(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error, marginLeft: 8 }]} // Added margin for spacing
          onPress={() => handleDelete(item.id)}
        >
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading preferences...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load notification preferences.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.header}>Notification Preferences</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search preferences..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setCreateModalVisible(true)}
      >
        <Text style={styles.createButtonText}>Add New Preference</Text>
      </TouchableOpacity>

      {filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No notification preferences found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Preference</Text>
            {/* Form fields for new preference */}
            <TextInput style={styles.modalInput} placeholder="Type" placeholderTextColor={COLORS.muted} />
            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Enabled:</Text>
              <Switch trackColor={{ false: COLORS.muted, true: COLORS.primary }} thumbColor={COLORS.text} />
            </View>
            <TextInput style={styles.modalInput} placeholder="Threshold (optional)" placeholderTextColor={COLORS.muted} keyboardType="numeric" />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={() => handleCreate({ type: 'New Type', enabled: true, threshold: 100 })} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Preference</Text>
            {currentPreference && (
              <>
                <TextInput style={styles.modalInput} value={currentPreference.type} onChangeText={(text) => setCurrentPreference({ ...currentPreference, type: text })} />
                <View style={styles.switchContainer}>
                  <Text style={styles.switchLabel}>Enabled:</Text>
                  <Switch
                    trackColor={{ false: COLORS.muted, true: COLORS.primary }}
                    thumbColor={COLORS.text}
                    value={currentPreference.enabled}
                    onValueChange={(value) => setCurrentPreference({ ...currentPreference, enabled: value })}
                  />
                </View>
                <TextInput
                  style={styles.modalInput}
                  value={currentPreference.threshold?.toString() || ''}
                  onChangeText={(text) => setCurrentPreference({ ...currentPreference, threshold: text ? parseFloat(text) : undefined })}
                  keyboardType="numeric"
                />
              </>
            )}
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={() => currentPreference && handleUpdate(currentPreference)} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.text,
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 20,
    paddingBottom: 10,
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginHorizontal: 20,
    marginBottom: 15,
    color: COLORS.text,
    fontSize: 16,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  itemContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
  },
  itemType: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  itemDetail: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 3,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginBottom: 5,
  },
  badgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  itemActions: {
    flexDirection: 'row',
    marginLeft: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    height: 45,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: COLORS.text,
    fontSize: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  switchLabel: {
    color: COLORS.text,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

export default MerchantNotificationPreferencesScreen;
