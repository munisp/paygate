import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, SafeAreaView, StatusBar, TextInput, TouchableOpacity, Alert, Modal, Button, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
// import { trpc } from '../lib/trpc'; // Assuming trpc client is available

// Mock tRPC client for demonstration purposes
const trpc = {
  emiManagement: {
    list: {
      useQuery: (filter: string) => {
        const [data, setData] = useState<EMIItem[]>([]);
        const [isLoading, setIsLoading] = useState(true);
        const [isError, setIsError] = useState(false);

        const fetchData = useCallback(() => {
          setIsLoading(true);
          setIsError(false);
          setTimeout(() => {
            try {
              const mockData: EMIItem[] = [
                { id: '1', customerName: 'Alice Smith', amount: 150000, currency: '₦', dueDate: '2026-06-01', status: 'Pending', description: 'Loan repayment' },
                { id: '2', customerName: 'Bob Johnson', amount: 2500, currency: '$', dueDate: '2026-05-25', status: 'Paid', description: 'Credit card bill' },
                { id: '3', customerName: 'Charlie Brown', amount: 75000, currency: '₦', dueDate: '2026-07-10', status: 'Overdue', description: 'Mortgage payment' },
                { id: '4', customerName: 'Diana Prince', amount: 1200, currency: '$', dueDate: '2026-06-15', status: 'Pending', description: 'Car lease' },
                { id: '5', customerName: 'Eve Adams', amount: 300000, currency: '₦', dueDate: '2026-08-01', status: 'Paid', description: 'Business loan' },
              ];
              const filteredData = mockData.filter(item =>
                item.customerName.toLowerCase().includes(filter.toLowerCase()) ||
                item.description.toLowerCase().includes(filter.toLowerCase())
              );
              setData(filteredData);
              setIsLoading(false);
            } catch (e) {
              setIsError(true);
              setIsLoading(false);
            }
          }, 1000);
        }, [filter]);

        React.useEffect(() => {
          fetchData();
        }, [fetchData]);

        return { data, isLoading, isError, refetch: fetchData };
      },
    },
    create: {
      useMutation: () => {
        const [isLoading, setIsLoading] = useState(false);
        const mutate = (newItem: Omit<EMIItem, 'id' | 'status'>) => {
          setIsLoading(true);
          return new Promise<EMIItem>((resolve) => {
            setTimeout(() => {
              const createdItem: EMIItem = { ...newItem, id: String(Date.now()), status: 'Pending' };
              console.log('Created:', createdItem);
              setIsLoading(false);
              resolve(createdItem);
            }, 500);
          });
        };
        return { mutate, isLoading };
      },
    },
    update: {
      useMutation: () => {
        const [isLoading, setIsLoading] = useState(false);
        const mutate = (updatedItem: EMIItem) => {
          setIsLoading(true);
          return new Promise<EMIItem>((resolve) => {
            setTimeout(() => {
              console.log('Updated:', updatedItem);
              setIsLoading(false);
              resolve(updatedItem);
            }, 500);
          });
        };
        return { mutate, isLoading };
      },
    },
    delete: {
      useMutation: () => {
        const [isLoading, setIsLoading] = useState(false);
        const mutate = (id: string) => {
          setIsLoading(true);
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              console.log('Deleted ID:', id);
              setIsLoading(false);
              resolve();
            }, 500);
          });
        };
        return { mutate, isLoading };
      },
    },
  },
};

