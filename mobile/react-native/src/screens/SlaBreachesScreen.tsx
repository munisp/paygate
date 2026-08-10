import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface SlaBreach {
  id: string;
  merchantId: string;
  breachDate: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'closed' | 'investigating';
  description: string;
  resolutionNotes?: string;
}

const SlaBreachesScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentSlaBreach, setCurrentSlaBreach] = useState<SlaBreach | null>(null);

  const { data: slaBreaches, isLoading, isError, refetch } = trpc.slaBreaches.list.useQuery();
  const createMutation = trpc.slaBreaches.create.useMutation();
  const updateMutation = trpc.slaBreaches.update.useMutation();
  const deleteMutation = trpc.slaBreaches.delete.useMutation();

  // Ensure slaBreaches is an array even if data is undefined
  const currentSlaBreaches = slaBreaches || [];

  useEffect(() => {
    if (createMutation.isSuccess || updateMutation.isSuccess || deleteMutation.isSuccess) {
      refetch();
    }
  }, [createMutation.isSuccess, updateMutation.isSuccess, deleteMutation.isSuccess, refetch]);

  const filteredSlaBreaches = currentSlaBreaches.filter(breach =>
    breach.description.toLowerCase().includes(searchText.toLowerCase()) ||
    breach.merchantId.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = (newBreach: Omit<SlaBreach, 'id'>) => {
    createMutation.mutate(newBreach as any); // Cast to any as tRPC input type might differ slightly
    setCreateModalVisible(false);
  };

  const handleUpdate = (updatedBreach: SlaBreach) => {
    updateMutation.mutate(updatedBreach as any); // Cast to any as tRPC input type might differ slightly
    setEditModalVisible(false);
    setCurrentSlaBreach(null);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this SLA breach?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
            deleteMutation.mutate({ id });
          }
        },
      ]
    );
  };

  const renderSlaBreachItem = ({ item }: { item: SlaBreach }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Breach ID: {item.id}</Text>
        <Text style={[styles.statusBadge, styles[`status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`]]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.cardText}>Merchant ID: {item.merchantId}</Text>
      <Text style={styles.cardText}>Date: {new Date(item.breachDate).toLocaleDateString()}</Text>
      <Text style={styles.cardText}>Severity: <Text style={[styles.severityText, styles[`severity${item.severity.charAt(0).toUpperCase() + item.severity.slice(1)}`]]}>{item.severity.toUpperCase()}</Text></Text>
      <Text style={styles.cardText}>Description: {item.description}</Text>
      {item.resolutionNotes && <Text style={styles.cardText}>Resolution: {item.resolutionNotes}</Text>}
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.button, styles.editButton]} onPress={() => { setCurrentSlaBreach(item); setEditModalVisible(true); }}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading SLA Breaches...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load SLA Breaches.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SLA Breaches</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.buttonText}>Add New</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by description or merchant ID..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredSlaBreaches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No SLA breaches found.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.buttonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredSlaBreaches}
          keyExtractor={(item) => item.id}
          renderItem={renderSlaBreachItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New SLA Breach</Text>
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Merchant ID" onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, merchantId: text }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Breach Date (YYYY-MM-DD)" onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, breachDate: text }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Severity (low, medium, high)" onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, severity: text as any }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Status (open, closed, investigating)" onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, status: text as any }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Description" onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, description: text }))} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={() => currentSlaBreach && handleCreate(currentSlaBreach)}>
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit SLA Breach</Text>
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Merchant ID" value={currentSlaBreach?.merchantId} onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, merchantId: text }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Breach Date (YYYY-MM-DD)" value={currentSlaBreach?.breachDate} onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, breachDate: text }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Severity (low, medium, high)" value={currentSlaBreach?.severity} onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, severity: text as any }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Status (open, closed, investigating)" value={currentSlaBreach?.status} onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, status: text as any }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Description" value={currentSlaBreach?.description} onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, description: text }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Resolution Notes" value={currentSlaBreach?.resolutionNotes} onChangeText={(text) => setCurrentSlaBreach(prev => ({ ...prev!, resolutionNotes: text }))} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={() => currentSlaBreach && handleUpdate(currentSlaBreach)}>
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
    fontSize: 16,
    marginBottom: 20,
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
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 10,
    borderRadius: 5,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusOpen: {
    backgroundColor: COLORS.error,
    color: COLORS.text,
  },
  statusClosed: {
    backgroundColor: COLORS.success,
    color: COLORS.text,
  },
  statusInvestigating: {
    backgroundColor: COLORS.warning,
    color: COLORS.text,
  },
  severityText: {
    fontWeight: 'bold',
  },
  severityLow: {
    color: COLORS.success,
  },
  severityMedium: {
    color: COLORS.warning,
  },
  severityHigh: {
    color: COLORS.error,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderRadius: 10,
    width: '80%',
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 15,
  },
  cancelButton: {
    backgroundColor: COLORS.muted,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
});

export default SlaBreachesScreen;
