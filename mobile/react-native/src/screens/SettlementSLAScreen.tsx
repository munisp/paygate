import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Type definitions for Settlement SLA data (assuming a basic structure)
interface SettlementSLA {
  id: string;
  merchantId: string;
  serviceType: string;
  slaDays: number;
  status: 'Active' | 'Inactive' | 'Pending';
  createdAt: string;
  updatedAt: string;
}

const SettlementSLAScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [currentSLA, setCurrentSLA] = useState<SettlementSLA | null>(null);
  const [serviceType, setServiceType] = useState('');
  const [slaDays, setSlaDays] = useState('');

  // tRPC queries and mutations
  const { data, isLoading, isError, refetch, isRefetching } = trpc.settlementSLA.list.useQuery();
  const createMutation = trpc.settlementSLA.create.useMutation();
  const updateMutation = trpc.settlementSLA.update.useMutation();
  const deleteMutation = trpc.settlementSLA.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.serviceType.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateOrUpdate = async () => {
    if (!serviceType || !slaDays) {
      Alert.alert('Error', 'Service Type and SLA Days are required.');
      return;
    }
    const slaDaysNum = parseInt(slaDays, 10);
    if (isNaN(slaDaysNum) || slaDaysNum <= 0) {
      Alert.alert('Error', 'SLA Days must be a positive number.');
      return;
    }

    try {
      if (currentSLA) {
        await updateMutation.mutateAsync({
          id: currentSLA.id,
          serviceType,
          slaDays: slaDaysNum,
        });
        Alert.alert('Success', 'SLA updated successfully.');
      } else {
        await createMutation.mutateAsync({
          serviceType,
          slaDays: slaDaysNum,
        });
        Alert.alert('Success', 'SLA created successfully.');
      }
      setModalVisible(false);
      setServiceType('');
      setSlaDays('');
      setCurrentSLA(null);
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save SLA.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this SLA?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              Alert.alert('Success', 'SLA deleted successfully.');
              refetch();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete SLA.');
            }
          },
        },
      ]
    );
  };

  const openCreateModal = () => {
    setCurrentSLA(null);
    setServiceType('');
    setSlaDays('');
    setModalVisible(true);
  };

  const openEditModal = (item: SettlementSLA) => {
    setCurrentSLA(item);
    setServiceType(item.serviceType);
    setSlaDays(item.slaDays.toString());
    setModalVisible(true);
  };

  const renderStatusBadge = (status: SettlementSLA['status']) => {
    let color = COLORS.muted;
    switch (status) {
      case 'Active':
        color = COLORS.success;
        break;
      case 'Inactive':
        color = COLORS.error;
        break;
      case 'Pending':
        color = COLORS.warning;
        break;
    }
    return (
      <View style={[styles.badge, { backgroundColor: color }]}>
        <Text style={styles.badgeText}>{status}</Text>
      </View>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const renderItem = ({ item }: { item: SettlementSLA }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.serviceType}</Text>
        {renderStatusBadge(item.status)}
      </View>
      <Text style={styles.cardText}>SLA Days: {item.slaDays}</Text>
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Settlement SLAs...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load Settlement SLAs.</Text>
        <Button title="Retry" onPress={refetch} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!filteredData || filteredData.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No Settlement SLAs found.</Text>
        <Button title="Create New SLA" onPress={openCreateModal} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settlement SLAs</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Create SLA</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by Service Type..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{currentSLA ? 'Edit SLA' : 'Create New SLA'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Service Type"
              placeholderTextColor={COLORS.muted}
              value={serviceType}
              onChangeText={setServiceType}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="SLA Days"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={slaDays}
              onChangeText={setSlaDays}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.muted} />
              <Button title={currentSLA ? 'Update' : 'Create'} onPress={handleCreateOrUpdate} color={COLORS.primary} />
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
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
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
    margin: 15,
    paddingHorizontal: 15,
    color: COLORS.text,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 5,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  badgeText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 20,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    height: 45,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
});

export default SettlementSLAScreen;
