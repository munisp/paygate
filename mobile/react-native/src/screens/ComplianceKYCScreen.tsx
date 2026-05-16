import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, RefreshControl, Alert, TextInput, TouchableOpacity, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Real tRPC client

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface ComplianceKYCItem {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  submissionDate: string;
  reviewDate?: string;
  notes?: string;
}

interface CreateKYCInput {
  type: string;
  notes?: string;
}

interface UpdateKYCInput {
  id: string;
  type?: string;
  status?: 'pending' | 'approved' | 'rejected';
  notes?: string;
}

const ComplianceKYCScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [newKycType, setNewKycType] = useState('');
  const [newKycNotes, setNewKycNotes] = useState('');
  const [editingKyc, setEditingKyc] = useState<ComplianceKYCItem | null>(null);
  const [editedKycType, setEditedKycType] = useState('');
  const [editedKycNotes, setEditedKycNotes] = useState('');
  const [editedKycStatus, setEditedKycStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const { data: kycData, isLoading, isError, refetch } = trpc.complianceKyc.list.useQuery();
  const createKycMutation = trpc.complianceKyc.create.useMutation();
  const updateKycMutation = trpc.complianceKyc.update.useMutation();
  const deleteKycMutation = trpc.complianceKyc.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (editingKyc) {
      setEditedKycType(editingKyc.type);
      setEditedKycNotes(editingKyc.notes || '');
      setEditedKycStatus(editingKyc.status);
    }
  }, [editingKyc]);

  const filteredData = kycData?.filter((item: ComplianceKYCItem) =>
    item.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.status.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleCreateKyc = async () => {
    if (!newKycType) {
      Alert.alert('Error', 'KYC Type cannot be empty.');
      return;
    }
    try {
      await createKycMutation.mutateAsync({ type: newKycType, notes: newKycNotes });
      Alert.alert('Success', 'KYC record created successfully.');
      setCreateModalVisible(false);
      setNewKycType('');
      setNewKycNotes('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', `Failed to create KYC record: ${error.message}`);
    }
  };

  const handleUpdateKyc = async () => {
    if (!editingKyc || !editedKycType) {
      Alert.alert('Error', 'KYC Type cannot be empty.');
      return;
    }
    try {
      await updateKycMutation.mutateAsync({
        id: editingKyc.id,
        type: editedKycType,
        notes: editedKycNotes,
        status: editedKycStatus,
      });
      Alert.alert('Success', 'KYC record updated successfully.');
      setEditModalVisible(false);
      setEditingKyc(null);
      refetch();
    } catch (error: any) {
      Alert.alert('Error', `Failed to update KYC record: ${error.message}`);
    }
  };

  const handleDeleteKyc = (id: string) => {
    Alert.alert(
      'Delete KYC Record',
      'Are you sure you want to delete this KYC record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteKycMutation.mutateAsync({ id });
              Alert.alert('Success', 'KYC record deleted successfully.');
              refetch();
            } catch (error: any) {
              Alert.alert('Error', `Failed to delete KYC record: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: ComplianceKYCItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.type}</Text>
      <Text style={styles.cardText}>Status: <Text style={{ color: item.status === 'approved' ? COLORS.success : item.status === 'rejected' ? COLORS.error : COLORS.warning }}>{item.status}</Text></Text>
      <Text style={styles.cardText}>Submitted: {new Date(item.submissionDate).toLocaleDateString()}</Text>
      {item.reviewDate && <Text style={styles.cardText}>Reviewed: {new Date(item.reviewDate).toLocaleDateString()}</Text>}
      {item.notes && <Text style={styles.cardText}>Notes: {item.notes}</Text>}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: COLORS.primary }]}
          onPress={() => {
            setEditingKyc(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: COLORS.error, marginLeft: 10 }]}
          onPress={() => handleDeleteKyc(item.id)}
        >
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading KYC data...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load KYC data. Please try again.</Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary, marginTop: 20 }]} onPress={refetch}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (filteredData.length === 0 && !searchQuery) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No KYC records found.</Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary, marginTop: 20 }]} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.buttonText}>Add New KYC</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Compliance KYC</Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary }]} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.buttonText}>Add New</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search KYC records..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]} // for Android
            progressBackgroundColor={COLORS.card} // for Android
          />
        }
      />

      {/* Create KYC Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New KYC Record</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="KYC Type (e.g., Business Registration)"
              placeholderTextColor={COLORS.muted}
              value={newKycType}
              onChangeText={setNewKycType}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Notes (optional)"
              placeholderTextColor={COLORS.muted}
              value={newKycNotes}
              onChangeText={setNewKycNotes}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: COLORS.error, marginRight: 10 }]}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: COLORS.primary }]}
                onPress={handleCreateKyc}
              >
                <Text style={styles.buttonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit KYC Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit KYC Record</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="KYC Type"
              placeholderTextColor={COLORS.muted}
              value={editedKycType}
              onChangeText={setEditedKycType}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Notes (optional)"
              placeholderTextColor={COLORS.muted}
              value={editedKycNotes}
              onChangeText={setEditedKycNotes}
              multiline
            />
            <View style={styles.statusPickerContainer}>
              <Text style={styles.statusPickerLabel}>Status:</Text>
              <TouchableOpacity
                style={[styles.statusOption, editedKycStatus === 'pending' && styles.statusOptionSelected]}
                onPress={() => setEditedKycStatus('pending')}
              >
                <Text style={[styles.statusOptionText, editedKycStatus === 'pending' && styles.statusOptionTextSelected]}>Pending</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusOption, editedKycStatus === 'approved' && styles.statusOptionSelected]}
                onPress={() => setEditedKycStatus('approved')}
              >
                <Text style={[styles.statusOptionText, editedKycStatus === 'approved' && styles.statusOptionTextSelected]}>Approved</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusOption, editedKycStatus === 'rejected' && styles.statusOptionSelected]}
                onPress={() => setEditedKycStatus('rejected')}
              >
                <Text style={[styles.statusOptionText, editedKycStatus === 'rejected' && styles.statusOptionTextSelected]}>Rejected</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: COLORS.error, marginRight: 10 }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: COLORS.primary }]}
                onPress={handleUpdateKyc}
              >
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
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
    color: COLORS.text,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    textAlign: 'center',
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 15,
    margin: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  listContent: {
    padding: 10,
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardText: {
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 3,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 14,
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
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    marginTop: 10,
  },
  statusPickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 15,
    paddingVertical: 5,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusPickerLabel: {
    color: COLORS.muted,
    fontSize: 16,
    alignSelf: 'center',
    marginRight: 10,
  },
  statusOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusOptionText: {
    color: COLORS.text,
    fontSize: 14,
  },
  statusOptionTextSelected: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default ComplianceKYCScreen;