interface EMIItem {
  id: string;
  customerName: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'Pending' | 'Paid' | 'Overdue';
  description?: string;
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

const EMIManagementScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentEMI, setCurrentEMI] = useState<EMIItem | null>(null);

  const { data: emiItems, isLoading, isError, refetch } = trpc.emiManagement.list.useQuery(searchQuery);
  const { mutate: createEMI, isLoading: isCreating } = trpc.emiManagement.create.useMutation();
  const { mutate: updateEMI, isLoading: isUpdating } = trpc.emiManagement.update.useMutation();
  const { mutate: deleteEMI, isLoading: isDeleting } = trpc.emiManagement.delete.useMutation();

  const handleCreate = async (newItem: Omit<EMIItem, 'id' | 'status'>) => {
    await createEMI(newItem);
    refetch();
    setCreateModalVisible(false);
  };

  const handleEdit = async (updatedItem: EMIItem) => {
    await updateEMI(updatedItem);
    refetch();
    setEditModalVisible(false);
    setCurrentEMI(null);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete EMI',
      'Are you sure you want to delete this EMI record?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            await deleteEMI(id);
            refetch();
          }
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (item: EMIItem) => {
    setCurrentEMI(item);
    setEditModalVisible(true);
  };

  const renderStatusBadge = (status: EMIItem['status']) => {
    let backgroundColor;
    switch (status) {
      case 'Paid':
        backgroundColor = COLORS.success;
        break;
      case 'Pending':
        backgroundColor = COLORS.warning;
        break;
      case 'Overdue':
        backgroundColor = COLORS.error;
        break;
      default:
        backgroundColor = COLORS.muted;
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor }]}>
        <Text style={styles.statusBadgeText}>{status}</Text>
      </View>
    );
  };

  const formatAmount = (amount: number, currency: string) => {
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  const renderItem = ({ item }: { item: EMIItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.customerName}</Text>
        {renderStatusBadge(item.status)}
      </View>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Due Date: {formatDate(item.dueDate)}</Text>
      {item.description && <Text style={styles.cardText}>Description: {item.description}</Text>}
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => openEditModal(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading EMI records...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load EMI records. Please try again.</Text>
        <Button title="Retry" onPress={refetch} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>EMI Management</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Add EMI</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by customer name or description..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {emiItems && emiItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No EMI records found.</Text>
          <Button title="Refresh" onPress={refetch} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={emiItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New EMI</Text>
            <EMIForm
              onSubmit={handleCreate}
              onCancel={() => setCreateModalVisible(false)}
              isLoading={isCreating}
            />
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
            <Text style={styles.modalTitle}>Edit EMI</Text>
            {currentEMI && (
              <EMIForm
                initialValues={currentEMI}
                onSubmit={handleEdit}
                onCancel={() => setEditModalVisible(false)}
                isLoading={isUpdating}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

interface EMIFormProps {
  initialValues?: EMIItem;
  onSubmit: (item: Omit<EMIItem, 'id' | 'status'> | EMIItem) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const EMIForm: React.FC<EMIFormProps> = ({ initialValues, onSubmit, onCancel, isLoading }) => {
  const [customerName, setCustomerName] = useState(initialValues?.customerName || '');
  const [amount, setAmount] = useState(String(initialValues?.amount || ''));
  const [currency, setCurrency] = useState(initialValues?.currency || '₦');
  const [dueDate, setDueDate] = useState(initialValues?.dueDate || '');
  const [description, setDescription] = useState(initialValues?.description || '');

  const handleSubmit = () => {
    if (!customerName || !amount || !dueDate) {
      Alert.alert('Error', 'Please fill all required fields.');
      return;
    }
    const itemToSubmit = {
      ...(initialValues && { id: initialValues.id, status: initialValues.status }),
      customerName,
      amount: parseFloat(amount),
      currency,
      dueDate,
      description,
    };
    onSubmit(itemToSubmit as EMIItem);
  };

  return (
    <View style={formStyles.container}>
      <TextInput
        style={formStyles.input}
        placeholder="Customer Name"
        placeholderTextColor={COLORS.muted}
        value={customerName}
        onChangeText={setCustomerName}
      />
      <TextInput
        style={formStyles.input}
        placeholder="Amount"
        placeholderTextColor={COLORS.muted}
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />
      <TextInput
        style={formStyles.input}
        placeholder="Currency (e.g., ₦ or $)"
        placeholderTextColor={COLORS.muted}
        value={currency}
        onChangeText={setCurrency}
      />
      <TextInput
        style={formStyles.input}
        placeholder="Due Date (YYYY-MM-DD)"
        placeholderTextColor={COLORS.muted}
        value={dueDate}
        onChangeText={setDueDate}
      />
      <TextInput
        style={formStyles.input}
        placeholder="Description (Optional)"
        placeholderTextColor={COLORS.muted}
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <View style={formStyles.buttonContainer}>
        <TouchableOpacity style={[formStyles.button, { backgroundColor: COLORS.muted }]} onPress={onCancel} disabled={isLoading}>
          <Text style={formStyles.buttonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[formStyles.button, { backgroundColor: COLORS.primary }]} onPress={handleSubmit} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color={COLORS.text} /> : <Text style={formStyles.buttonText}>{initialValues ? 'Update' : 'Create'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const formStyles = StyleSheet.create({
  container: {
    width: '100%',
    padding: 10,
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

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
    color: COLORS.muted,
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
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
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
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    margin: 16,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: COLORS.text,
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
    paddingHorizontal: 12,
    borderRadius: 8,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    width: '90%',
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});

export default EMIManagementScreen;
