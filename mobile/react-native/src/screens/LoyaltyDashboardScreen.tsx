import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert, RefreshControl, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface LoyaltyItem {
  id: string;
  name: string;
  points: number;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'USD') => {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const LoyaltyDashboardScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LoyaltyItem | null>(null);

  // Form states for Create/Edit
  const [formName, setFormName] = useState('');
  const [formPoints, setFormPoints] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive' | 'pending'>('active');

  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.loyalty.list.useQuery();
  const createMutation = trpc.loyalty.create.useMutation();
  const updateMutation = trpc.loyalty.update.useMutation();
  const deleteMutation = trpc.loyalty.delete.useMutation();

  useEffect(() => {
    if (selectedItem) {
      setFormName(selectedItem.name);
      setFormPoints(selectedItem.points.toString());
      setFormStatus(selectedItem.status);
    } else {
      setFormName('');
      setFormPoints('');
      setFormStatus('active');
    }
  }, [selectedItem]);

  const onRefresh = useCallback(() => {
    refetch();
  }, []);

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        name: formName,
        points: parseInt(formPoints),
        status: formStatus,
      });
      refetch();
      setCreateModalVisible(false);
      setFormName('');
      setFormPoints('');
      setFormStatus('active');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create loyalty item.');
    }
  };

  const handleUpdate = async () => {
    if (!selectedItem) return;
    try {
      await updateMutation.mutateAsync({
        id: selectedItem.id,
        name: formName,
        points: parseInt(formPoints),
        status: formStatus,
      });
      refetch();
      setEditModalVisible(false);
      setSelectedItem(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update loyalty item.');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete this loyalty item?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete loyalty item.');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const filteredData = data?.filter(item =>
    item.name.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const renderItem = ({ item }: { item: LoyaltyItem }) => (
    <View style={styles.loyaltyItem}>
      <View>
        <Text style={styles.loyaltyItemName}>{item.name}</Text>
        <Text style={styles.loyaltyItemPoints}>{formatCurrency(item.points)} points</Text>
        <Text style={[styles.loyaltyItemStatus, {
          color: item.status === 'active' ? COLORS.success :
                 item.status === 'inactive' ? COLORS.error : COLORS.warning
        }]}>{item.status.toUpperCase()}</Text>
        <Text style={styles.loyaltyItemDate}>Created: {formatDate(item.createdAt)}</Text>
        <Text style={styles.loyaltyItemDate}>Updated: {formatDate(item.updatedAt)}</Text>
      </View>
      <View style={styles.loyaltyItemActions}>
        <TouchableOpacity onPress={() => { setSelectedItem(item); setEditModalVisible(true); }}>
          <Text style={styles.editButton}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)}>
          <Text style={styles.deleteButton}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading loyalty data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error?.message}</Text>
          <TouchableOpacity onPress={() => refetch()}>
            <Text style={styles.retryButton}>Tap to Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Loyalty Dashboard</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>Add Loyalty Item</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search loyalty items..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredData.length === 0 && !isLoading && !isError ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No loyalty items found.</Text>
          <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
            <Text style={styles.createButtonText}>Create New</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
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
            <Text style={styles.modalTitle}>Create Loyalty Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={COLORS.muted}
              value={formName}
              onChangeText={setFormName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Points"
              keyboardType="numeric"
              placeholderTextColor={COLORS.muted}
              value={formPoints}
              onChangeText={setFormPoints}
            />
            {/* Status picker could be added here */}
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={handleCreate} color={COLORS.primary} disabled={createMutation.isLoading} />
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
            <Text style={styles.modalTitle}>Edit Loyalty Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={COLORS.muted}
              value={formName}
              onChangeText={setFormName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Points"
              keyboardType="numeric"
              placeholderTextColor={COLORS.muted}
              value={formPoints}
              onChangeText={setFormPoints}
            />
            {/* Status picker could be added here */}
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button title="Save" onPress={handleUpdate} color={COLORS.primary} disabled={updateMutation.isLoading} />
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
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 16,
  },
  retryButton: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: COLORS.text,
    margin: 16,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  loyaltyItem: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loyaltyItemName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loyaltyItemPoints: {
    color: COLORS.muted,
    fontSize: 14,
  },
  loyaltyItemStatus: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  loyaltyItemDate: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  loyaltyItemActions: {
    flexDirection: 'row',
    gap: 10,
  },
  editButton: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  deleteButton: {
    color: COLORS.error,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    width: '80%',
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: COLORS.text,
    marginBottom: 15,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
});

export default LoyaltyDashboardScreen;