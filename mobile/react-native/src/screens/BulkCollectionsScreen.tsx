import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path is correct based on requirement

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface BulkCollection {
  id: string;
  name: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

const BulkCollectionsScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingCollection, setEditingCollection] = useState<BulkCollection | null>(null);
  const [collectionName, setCollectionName] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionCurrency, setCollectionCurrency] = useState<'NGN' | 'USD'>('NGN');

  const { data: collections, isLoading, isError, error, refetch } = trpc.bulkCollections.list.useQuery();
  const createCollectionMutation = trpc.bulkCollections.create.useMutation();
  const updateCollectionMutation = trpc.bulkCollections.update.useMutation();
  const deleteCollectionMutation = trpc.bulkCollections.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredCollections = collections?.filter(collection =>
    collection.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const getStatusStyle = (status: BulkCollection["status"]) => {
    switch (status) {
      case "completed":
        return styles.statusCompleted;
      case "pending":
        return styles.statusPending;
      case "failed":
        return styles.statusFailed;
      default:
        return {};
    }
  };

  const handleCreateOrUpdateCollection = async () => {
    if (!collectionName || !collectionAmount) {
      Alert.alert('Error', 'Please enter both name and amount.');
      return;
    }
    const amount = parseFloat(collectionAmount);
    if (isNaN(amount)) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    try {
      if (editingCollection) {
        await updateCollectionMutation.mutateAsync({
          id: editingCollection.id,
          name: collectionName,
          amount,
          currency: collectionCurrency,
        });
        Alert.alert('Success', 'Collection updated successfully!');
      } else {
        await createCollectionMutation.mutateAsync({
          name: collectionName,
          amount,
          currency: collectionCurrency,
        });
        Alert.alert('Success', 'Collection created successfully!');
      }
      setModalVisible(false);
      setEditingCollection(null);
      setCollectionName('');
      setCollectionAmount('');
      setCollectionCurrency('NGN');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save collection.');
    }
  };

  const handleDeleteCollection = (id: string) => {
    Alert.alert(
      'Delete Collection',
      'Are you sure you want to delete this collection?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCollectionMutation.mutateAsync({ id });
              Alert.alert('Success', 'Collection deleted successfully!');
              refetch();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete collection.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (collection: BulkCollection) => {
    setEditingCollection(collection);
    setCollectionName(collection.name);
    setCollectionAmount(collection.amount.toString());
    setCollectionCurrency(collection.currency);
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: BulkCollection }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardText}>Amount: {item.currency === 'NGN' ? '₦' : '$'}{item.amount.toFixed(2)}</Text>
      <View style={styles.statusBadge}>
        <Text style={[styles.cardText, getStatusStyle(item.status)]}>Status: {item.status.charAt(0).toUpperCase() + item.status.slice(1)}</Text>
      </View>
      <Text style={styles.cardText}>Created: {new Date(item.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEditModal(item)}>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteCollection(item.id)}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>Error: {error?.message}</Text>
      </SafeAreaView>
    );
  }

  if (!collections || collections.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.emptyText}>No bulk collections found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bulk Collections</Text>
        <TouchableOpacity onPress={() => { setEditingCollection(null); setCollectionName(''); setCollectionAmount(''); setCollectionCurrency('NGN'); setModalVisible(true); }} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search collections..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredCollections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingCollection ? 'Edit Collection' : 'Create New Collection'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Collection Name"
              placeholderTextColor={COLORS.muted}
              value={collectionName}
              onChangeText={setCollectionName}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={collectionAmount}
              onChangeText={setCollectionAmount}
            />
            {/* Currency selection could be a Picker or custom component */}
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.muted} />
              <Button title={editingCollection ? 'Save Changes' : 'Create'} onPress={handleCreateOrUpdateCollection} color={COLORS.primary} />
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
    backgroundColor: COLORS.card,
    margin: 16,
    padding: 10,
    borderRadius: 8,
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 2,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  editText: {
    color: COLORS.primary,
    marginRight: 15,
    fontWeight: 'bold',
  },
  deleteText: {
    color: COLORS.error,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 10,
    width: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  statusCompleted: {
    color: COLORS.success,
    fontWeight: 'bold',
  },
  statusPending: {
    color: COLORS.warning,
    fontWeight: 'bold',
  },
  statusFailed: {
    color: COLORS.error,
    fontWeight: 'bold',
  },
});

export default BulkCollectionsScreen;