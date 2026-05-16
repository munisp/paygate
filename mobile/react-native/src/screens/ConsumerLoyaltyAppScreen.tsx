import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
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
import { trpc } from '../lib/trpc';

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

// Helper for currency formatting (assuming Naira or USD)
const formatCurrency = (amount: number, currencyCode: 'NGN' | 'USD' = 'NGN') => {
  const symbol = currencyCode === 'NGN' ? '₦' : '$';
  return `${symbol}${amount.toFixed(2)}`;
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

interface LoyaltyProgram {
  id: string;
  name: string;
  description: string;
  pointsMultiplier: number;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

const ConsumerLoyaltyAppScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [currentProgram, setCurrentProgram] = useState<Partial<LoyaltyProgram> | null>(null);

  const { data, isLoading, isError, refetch } = trpc.consumerLoyaltyApp.list.useQuery();
  const createMutation = trpc.consumerLoyaltyApp.create.useMutation({
    onSuccess: () => {
      refetch();
      setModalVisible(false);
      setCurrentProgram(null);
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to create loyalty program: ${error.message}`);
    },
  });
  const updateMutation = trpc.consumerLoyaltyApp.update.useMutation({
    onSuccess: () => {
      refetch();
      setModalVisible(false);
      setCurrentProgram(null);
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to update loyalty program: ${error.message}`);
    },
  });
  const deleteMutation = trpc.consumerLoyaltyApp.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete loyalty program: ${error.message}`);
    },
  });

  const filteredData = data?.filter(
    (program) =>
      program.name.toLowerCase().includes(searchText.toLowerCase()) ||
      program.description.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateOrUpdate = () => {
    if (!currentProgram?.name || !currentProgram?.description || !currentProgram?.pointsMultiplier) {
      Alert.alert('Validation Error', 'Please fill all required fields.');
      return;
    }

    if (currentProgram.id) {
      updateMutation.mutate({
        id: currentProgram.id,
        name: currentProgram.name,
        description: currentProgram.description,
        pointsMultiplier: currentProgram.pointsMultiplier,
        status: currentProgram.status, // Assuming status can also be updated
      } as any); // Type assertion due to partial type
    } else {
      createMutation.mutate({
        name: currentProgram.name,
        description: currentProgram.description,
        pointsMultiplier: currentProgram.pointsMultiplier,
        status: 'pending', // Default status for new programs
      });
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this loyalty program?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
      ]
    );
  };

  const openCreateModal = () => {
    setCurrentProgram({ name: '', description: '', pointsMultiplier: 1, status: 'pending' });
    setModalVisible(true);
  };

  const openEditModal = (program: LoyaltyProgram) => {
    setCurrentProgram({ ...program });
    setModalVisible(true);
  };

  const getStatusBadgeStyle = (status: LoyaltyProgram['status']) => {
    switch (status) {
      case 'active':
        return { backgroundColor: COLORS.success };
      case 'inactive':
        return { backgroundColor: COLORS.error };
      case 'pending':
        return { backgroundColor: COLORS.warning };
      default:
        return { backgroundColor: COLORS.muted };
    }
  };

  const renderItem = ({ item }: { item: LoyaltyProgram }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardDescription}>{item.description}</Text>
      <Text style={styles.cardText}>Points Multiplier: {item.pointsMultiplier}x</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
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
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Consumer Loyalty Programs</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Create New</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search loyalty programs..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {isLoading && (
        <View style={styles.centeredView}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading loyalty programs...</Text>
        </View>
      )}

      {isError && (
        <View style={styles.centeredView}>
          <Text style={styles.errorText}>Failed to load loyalty programs.</Text>
          <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      )}

      {!isLoading && !isError && filteredData?.length === 0 && (
        <View style={styles.centeredView}>
          <Text style={styles.emptyText}>No loyalty programs found.</Text>
          <Button title="Create New Program" onPress={openCreateModal} color={COLORS.primary} />
        </View>
      )}

      {!isLoading && !isError && filteredData && filteredData.length > 0 && (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.flatListContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(!modalVisible);
          setCurrentProgram(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{currentProgram?.id ? 'Edit Loyalty Program' : 'Create New Loyalty Program'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Program Name"
              placeholderTextColor={COLORS.muted}
              value={currentProgram?.name}
              onChangeText={(text) => setCurrentProgram((prev) => ({ ...prev, name: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={currentProgram?.description}
              onChangeText={(text) => setCurrentProgram((prev) => ({ ...prev, description: text }))}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Points Multiplier (e.g., 1.5)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentProgram?.pointsMultiplier?.toString()}
              onChangeText={(text) => setCurrentProgram((prev) => ({ ...prev, pointsMultiplier: parseFloat(text) || 0 }))}
            />
            {currentProgram?.id && (
              <TextInput
                style={styles.input}
                placeholder="Status (active, inactive, pending)"
                placeholderTextColor={COLORS.muted}
                value={currentProgram?.status}
                onChangeText={(text) => setCurrentProgram((prev) => ({ ...prev, status: text as LoyaltyProgram['status'] }))}
              />
            )}
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.muted} />
              <Button
                title={currentProgram?.id ? 'Update' : 'Create'}
                onPress={handleCreateOrUpdate}
                color={COLORS.primary}
                disabled={createMutation.isLoading || updateMutation.isLoading}
              />
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
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  flatListContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderColor: COLORS.border,
    borderWidth: 1,
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
    flexShrink: 1,
    marginRight: 10,
  },
  cardDescription: {
    color: COLORS.muted,
    marginBottom: 8,
  },
  cardText: {
    color: COLORS.text,
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  statusBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
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
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    width: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

export default ConsumerLoyaltyAppScreen;
