import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Simulated import

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper functions for formatting
const formatAmount = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  const symbol = currency === 'NGN' ? '₦' : '$';
  return `${symbol}${amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
};

const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

// Dummy Data for Analytics
interface AnalyticData {
  id: string;
  metric: string;
  value: number;
  unit: string;
  status: 'good' | 'average' | 'poor';
  date: string;
}

const initialAnalyticsData: AnalyticData[] = [
  { id: '1', metric: 'Total Revenue', value: 125000.50, unit: 'USD', status: 'good', date: '2026-05-01' },
  { id: '2', metric: 'Transactions Count', value: 5432, unit: '', status: 'good', date: '2026-05-02' },
  { id: '3', metric: 'Average Transaction Value', value: 23.00, unit: 'USD', status: 'average', date: '2026-05-03' },
  { id: '4', metric: 'Refund Rate', value: 1.2, unit: '%', status: 'poor', date: '2026-05-04' },
  { id: '5', metric: 'Customer Acquisition Cost', value: 15.75, unit: 'USD', status: 'average', date: '2026-05-05' },
  { id: '6', metric: 'Conversion Rate', value: 3.5, unit: '%', status: 'good', date: '2026-05-06' },
];

// Simulate tRPC hooks
const useMerchantAnalyticsQuery = (filter: string) => {
  const [data, setData] = useState<AnalyticData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  React.useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    const filteredData = initialAnalyticsData.filter(item =>
      item.metric.toLowerCase().includes(filter.toLowerCase()) ||
      item.unit.toLowerCase().includes(filter.toLowerCase())
    );
    setTimeout(() => {
      setData(filteredData);
      setIsLoading(false);
    }, 1000);
  }, [filter]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    setIsError(false);
    setTimeout(() => {
      setData(initialAnalyticsData.filter(item =>
        item.metric.toLowerCase().includes(filter.toLowerCase()) ||
        item.unit.toLowerCase().includes(filter.toLowerCase())
      ));
      setIsLoading(false);
    }, 500);
  }, [filter]);

  return { data, isLoading, isError, refetch };
};

const useCreateAnalyticMutation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const mutate = useCallback(async (newAnalytic: Omit<AnalyticData, 'id'>) => {
    setIsLoading(true);
    return new Promise<AnalyticData>((resolve) => {
      setTimeout(() => {
        const createdAnalytic = { ...newAnalytic, id: String(initialAnalyticsData.length + 1) };
        initialAnalyticsData.push(createdAnalytic); // Simulate adding to data source
        setIsLoading(false);
        resolve(createdAnalytic);
      }, 500);
    });
  }, []);
  return { mutate, isLoading };
};

const useUpdateAnalyticMutation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const mutate = useCallback(async (updatedAnalytic: AnalyticData) => {
    setIsLoading(true);
    return new Promise<AnalyticData>((resolve, reject) => {
      setTimeout(() => {
        const index = initialAnalyticsData.findIndex(item => item.id === updatedAnalytic.id);
        if (index !== -1) {
          initialAnalyticsData[index] = updatedAnalytic; // Simulate updating data source
          setIsLoading(false);
          resolve(updatedAnalytic);
        } else {
          setIsLoading(false);
          reject(new Error('Analytic not found'));
        }
      }, 500);
    });
  }, []);
  return { mutate, isLoading };
};

const useDeleteAnalyticMutation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const mutate = useCallback(async (id: string) => {
    setIsLoading(true);
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        const initialLength = initialAnalyticsData.length;
        const newLength = initialAnalyticsData.filter(item => item.id !== id).length;
        if (newLength < initialLength) {
          // Simulate removing from data source
          const index = initialAnalyticsData.findIndex(item => item.id === id);
          if (index > -1) {
            initialAnalyticsData.splice(index, 1);
          }
          setIsLoading(false);
          resolve();
        } else {
          setIsLoading(false);
          reject(new Error('Analytic not found'));
        }
      }, 500);
    });
  }, []);
  return { mutate, isLoading };
};

// Main Component
const MerchantAnalyticsDashboardScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentAnalytic, setCurrentAnalytic] = useState<AnalyticData | null>(null);

  // Simulate tRPC queries and mutations
  const { data: analytics, isLoading, isError, refetch } = useMerchantAnalyticsQuery(searchQuery);
  const { mutate: createAnalytic, isLoading: isCreating } = useCreateAnalyticMutation();
  const { mutate: updateAnalytic, isLoading: isUpdating } = useUpdateAnalyticMutation();
  const { mutate: deleteAnalytic, isLoading: isDeleting } = useDeleteAnalyticMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Analytic',
      'Are you sure you want to delete this analytic?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAnalytic(id);
              refetch(); // Refetch data after deletion
            } catch (error) {
              console.error('Failed to delete analytic:', error);
              Alert.alert('Error', 'Failed to delete analytic.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleCreate = async (newAnalytic: Omit<AnalyticData, 'id'>) => {
    try {
      await createAnalytic(newAnalytic);
      refetch();
      setCreateModalVisible(false);
    } catch (error) {
      console.error('Failed to create analytic:', error);
      Alert.alert('Error', 'Failed to create analytic.');
    }
  };

  const handleUpdate = async (updatedAnalytic: AnalyticData) => {
    try {
      await updateAnalytic(updatedAnalytic);
      refetch();
      setEditModalVisible(false);
      setCurrentAnalytic(null);
    } catch (error) {
      console.error('Failed to update analytic:', error);
      Alert.alert('Error', 'Failed to update analytic.');
    }
  };

  const renderAnalyticItem = ({ item }: { item: AnalyticData }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.metricText}>{item.metric}</Text>
        <View style={[styles.statusBadge, {
          backgroundColor: item.status === 'good' ? COLORS.success :
            item.status === 'average' ? COLORS.warning : COLORS.error
        }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.valueText}>
        {item.unit === '%' ? `${item.value}%` : formatAmount(item.value, item.unit === 'USD' ? 'USD' : 'NGN')}
      </Text>
      <Text style={styles.dateText}>Date: {formatDate(item.date)}</Text>
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.button, styles.editButton]}
          onPress={() => {
            setCurrentAnalytic(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.deleteButton]}
          onPress={() => handleDelete(item.id)}
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
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load analytics. Please try again.</Text>
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
        <Text style={styles.title}>Merchant Analytics Dashboard</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.buttonText}>Add Analytic</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search metrics or units..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {analytics.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No analytics data found.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.buttonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={analytics}
          keyExtractor={(item) => item.id}
          renderItem={renderAnalyticItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Analytic Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Analytic</Text>
            <AnalyticForm
              onSubmit={handleCreate}
              onCancel={() => setCreateModalVisible(false)}
              isLoading={isCreating}
            />
          </View>
        </View>
      </Modal>

      {/* Edit Analytic Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Analytic</Text>
            {currentAnalytic && (
              <AnalyticForm
                initialData={currentAnalytic}
                onSubmit={handleUpdate}
                onCancel={() => {
                  setEditModalVisible(false);
                  setCurrentAnalytic(null);
                }}
                isLoading={isUpdating}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

interface AnalyticFormProps {
  initialData?: AnalyticData;
  onSubmit: (data: AnalyticData | Omit<AnalyticData, 'id'>) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const AnalyticForm: React.FC<AnalyticFormProps> = ({ initialData, onSubmit, onCancel, isLoading }) => {
  const [metric, setMetric] = useState(initialData?.metric || '');
  const [value, setValue] = useState(String(initialData?.value || ''));
  const [unit, setUnit] = useState(initialData?.unit || '');
  const [status, setStatus] = useState<'good' | 'average' | 'poor'>(initialData?.status || 'good');
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);

  const handleSubmit = () => {
    if (!metric || !value || !unit || !date) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue)) {
      Alert.alert('Error', 'Value must be a number.');
      return;
    }

    const dataToSubmit = {
      metric,
      value: parsedValue,
      unit,
      status,
      date,
    };

    if (initialData) {
      onSubmit({ ...initialData, ...dataToSubmit });
    } else {
      onSubmit(dataToSubmit);
    }
  };

  return (
    <View style={formStyles.container}>
      <TextInput
        style={formStyles.input}
        placeholder="Metric Name"
        placeholderTextColor={COLORS.muted}
        value={metric}
        onChangeText={setMetric}
      />
      <TextInput
        style={formStyles.input}
        placeholder="Value"
        placeholderTextColor={COLORS.muted}
        keyboardType="numeric"
        value={value}
        onChangeText={setValue}
      />
      <TextInput
        style={formStyles.input}
        placeholder="Unit (e.g., USD, %, NGN)"
        placeholderTextColor={COLORS.muted}
        value={unit}
        onChangeText={setUnit}
      />
      <TextInput
        style={formStyles.input}
        placeholder="Date (YYYY-MM-DD)"
        placeholderTextColor={COLORS.muted}
        value={date}
        onChangeText={setDate}
      />
      <View style={formStyles.statusPicker}>
        <Text style={formStyles.statusLabel}>Status:</Text>
        <TouchableOpacity
          style={[formStyles.statusOption, status === 'good' && formStyles.statusOptionSelected]}
          onPress={() => setStatus('good')}
        >
          <Text style={formStyles.statusOptionText}>Good</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[formStyles.statusOption, status === 'average' && formStyles.statusOptionSelected]}
          onPress={() => setStatus('average')}
        >
          <Text style={formStyles.statusOptionText}>Average</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[formStyles.statusOption, status === 'poor' && formStyles.statusOptionSelected]}
          onPress={() => setStatus('poor')}
        >
          <Text style={formStyles.statusOptionText}>Poor</Text>
        </TouchableOpacity>
      </View>

      <View style={formStyles.buttonGroup}>
        <TouchableOpacity
          style={[formStyles.button, formStyles.cancelButton]}
          onPress={onCancel}
          disabled={isLoading}
        >
          <Text style={formStyles.buttonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[formStyles.button, formStyles.submitButton]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <Text style={formStyles.buttonText}>Save</Text>
          )}
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
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statusLabel: {
    color: COLORS.text,
    fontSize: 16,
    marginRight: 10,
  },
  statusOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.muted,
    marginRight: 10,
  },
  statusOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusOptionText: {
    color: COLORS.text,
    fontSize: 14,
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 10,
    padding: 15,
    margin: 20,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  valueText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 5,
  },
  dateText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 15,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  editButton: {
    backgroundColor: COLORS.primary,
    marginRight: 10,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
});

export default MerchantAnalyticsDashboardScreen;
