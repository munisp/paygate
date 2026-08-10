import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, SafeAreaView, StatusBar, TextInput, TouchableOpacity, Alert, Modal, RefreshControl } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Mock types for Corridor - these would typically come from a shared tRPC schema
interface Corridor {
  id: string;
  name: string;
  sourceCountry: string;
  destinationCountry: string;
  status: 'Active' | 'Inactive';
  rate: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
  updatedAt: string;
}

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
  if (currency === 'NGN') {
    return `₦${amount.toFixed(2)}`;
  } else if (currency === 'USD') {
    return `$${amount.toFixed(2)}`;
  }
  return amount.toFixed(2);
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const CorridorManagementScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingCorridor, setEditingCorridor] = useState<Corridor | null>(null);

  const { data: corridors, isLoading, isError, refetch } = trpc.corridorManagement.list.useQuery();
  const [newCorridorName, setNewCorridorName] = useState('');
  const [newCorridorSourceCountry, setNewCorridorSourceCountry] = useState('');
  const [newCorridorDestinationCountry, setNewCorridorDestinationCountry] = useState('');
  const [newCorridorRate, setNewCorridorRate] = useState('');
  const [newCorridorCurrency, setNewCorridorCurrency] = useState<'NGN' | 'USD'>('USD');
  const createCorridorMutation = trpc.corridorManagement.create.useMutation();
  const updateCorridorMutation = trpc.corridorManagement.update.useMutation();
  const deleteCorridorMutation = trpc.corridorManagement.delete.useMutation();

  const filteredCorridors = corridors?.filter(corridor =>
    corridor.name.toLowerCase().includes(searchText.toLowerCase()) ||
    corridor.sourceCountry.toLowerCase().includes(searchText.toLowerCase()) ||
    corridor.destinationCountry.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateCorridor = async () => {
    const newCorridorData = {
      name: newCorridorName,
      sourceCountry: newCorridorSourceCountry,
      destinationCountry: newCorridorDestinationCountry,
      rate: parseFloat(newCorridorRate) || 0,
      currency: newCorridorCurrency,
      status: 'Active' as 'Active' // Default status
    };
    try {
      await createCorridorMutation.mutateAsync(newCorridorData);
      refetch();
      setCreateModalVisible(false);
      setNewCorridorName('');
      setNewCorridorSourceCountry('');
      setNewCorridorDestinationCountry('');
      setNewCorridorRate('');
      setNewCorridorCurrency('USD');

    } catch (error) {
      Alert.alert('Error', 'Failed to create corridor.');
    }
  };

  const handleUpdateCorridor = async (updatedCorridorData: Corridor) => {
    try {
      await updateCorridorMutation.mutateAsync(updatedCorridorData);
      refetch();
      setEditModalVisible(false);
      setEditingCorridor(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to update corridor.');
    }
  };

  const handleDeleteCorridor = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this corridor?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCorridorMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete corridor.');
            }
          },
        },
      ]
    );
  };

  const renderCorridorItem = ({ item }: { item: Corridor }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardText}>From: {item.sourceCountry} To: {item.destinationCountry}</Text>
      <Text style={styles.cardText}>Rate: {formatCurrency(item.rate, item.currency)}</Text>
      <Text style={styles.cardText}>Status: <Text style={[styles.badge, item.status === 'Active' ? styles.badgeActive : styles.badgeInactive]}>{item.status}</Text></Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.button, styles.editButton]} onPress={() => { setEditingCorridor(item); setEditModalVisible(true); }}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={() => handleDeleteCorridor(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
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
          <Text style={styles.loadingText}>Loading corridors...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load corridors.</Text>
          <TouchableOpacity style={styles.button} onPress={() => refetch()}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Corridor Management</Text>
        <TouchableOpacity style={styles.button} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.buttonText}>Add Corridor</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search corridors..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredCorridors && filteredCorridors.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No corridors found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCorridors}
          keyExtractor={(item) => item.id}
          renderItem={renderCorridorItem}
          contentContainerStyle={styles.listContent}
          onRefresh={refetch}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Corridor Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Corridor</Text>
            {/* Form fields for new corridor */}
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={COLORS.muted} value={newCorridorName} onChangeText={setNewCorridorName} />
            <TextInput style={styles.input} placeholder="Source Country" placeholderTextColor={COLORS.muted} value={newCorridorSourceCountry} onChangeText={setNewCorridorSourceCountry} />
            <TextInput style={styles.input} placeholder="Destination Country" placeholderTextColor={COLORS.muted} value={newCorridorDestinationCountry} onChangeText={setNewCorridorDestinationCountry} />
            <TextInput style={styles.input} placeholder="Rate" keyboardType="numeric" placeholderTextColor={COLORS.muted} value={newCorridorRate} onChangeText={setNewCorridorRate} />
            <TextInput style={styles.input} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={newCorridorCurrency} onChangeText={(text) => setNewCorridorCurrency(text as 'NGN' | 'USD')} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleCreateCorridor}>
                <Text style={styles.buttonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Corridor Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Corridor</Text>
            {editingCorridor && (
              <>
                <TextInput style={styles.input} placeholder="Name" placeholderTextColor={COLORS.muted} value={editingCorridor.name} onChangeText={(text) => setEditingCorridor({ ...editingCorridor, name: text })} />
                <TextInput style={styles.input} placeholder="Source Country" placeholderTextColor={COLORS.muted} value={editingCorridor.sourceCountry} onChangeText={(text) => setEditingCorridor({ ...editingCorridor, sourceCountry: text })} />
                <TextInput style={styles.input} placeholder="Destination Country" placeholderTextColor={COLORS.muted} value={editingCorridor.destinationCountry} onChangeText={(text) => setEditingCorridor({ ...editingCorridor, destinationCountry: text })} />
                <TextInput style={styles.input} placeholder="Rate" keyboardType="numeric" placeholderTextColor={COLORS.muted} value={String(editingCorridor.rate)} onChangeText={(text) => setEditingCorridor({ ...editingCorridor, rate: parseFloat(text) || 0 })} />
                <TextInput style={styles.input} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={editingCorridor.currency} onChangeText={(text) => setEditingCorridor({ ...editingCorridor, currency: text as 'NGN' | 'USD' })} />
                <Picker
                  selectedValue={editingCorridor.status}
                  style={styles.picker}
                  onValueChange={(itemValue) => setEditingCorridor({ ...editingCorridor, status: itemValue as 'Active' | 'Inactive' })}
                >
                  <Picker.Item label="Active" value="Active" />
                  <Picker.Item label="Inactive" value="Inactive" />
                </Picker>
              </>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => { setEditModalVisible(false); setEditingCorridor(null); }}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={() => editingCorridor && handleUpdateCorridor(editingCorridor)}>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 2,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: 'bold',
    fontSize: 12,
  },
  badgeActive: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  badgeInactive: {
    backgroundColor: COLORS.error,
    color: COLORS.background,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  editButton: {
    backgroundColor: COLORS.warning,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  input: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    color: COLORS.text,
    backgroundColor: COLORS.background,
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
  picker: {
    height: 50,
    width: '100%',
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
  },
});

export default CorridorManagementScreen;