import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, ActivityIndicator, Text, View, FlatList, RefreshControl, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface CIPSGatewayItem {
  id: string;
  status: 'active' | 'inactive' | 'pending' | 'failed'; // Example statuses
  amount: number;
  currency: 'NGN' | 'USD'; // Example currency
  createdAt: string;
  // Add other relevant fields for CIPS Gateway here
}

const CIPSGatewayScreen = () => {
  const navigation = useNavigation();
  const { data, isLoading, isError, refetch } = trpc.cipsGateway.list.useQuery();
  const createMutation = trpc.cipsGateway.create.useMutation();
  const updateMutation = trpc.cipsGateway.update.useMutation();
  const deleteMutation = trpc.cipsGateway.delete.useMutation();

  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<CIPSGatewayItem | null>(null);
  const [newGatewayData, setNewGatewayData] = useState({ status: '', amount: '', currency: 'NGN' });

  const filteredData = data?.filter(item =>
    item.status.toLowerCase().includes(searchText.toLowerCase()) ||
    item.id.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({ status: newGatewayData.status, amount: parseFloat(newGatewayData.amount), currency: newGatewayData.currency });
      setCreateModalVisible(false);
      setNewGatewayData({ status: '', amount: '', currency: 'NGN' });
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create CIPS Gateway entry.');
    }
  };

  const handleEdit = async () => {
    if (!currentItem) return;
    try {
      await updateMutation.mutateAsync({ id: currentItem.id, status: newGatewayData.status, amount: parseFloat(newGatewayData.amount), currency: newGatewayData.currency });
      setEditModalVisible(false);
      setCurrentItem(null);
      setNewGatewayData({ status: '', amount: '', currency: 'NGN' });
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update CIPS Gateway entry.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
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
              Alert.alert('Error', 'Failed to delete CIPS Gateway entry.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (item: CIPSGatewayItem) => {
    setCurrentItem(item);
    setNewGatewayData({ status: item.status, amount: item.amount.toString(), currency: item.currency });
    setEditModalVisible(true);
  };

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const getStatusBadgeStyle = (status: CIPSGatewayItem['status']) => {
    switch (status) {
      case 'active':
        return styles.badgeSuccess;
      case 'inactive':
        return styles.badgeError;
      case 'pending':
        return styles.badgeWarning;
      case 'failed':
        return styles.badgeError;
      default:
        return styles.badgeMuted;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading CIPS Gateway data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load CIPS Gateway data.</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Tap to Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!data || data.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No CIPS Gateway data found.</Text>
          <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
            <Text style={styles.createButtonText}>Create New CIPS Gateway Entry</Text>
          </TouchableOpacity>
        </View>
        <CreateEditModal
          isVisible={isCreateModalVisible}
          onClose={() => setCreateModalVisible(false)}
          title="Create CIPS Gateway"
          data={newGatewayData}
          onChangeText={setNewGatewayData}
          onSubmit={handleCreate}
        />
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: CIPSGatewayItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Gateway ID: {item.id}</Text>
      <View style={styles.statusContainer}>
        <Text style={styles.cardText}>Status: </Text>
        <View style={[styles.badge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Date: {new Date(item.createdAt).toLocaleString()}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <TextInput
        style={styles.searchInput}
        placeholder="Search by status or ID..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.fab}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.flatListContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={COLORS.primary}
          />
        }
      />

      <CreateEditModal
        isVisible={isCreateModalVisible}
        onClose={() => setCreateModalVisible(false)}
        title="Create CIPS Gateway"
        data={newGatewayData}
        onChangeText={setNewGatewayData}
        onSubmit={handleCreate}
      />

      <CreateEditModal
        isVisible={isEditModalVisible}
        onClose={() => setEditModalVisible(false)}
        title="Edit CIPS Gateway"
        data={newGatewayData}
        onChangeText={setNewGatewayData}
        onSubmit={handleEdit}
      />
    </SafeAreaView>
  );
};

interface CreateEditModalProps {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  data: { status: string; amount: string; currency: string };
  onChangeText: React.Dispatch<React.SetStateAction<{ status: string; amount: string; currency: string }>>;
  onSubmit: () => void;
}

const CreateEditModal: React.FC<CreateEditModalProps> = ({ isVisible, onClose, title, data, onChangeText, onSubmit }) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={modalStyles.centeredView}>
        <View style={modalStyles.modalView}>
          <Text style={modalStyles.modalTitle}>{title}</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="Status (e.g., active, inactive)"
            placeholderTextColor={COLORS.muted}
            value={data.status}
            onChangeText={(text) => onChangeText(prev => ({ ...prev, status: text }))}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Amount"
            placeholderTextColor={COLORS.muted}
            keyboardType="numeric"
            value={data.amount}
            onChangeText={(text) => onChangeText(prev => ({ ...prev, amount: text }))}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Currency (e.g., NGN, USD)"
            placeholderTextColor={COLORS.muted}
            value={data.currency}
            onChangeText={(text) => onChangeText(prev => ({ ...prev, currency: text }))}
          />
          <View style={modalStyles.buttonContainer}>
            <TouchableOpacity onPress={onClose} style={[modalStyles.button, { backgroundColor: COLORS.error }]}>
              <Text style={modalStyles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSubmit} style={[modalStyles.button, { backgroundColor: COLORS.primary }]}>
              <Text style={modalStyles.buttonText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.card,
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
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  input: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 5,
    width: '100%',
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    borderRadius: 5,
    padding: 10,
    elevation: 2,
    width: '48%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  retryButton: {
    marginTop: 15,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  createButton: {
    marginTop: 15,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 5,
    margin: 10,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  fab: {
    position: 'absolute',
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 25,
    elevation: 8,
    zIndex: 1,
  },
  fabText: {
    fontSize: 24,
    color: 'white',
  },
  flatListContent: {
    paddingHorizontal: 10,
    paddingBottom: 80, // To make space for FAB
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 5,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  badgeSuccess: {
    backgroundColor: COLORS.success,
  },
  badgeError: {
    backgroundColor: COLORS.error,
  },
  badgeWarning: {
    backgroundColor: COLORS.warning,
  },
  badgeMuted: {
    backgroundColor: COLORS.muted,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    marginLeft: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default CIPSGatewayScreen;