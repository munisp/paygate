import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Button,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path is correct

// Design system colors
const COLORS = {
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

// Type definitions for Red Envelope data
interface RedEnvelope {
  id: string;
  name: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'active' | 'expired' | 'claimed';
  createdAt: string;
  expiresAt: string;
}

const RedEnvelopesScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentRedEnvelope, setCurrentRedEnvelope] = useState<RedEnvelope | null>(null);
  const [newRedEnvelopeName, setNewRedEnvelopeName] = useState('');
  const [newRedEnvelopeAmount, setNewRedEnvelopeAmount] = useState('');
  const [newRedEnvelopeCurrency, setNewRedEnvelopeCurrency] = useState<'NGN' | 'USD'>('NGN');

  // tRPC queries and mutations
  const { data, isLoading, isError, refetch, isRefetching } = trpc.redEnvelopes.list.useQuery();
  const createMutation = trpc.redEnvelopes.create.useMutation();
  const updateMutation = trpc.redEnvelopes.update.useMutation();
  const deleteMutation = trpc.redEnvelopes.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredRedEnvelopes = data?.filter((envelope) =>
    envelope.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadgeColor = (status: RedEnvelope['status']) => {
    switch (status) {
      case 'active':
        return COLORS.success;
      case 'expired':
        return COLORS.error;
      case 'claimed':
        return COLORS.muted;
      default:
        return COLORS.muted;
    }
  };

  const handleCreateRedEnvelope = async () => {
    if (!newRedEnvelopeName || !newRedEnvelopeAmount) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: newRedEnvelopeName,
        amount: parseFloat(newRedEnvelopeAmount),
        currency: newRedEnvelopeCurrency,
      });
      setCreateModalVisible(false);
      setNewRedEnvelopeName('');
      setNewRedEnvelopeAmount('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error creating red envelope', error.message || 'An unknown error occurred.');
    }
  };

  const handleEditRedEnvelope = async () => {
    if (!currentRedEnvelope || !newRedEnvelopeName || !newRedEnvelopeAmount) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: currentRedEnvelope.id,
        name: newRedEnvelopeName,
        amount: parseFloat(newRedEnvelopeAmount),
        currency: newRedEnvelopeCurrency,
      });
      setEditModalVisible(false);
      setCurrentRedEnvelope(null);
      setNewRedEnvelopeName('');
      setNewRedEnvelopeAmount('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error updating red envelope', error.message || 'An unknown error occurred.');
    }
  };

  const handleDeleteRedEnvelope = (id: string) => {
    Alert.alert(
      'Delete Red Envelope',
      'Are you sure you want to delete this red envelope?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (error: any) {
              Alert.alert('Error deleting red envelope', error.message || 'An unknown error occurred.');
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (envelope: RedEnvelope) => {
    setCurrentRedEnvelope(envelope);
    setNewRedEnvelopeName(envelope.name);
    setNewRedEnvelopeAmount(envelope.amount.toString());
    setNewRedEnvelopeCurrency(envelope.currency);
    setEditModalVisible(true);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Red Envelopes...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load red envelopes.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!data || data.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No red envelopes found.</Text>
        <Button title="Create New" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: RedEnvelope }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusBadgeColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <Text style={styles.cardText}>Expires: {formatDate(item.expiresAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteRedEnvelope(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Red Envelopes</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search red envelopes..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredRedEnvelopes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressBackgroundColor={COLORS.card}
          />
        }
      />

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create Red Envelope</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={COLORS.muted}
              value={newRedEnvelopeName}
              onChangeText={setNewRedEnvelopeName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newRedEnvelopeAmount}
              onChangeText={setNewRedEnvelopeAmount}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newRedEnvelopeCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewRedEnvelopeCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newRedEnvelopeCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewRedEnvelopeCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreateRedEnvelope} color={COLORS.primary} />
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
            <Text style={styles.modalTitle}>Edit Red Envelope</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={COLORS.muted}
              value={newRedEnvelopeName}
              onChangeText={setNewRedEnvelopeName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newRedEnvelopeAmount}
              onChangeText={setNewRedEnvelopeAmount}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newRedEnvelopeCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewRedEnvelopeCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newRedEnvelopeCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewRedEnvelopeCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save Changes" onPress={handleEditRedEnvelope} color={COLORS.primary} />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  screenTitle: {
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
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 4,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    marginBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    marginBottom: 20,
  },
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
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: COLORS.text,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  currencyToggle: {
    flexDirection: 'row',
    marginBottom: 15,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.background,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default RedEnvelopesScreen;
