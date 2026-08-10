import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, Alert, TouchableOpacity, Modal, TextInput, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is available at this path

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Type definitions for Partner data (assuming a basic structure)
interface Partner {
  id: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected';
  onboardDate: string;
  revenueShare: number;
}

const PartnerOnboardScreen: React.FC = () => {
  const navigation = useNavigation();

  // tRPC queries and mutations
  const { data: partners, isLoading, isError, refetch, isRefetching } = trpc.partnerOnboard.list.useQuery();
  const createMutation = trpc.partnerOnboard.create.useMutation();
  const updateMutation = trpc.partnerOnboard.update.useMutation();
  const deleteMutation = trpc.partnerOnboard.delete.useMutation();

  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentPartner, setCurrentPartner] = useState<Partner | null>(null);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerRevenueShare, setNewPartnerRevenueShare] = useState('');

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleCreatePartner = async () => {
    if (!newPartnerName || !newPartnerRevenueShare) return;
    try {
      await createMutation.mutateAsync({
        name: newPartnerName,
        revenueShare: parseFloat(newPartnerRevenueShare),
      });
      setCreateModalVisible(false);
      setNewPartnerName('');
      setNewPartnerRevenueShare('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create partner.');
    }
  };

  const handleEditPartner = async () => {
    if (!currentPartner || !newPartnerName || !newPartnerRevenueShare) return;
    try {
      await updateMutation.mutateAsync({
        id: currentPartner.id,
        name: newPartnerName,
        revenueShare: parseFloat(newPartnerRevenueShare),
      });
      setEditModalVisible(false);
      setCurrentPartner(null);
      setNewPartnerName('');
      setNewPartnerRevenueShare('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update partner.');
    }
  };

  const handleDeletePartner = (id: string) => {
    Alert.alert(
      'Delete Partner',
      'Are you sure you want to delete this partner?',
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
              Alert.alert('Error', 'Failed to delete partner.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (partner: Partner) => {
    setCurrentPartner(partner);
    setNewPartnerName(partner.name);
    setNewPartnerRevenueShare(partner.revenueShare.toString());
    setEditModalVisible(true);
  };

  const renderPartnerItem = ({ item }: { item: Partner }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.partnerName}>{item.name}</Text>
        <View style={[styles.statusBadge, styles[item.status]]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.detailText}>Onboard Date: {new Date(item.onboardDate).toLocaleDateString()}</Text>
      <Text style={styles.detailText}>Revenue Share: {item.revenueShare.toFixed(2)}%</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePartner(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading partners...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load partners. Please try again.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!partners || partners.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No partners found.</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={[styles.actionButton, { backgroundColor: COLORS.success, marginTop: 20 }]}>
          <Text style={styles.actionButtonText}>Add New Partner</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Partner Onboarding</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={[styles.actionButton, { backgroundColor: COLORS.success }]}>
          <Text style={styles.actionButtonText}>Add Partner</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={partners}
        keyExtractor={(item) => item.id}
        renderItem={renderPartnerItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressBackgroundColor={COLORS.card}
          />
        }
      />

      {/* Create Partner Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Add New Partner</Text>
            <TextInput
              style={styles.input}
              placeholder="Partner Name"
              placeholderTextColor={COLORS.muted}
              value={newPartnerName}
              onChangeText={setNewPartnerName}
            />
            <TextInput
              style={styles.input}
              placeholder="Revenue Share (%)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newPartnerRevenueShare}
              onChangeText={setNewPartnerRevenueShare}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={handleCreatePartner} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Partner Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Partner</Text>
            <TextInput
              style={styles.input}
              placeholder="Partner Name"
              placeholderTextColor={COLORS.muted}
              value={newPartnerName}
              onChangeText={setNewPartnerName}
            />
            <TextInput
              style={styles.input}
              placeholder="Revenue Share (%)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newPartnerRevenueShare}
              onChangeText={setNewPartnerRevenueShare}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button title="Save" onPress={handleEditPartner} color={COLORS.primary} />
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
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
    marginBottom: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  partnerName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.background,
    fontWeight: 'bold',
    fontSize: 12,
  },
  pending: {
    backgroundColor: COLORS.warning,
  },
  approved: {
    backgroundColor: COLORS.success,
  },
  rejected: {
    backgroundColor: COLORS.error,
  },
  detailText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  actions: {
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 15,
  },
});

export default PartnerOnboardScreen;
