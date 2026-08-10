import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, RefreshControl, TextInput, TouchableOpacity, Alert, Modal, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface MarketDataItem {
  id: string;
  name: string;
  value: number;
  currency: 'NGN' | 'USD';
  lastUpdated: string;
  status: 'active' | 'inactive' | 'pending';
}

const MarketDataDashboardScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<MarketDataItem | null>(null);

  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCurrency, setNewCurrency] = useState<"NGN" | "USD">("NGN");
  const [newStatus, setNewStatus] = useState<"active" | "inactive" | "pending">("active");

  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editCurrency, setEditCurrency] = useState<"NGN" | "USD">("NGN");
  const [editStatus, setEditStatus] = useState<"active" | "inactive" | "pending">("active");

  const { data: marketData, isLoading, isError, refetch, isRefetching } = trpc.marketData.list.useQuery();

  const onRefresh = useCallback(() => {
    refetch();
  }, []);

  const createMutation = trpc.marketData.create.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
      setNewName("");
      setNewValue("");
      setNewCurrency("NGN");
      setNewStatus("active");
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to create market data: ${error.message}`);
    },
  });

  const updateMutation = trpc.marketData.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditModalVisible(false);
      setCurrentItem(null);
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to update market data: ${error.message}`);
    },
  });

  const deleteMutation = trpc.marketData.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to delete market data: ${error.message}`);
    },
  });

  const handleCreate = () => {
    if (!newName || !newValue) {
      Alert.alert("Error", "Name and Value are required.");
      return;
    }
    createMutation.mutate({
      name: newName,
      value: parseFloat(newValue),
      currency: newCurrency,
      status: newStatus,
    });
  };

  const handleEdit = () => {
    if (!currentItem || !editName || !editValue) {
      Alert.alert("Error", "All fields are required for editing.");
      return;
    }
    updateMutation.mutate({
      id: currentItem.id,
      name: editName,
      value: parseFloat(editValue),
      currency: editCurrency,
      status: editStatus,
    });
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      "Delete Item",
      "Are you sure you want to delete this item?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({ id }) },
      ]
    );
  };

  useEffect(() => {
    if (currentItem) {
      setEditName(currentItem.name);
      setEditValue(currentItem.value.toString());
      setEditCurrency(currentItem.currency);
      setEditStatus(currentItem.status);
    } else {
      setEditName("");
      setEditValue("");
      setEditCurrency("NGN");
      setEditStatus("active");
    }
  }, [currentItem]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Market Data Dashboard</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search market data..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Add New</Text>
        </TouchableOpacity>
      </View>

      {isLoading && !isRefetching ? (
        <View style={styles.centeredView}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : isError ? (
        <View style={styles.centeredView}>
          <Text style={styles.errorText}>Failed to load market data.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={marketData?.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.itemContainer}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={[styles.statusBadge, item.status === 'active' ? styles.statusActive : item.status === 'inactive' ? styles.statusInactive : styles.statusPending]}>
                  <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.itemValue}>
                {item.currency === 'NGN' ? '₦' : '$'}{' '}
                {item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.itemLastUpdated}>Last Updated: {new Date(item.lastUpdated).toLocaleString()}</Text>
              <View style={styles.itemActions}>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => { setCurrentItem(item); setEditModalVisible(true); }}>
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => {
                  Alert.alert(
                    "Delete Item",
                    `Are you sure you want to delete ${item.name}?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => handleDelete(item.id) }
                    ]
                  );
                }}>
                  <Text style={styles.actionButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={() => (
            <View style={styles.centeredView}>
              <Text style={styles.emptyText}>No market data available.</Text>
            </View>
          )}
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Market Data</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={COLORS.muted}
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Value"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newValue}
              onChangeText={setNewValue}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={newCurrency}
                style={styles.picker}
                onValueChange={(itemValue) => setNewCurrency(itemValue as "NGN" | "USD")}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <Picker
                selectedValue={newStatus}
                style={styles.picker}
                onValueChange={(itemValue) => setNewStatus(itemValue as "active" | "inactive" | "pending")}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="Active" value="active" />
                <Picker.Item label="Inactive" value="inactive" />
                <Picker.Item label="Pending" value="pending" />
              </Picker>
            </View>
            <TouchableOpacity style={styles.modalButton} onPress={handleCreate}>
              <Text style={styles.modalButtonText}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.muted }]} onPress={() => setCreateModalVisible(false)}>
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
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Market Data</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={COLORS.muted}
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Value"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={editValue}
              onChangeText={setEditValue}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={editCurrency}
                style={styles.picker}
                onValueChange={(itemValue) => setEditCurrency(itemValue as "NGN" | "USD")}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <Picker
                selectedValue={editStatus}
                style={styles.picker}
                onValueChange={(itemValue) => setEditStatus(itemValue as "active" | "inactive" | "pending")}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="Active" value="active" />
                <Picker.Item label="Inactive" value="inactive" />
                <Picker.Item label="Pending" value="pending" />
              </Picker>
            </View>
            <TouchableOpacity style={styles.modalButton} onPress={handleEdit}>
              <Text style={styles.modalButtonText}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.muted }]} onPress={() => setEditModalVisible(false)}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
  },
  itemContainer: {
    backgroundColor: COLORS.card,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  statusActive: {
    backgroundColor: COLORS.success,
  },
  statusInactive: {
    backgroundColor: COLORS.error,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  itemValue: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  itemLastUpdated: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 8,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 15,
  },
  modalButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  pickerLabel: {
    color: COLORS.text,
    marginRight: 10,
  },
  picker: {
    flex: 1,
    color: COLORS.text,
    height: 40,
  },
  pickerItem: {
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
});

export default MarketDataDashboardScreen;