import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

// Mock tRPC client for demonstration purposes
const trpc = {
  dataExport: {
    list: {
      useQuery: (params: any) => {
        const [data, setData] = useState<any[]>([]);
        const [isLoading, setIsLoading] = useState(true);
        const [isError, setIsError] = useState(false);

        useEffect(() => {
          setIsLoading(true);
          setIsError(false);
          // Simulate API call
          setTimeout(() => {
            if (Math.random() > 0.1) { // Simulate occasional error
              const mockData = [
                { id: '1', name: 'Monthly Sales Report', type: 'CSV', status: 'completed', date: '2026-04-15T10:00:00Z', amount: 123456.78, currency: 'NGN' },
                { id: '2', name: 'Customer Data Export', type: 'JSON', status: 'pending', date: '2026-05-01T14:30:00Z', amount: 0, currency: 'USD' },
                { id: '3', name: 'Daily Transactions', type: 'PDF', status: 'failed', date: '2026-05-10T08:00:00Z', amount: 9876.54, currency: 'NGN' },
                { id: '4', name: 'Weekly Inventory', type: 'CSV', status: 'completed', date: '2026-05-12T11:00:00Z', amount: 5000.00, currency: 'USD' },
                { id: '5', name: 'User Activity Log', type: 'JSON', status: 'processing', date: '2026-05-15T16:00:00Z', amount: 0, currency: 'NGN' },
              ];
              const filteredData = mockData.filter(item =>
                item.name.toLowerCase().includes(params?.search?.toLowerCase() || '')
              );
              setData(filteredData);
              setIsLoading(false);
            } else {
              setIsError(true);
              setIsLoading(false);
            }
          }, 1000);
        }, [params?.search]);

        return { data, isLoading, isError, refetch: () => {} }; // refetch is a placeholder
      },
    },
    create: {
      useMutation: () => {
        const [isLoading, setIsLoading] = useState(false);
        const [isError, setIsError] = useState(false);
        const mutate = (newData: any) => {
          setIsLoading(true);
          setIsError(false);
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              if (Math.random() > 0.2) { // Simulate occasional error
                console.log('Creating data:', newData);
                setIsLoading(false);
                resolve({ id: String(Math.random()), ...newData });
              } else {
                setIsError(true);
                setIsLoading(false);
                reject(new Error('Failed to create'));
              }
            }, 500);
          });
        };
        return { mutate, isLoading, isError };
      },
    },
    update: {
      useMutation: () => {
        const [isLoading, setIsLoading] = useState(false);
        const [isError, setIsError] = useState(false);
        const mutate = (updatedData: any) => {
          setIsLoading(true);
          setIsError(false);
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              if (Math.random() > 0.2) { // Simulate occasional error
                console.log('Updating data:', updatedData);
                setIsLoading(false);
                resolve(updatedData);
              } else {
                setIsError(true);
                setIsLoading(false);
                reject(new Error('Failed to update'));
              }
            }, 500);
          });
        };
        return { mutate, isLoading, isError };
      },
    },
    delete: {
      useMutation: () => {
        const [isLoading, setIsLoading] = useState(false);
        const [isError, setIsError] = useState(false);
        const mutate = (id: string) => {
          setIsLoading(true);
          setIsError(false);
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              if (Math.random() > 0.2) { // Simulate occasional error
                console.log('Deleting data with id:', id);
                setIsLoading(false);
                resolve({ id });
              } else {
                setIsError(true);
                setIsLoading(false);
                reject(new Error('Failed to delete'));
              }
            }, 500);
          });
        };
        return { mutate, isLoading, isError };
      },
    },
  },
};

interface DataExportItem {
  id: string;
  name: string;
  type: string;
  status: 'completed' | 'pending' | 'failed' | 'processing';
  date: string;
  amount: number;
  currency: 'NGN' | 'USD';
}

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

const DataExportScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<DataExportItem | null>(null);

  const { data, isLoading, isError, refetch } = trpc.dataExport.list.useQuery({
    search: searchText,
  });
  const createMutation = trpc.dataExport.create.useMutation();
  const updateMutation = trpc.dataExport.update.useMutation();
  const deleteMutation = trpc.dataExport.delete.useMutation();

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleCreate = async (newItem: Omit<DataExportItem, 'id'>) => {
    try {
      await createMutation.mutate(newItem);
      setCreateModalVisible(false);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create data export.');
    }
  };

  const handleEdit = async (updatedItem: DataExportItem) => {
    try {
      await updateMutation.mutate(updatedItem);
      setEditModalVisible(false);
      setCurrentItem(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update data export.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Export',
      'Are you sure you want to delete this data export?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutate(id);
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete data export.');
            }
          },
        },
      ]
    );
  };

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    if (currency === 'NGN') {
      return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (currency === 'USD') {
      return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return amount.toString();
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const getStatusBadgeStyle = (status: DataExportItem['status']) => {
    switch (status) {
      case 'completed':
        return styles.statusCompleted;
      case 'pending':
        return styles.statusPending;
      case 'failed':
        return styles.statusFailed;
      case 'processing':
        return styles.statusProcessing;
      default:
        return styles.statusPending;
    }
  };

  const renderItem = ({ item }: { item: DataExportItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Type: {item.type}</Text>
      <Text style={styles.cardText}>Date: {formatDate(item.date)}</Text>
      {item.amount > 0 && (
        <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      )}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => {
            setCurrentItem(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error }]} 
          onPress={() => handleDelete(item.id)}
        >
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
        <Text style={styles.loadingText}>Loading data exports...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load data exports.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Data Exports</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ Create New</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search exports..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {data.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No data exports found.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Export</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Export Name"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentItem({ ...currentItem!, name: text })}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Export Type (e.g., CSV, JSON)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentItem({ ...currentItem!, type: text })}
            />
            {/* Add more fields as necessary for creation */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.error }]}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={() => {
                  if (currentItem?.name && currentItem?.type) {
                    handleCreate({
                      name: currentItem.name,
                      type: currentItem.type,
                      status: 'pending',
                      date: new Date().toISOString(),
                      amount: 0,
                      currency: 'USD',
                    });
                  } else {
                    Alert.alert('Error', 'Please fill all required fields.');
                  }
                }}
              >
                <Text style={styles.actionButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Export</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Export Name"
              placeholderTextColor={COLORS.muted}
              value={currentItem?.name || ''}
              onChangeText={(text) => setCurrentItem({ ...currentItem!, name: text })}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Export Type (e.g., CSV, JSON)"
              placeholderTextColor={COLORS.muted}
              value={currentItem?.type || ''}
              onChangeText={(text) => setCurrentItem({ ...currentItem!, type: text })}
            />
            {/* Add more fields as necessary for editing */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.error }]}
                onPress={() => {
                  setEditModalVisible(false);
                  setCurrentItem(null);
                }}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={() => {
                  if (currentItem) {
                    handleEdit(currentItem);
                  } else {
                    Alert.alert('Error', 'No item selected for editing.');
                  }
                }}
              >
                <Text style={styles.actionButtonText}>Save</Text>
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
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
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
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    margin: 15,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 15,
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
    flexShrink: 1,
    marginRight: 10,
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusCompleted: {
    backgroundColor: COLORS.success,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusFailed: {
    backgroundColor: COLORS.error,
  },
  statusProcessing: {
    backgroundColor: COLORS.primary,
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
    fontSize: 14,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.card,
    borderRadius: 10,
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
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalInput: {
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
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    marginHorizontal: 5,
    alignItems: 'center',
  },
});

export default DataExportScreen;
