import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Picker } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// --- Design System Colors ---
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// --- tRPC Type Definitions (Inferred) ---
interface TaxEngineItem {
  id: string;
  name: string;
  rate: number;
  status: 'active' | 'inactive';
  lastUpdated: string;
  currency: 'NGN' | 'USD';
}

interface TaxEngineCreateInput {
  name: string;
  rate: number;
  currency: 'NGN' | 'USD';
}

interface TaxEngineUpdateInput {
  id: string;
  name?: string;
  rate?: number;
  status?: 'active' | 'inactive';
  currency?: 'NGN' | 'USD';
}

// Placeholder for tRPC client methods


// --- TaxEngineScreen Component (Scaffold) ---
const TaxEngineScreen = () => {
  const navigation = useNavigation();

  // State for data, loading, error, etc.
  const { data: taxItems, isLoading, isError, refetch } = trpc.taxEngine.list.useQuery();

  const createMutation = trpc.taxEngine.create.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
      setNewTaxName("");
      setNewTaxRate("");
    },
  });
  const updateMutation = trpc.taxEngine.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditModalVisible(false);
      setCurrentEditItem(null);
    },
  });
  const deleteMutation = trpc.taxEngine.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  // State for modals, form inputs, etc.
  const [isCreateModalVisible, setCreateModalVisible] = React.useState(false);
  const [isEditModalVisible, setEditModalVisible] = React.useState(false);
  const [currentEditItem, setCurrentEditItem] = React.useState<TaxEngineItem | null>(null);
  const [newTaxName, setNewTaxName] = React.useState('');
  const [newTaxRate, setNewTaxRate] = React.useState('');
  const [newTaxCurrency, setNewTaxCurrency] = React.useState<'NGN' | 'USD'>('NGN');
  const [searchQuery, setSearchQuery] = React.useState('');

    const handleCreateTax = () => {
    if (!newTaxName || !newTaxRate) return;
    createMutation.mutate({
      name: newTaxName,
      rate: parseFloat(newTaxRate),
      currency: newTaxCurrency,
    });
    setCreateModalVisible(false);
    setNewTaxName('');
    setNewTaxRate('');
  };

    const handleEditTax = () => {
    if (!currentEditItem) return;
    updateMutation.mutate({
      id: currentEditItem.id,
      name: currentEditItem.name,
      rate: currentEditItem.rate,
      status: currentEditItem.status,
      currency: currentEditItem.currency,
    });
    setEditModalVisible(false);
    setCurrentEditItem(null);
  };

  const handleDeleteTax = (id: string) => {
    Alert.alert(
      'Delete Tax Item',
      'Are you sure you want to delete this tax item?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { deleteMutation.mutate({ id }); } },
      ]
    );
  };

  const renderTaxItem = ({ item }: { item: TaxEngineItem }) => (
    <View style={styles.itemContainer}>
      <View>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDetails}>Rate: {item.currency === 'NGN' ? '₦' : '$'}{item.rate}%</Text>
        <Text style={styles.itemDetails}>Status: <Text style={[styles.statusBadge, item.status === 'active' ? styles.statusActive : styles.statusInactive]}>{item.status}</Text></Text>
        <Text style={styles.itemDetails}>Last Updated: {new Date(item.lastUpdated).toLocaleDateString()}</Text>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => { setCurrentEditItem(item); setEditModalVisible(true); }} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteTax(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const filteredTaxItems = taxItems?.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tax Engine</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Add New Tax</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search tax items..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {isLoading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loadingIndicator} />
      ) : isError ? (
        <Text style={styles.errorText}>Failed to load tax items.</Text>
      ) : filteredTaxItems && filteredTaxItems.length === 0 ? (
        <Text style={styles.emptyText}>No tax items found.</Text>
      ) : (
        <FlatList
          data={filteredTaxItems}
          keyExtractor={(item) => item.id}
          renderItem={renderTaxItem}
          contentContainerStyle={styles.listContentContainer}
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Tax Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Tax Name"
              placeholderTextColor={COLORS.muted}
              value={newTaxName}
              onChangeText={setNewTaxName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Tax Rate (%)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newTaxRate}
              onChangeText={setNewTaxRate}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={newTaxCurrency}
                onValueChange={(itemValue) => setNewTaxCurrency(itemValue)}
                style={styles.picker}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <TouchableOpacity onPress={handleCreateTax} style={styles.modalButton}>
              <Text style={styles.modalButtonText}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCreateModalVisible(false)} style={[styles.modalButton, { backgroundColor: COLORS.muted }]}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
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
            <Text style={styles.modalTitle}>Edit Tax Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Tax Name"
              placeholderTextColor={COLORS.muted}
              value={currentEditItem?.name || ''}
              onChangeText={(text) => setCurrentEditItem(prev => prev ? { ...prev, name: text } : null)}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Tax Rate (%)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentEditItem?.rate.toString() || ''}
              onChangeText={(text) => setCurrentEditItem(prev => prev ? { ...prev, rate: parseFloat(text) || 0 } : null)}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={currentEditItem?.currency || 'NGN'}
                onValueChange={(itemValue) => setCurrentEditItem(prev => prev ? { ...prev, currency: itemValue } : null)}
                style={styles.picker}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <Picker
                selectedValue={currentEditItem?.status || 'active'}
                onValueChange={(itemValue) => setCurrentEditItem(prev => prev ? { ...prev, status: itemValue } : null)}
                style={styles.picker}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="Active" value="active" />
                <Picker.Item label="Inactive" value="inactive" />
              </Picker>
            </View>
            <TouchableOpacity onPress={handleEditTax} style={styles.modalButton}>
              <Text style={styles.modalButtonText}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditModalVisible(false)} style={[styles.modalButton, { backgroundColor: COLORS.muted }]}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
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
    backgroundColor: COLORS.card,
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
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  loadingIndicator: {
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
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  itemContainer: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  itemDetails: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusActive: {
    backgroundColor: COLORS.success + '30',
    color: COLORS.success,
  },
  statusInactive: {
    backgroundColor: COLORS.warning + '30',
    color: COLORS.warning,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 12,
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
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  modalButton: {
    backgroundColor: COLORS.primary,
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 5,
    marginBottom: 10,
    width: '100%',
    paddingHorizontal: 10,
  },
  pickerLabel: {
    color: COLORS.muted,
    marginRight: 10,
  },
  picker: {
    flex: 1,
    color: COLORS.text,
  },
  pickerItem: {
    color: COLORS.text,
  },
});

export default TaxEngineScreen;
