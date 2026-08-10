import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path

// Design system colors
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

// Mock Compliance Setting type (replace with actual tRPC type if available)
interface ComplianceSetting {
  id: string;
  name: string;
  description: string;
  value: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

// Mock tRPC procedures for demonstration
// In a real application, these would be defined in your tRPC router
const mockTrpc = {
  compliance: {
    getSettings: {
      useQuery: (params?: { search?: string }) => {
        const [data, setData] = useState<ComplianceSetting[] | undefined>(undefined);
        const [isLoading, setIsLoading] = useState(true);
        const [isError, setIsError] = useState(false);

        useEffect(() => {
          setIsLoading(true);
          setIsError(false);
          const timer = setTimeout(() => {
            const allSettings: ComplianceSetting[] = [
              { id: '1', name: 'KYC Level 1', description: 'Basic identity verification', value: 'Enabled', status: 'active', createdAt: '2023-01-15T10:00:00Z', updatedAt: '2023-01-15T10:00:00Z' },
              { id: '2', name: 'AML Check', description: 'Anti-money laundering screening', value: 'Enabled', status: 'active', createdAt: '2023-02-20T11:30:00Z', updatedAt: '2023-02-20T11:30:00Z' },
              { id: '3', name: 'PCI DSS', description: 'Payment Card Industry Data Security Standard', value: 'Disabled', status: 'inactive', createdAt: '2023-03-10T09:00:00Z', updatedAt: '2023-03-10T09:00:00Z' },
              { id: '4', name: 'Data Privacy', description: 'GDPR and CCPA compliance', value: 'Pending Review', status: 'pending', createdAt: '2023-04-05T14:00:00Z', updatedAt: '2023-04-05T14:00:00Z' },
              { id: '5', name: 'Fraud Detection', description: 'Real-time transaction monitoring', value: 'Enabled', status: 'active', createdAt: '2023-05-01T16:00:00Z', updatedAt: '2023-05-01T16:00:00Z' },
            ];
            const filtered = params?.search
              ? allSettings.filter(s =>
                  s.name.toLowerCase().includes(params.search!.toLowerCase()) ||
                  s.description.toLowerCase().includes(params.search!.toLowerCase())
                )
              : allSettings;
            setData(filtered);
            setIsLoading(false);
          }, 1000);
          return () => clearTimeout(timer);
        }, [params?.search]);

        return { data, isLoading, isError, refetch: () => {} }; // refetch is a no-op for mock
      },
    },
    createSetting: {
      useMutation: () => {
        const [isLoading, setIsLoading] = useState(false);
        const [isError, setIsError] = useState(false);
        const mutate = useCallback(async (newSetting: Omit<ComplianceSetting, 'id' | 'createdAt' | 'updatedAt'>) => {
          setIsLoading(true);
          setIsError(false);
          return new Promise<ComplianceSetting>((resolve) => {
            setTimeout(() => {
              const createdSetting = { ...newSetting, id: String(Date.now()), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
              console.log('Mock createSetting:', createdSetting);
              setIsLoading(false);
              resolve(createdSetting);
            }, 500);
          });
        }, []);
        return { mutate, isLoading, isError };
      },
    },
    updateSetting: {
      useMutation: () => {
        const [isLoading, setIsLoading] = useState(false);
        const [isError, setIsError] = useState(false);
        const mutate = useCallback(async (updatedSetting: ComplianceSetting) => {
          setIsLoading(true);
          setIsError(false);
          return new Promise<ComplianceSetting>((resolve) => {
            setTimeout(() => {
              const finalSetting = { ...updatedSetting, updatedAt: new Date().toISOString() };
              console.log('Mock updateSetting:', finalSetting);
              setIsLoading(false);
              resolve(finalSetting);
            }, 500);
          });
        }, []);
        return { mutate, isLoading, isError };
      },
    },
    deleteSetting: {
      useMutation: () => {
        const [isLoading, setIsLoading] = useState(false);
        const [isError, setIsError] = useState(false);
        const mutate = useCallback(async (id: string) => {
          setIsLoading(true);
          setIsError(false);
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              console.log('Mock deleteSetting:', id);
              setIsLoading(false);
              resolve();
            }, 500);
          });
        }, []);
        return { mutate, isLoading, isError };
      },
    },
  },
};

// Helper for formatting dates
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

// Helper for status badge styling
const getStatusBadgeStyle = (status: ComplianceSetting['status']) => {
  switch (status) {
    case 'active':
      return { backgroundColor: COLORS.success };
    case 'inactive':
      return { backgroundColor: COLORS.error };
    case 'pending':
      return { backgroundColor: COLORS.warning };
    default:
      return { backgroundColor: COLORS.muted };
  }
};

const ComplianceSettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: settings, isLoading, isError, refetch } = trpc.compliance.getSettings.useQuery({ search: searchText });

  const { mutate: createSetting, isLoading: isCreating } = trpc.compliance.createSetting.useMutation();
  const { mutate: updateSetting, isLoading: isUpdating } = trpc.compliance.updateSetting.useMutation();
  const { mutate: deleteSetting, isLoading: isDeleting } = trpc.compliance.deleteSetting.useMutation();

  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [currentEditSetting, setCurrentEditSetting] = useState<ComplianceSetting | null>(null);

  const [newSettingName, setNewSettingName] = useState('');
  const [newSettingDescription, setNewSettingDescription] = useState('');
  const [newSettingValue, setNewSettingValue] = useState('');
  const [newSettingStatus, setNewSettingStatus] = useState<'active' | 'inactive' | 'pending'>('pending');

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleCreate = async () => {
    if (!newSettingName || !newSettingDescription || !newSettingValue) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    try {
      await createSetting({
        name: newSettingName,
        description: newSettingDescription,
        value: newSettingValue,
        status: newSettingStatus,
      });
      setIsCreateModalVisible(false);
      setNewSettingName('');
      setNewSettingDescription('');
      setNewSettingValue('');
      setNewSettingStatus('pending');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create setting.');
    }
  };

  const handleEdit = async () => {
    if (!currentEditSetting || !currentEditSetting.name || !currentEditSetting.description || !currentEditSetting.value) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    try {
      await updateSetting(currentEditSetting);
      setIsEditModalVisible(false);
      setCurrentEditSetting(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update setting.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this compliance setting?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSetting(id);
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete setting.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderItem = ({ item }: { item: ComplianceSetting }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardDescription}>{item.description}</Text>
      <Text style={styles.cardText}>Value: {item.value}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <Text style={styles.cardText}>Last Updated: {formatDate(item.updatedAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]}
          onPress={() => {
            setCurrentEditSetting(item);
            setIsEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error, marginLeft: 10 }]}
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
        <Text style={styles.loadingText}>Loading Compliance Settings...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load compliance settings.</Text>
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
        <Text style={styles.headerTitle}>Compliance Settings</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setIsCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ Add Setting</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search settings..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {settings && settings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No compliance settings found.</Text>
          <TouchableOpacity style={styles.createButton} onPress={() => setIsCreateModalVisible(true)}>
            <Text style={styles.createButtonText}>Create New Setting</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={settings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Setting</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={COLORS.muted}
              value={newSettingName}
              onChangeText={setNewSettingName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={newSettingDescription}
              onChangeText={setNewSettingDescription}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Value"
              placeholderTextColor={COLORS.muted}
              value={newSettingValue}
              onChangeText={setNewSettingValue}
            />
            <View style={styles.modalButtonGroup}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.error }]}
                onPress={() => setIsCreateModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary, marginLeft: 10 }]}
                onPress={handleCreate}
                disabled={isCreating}
              >
                <Text style={styles.modalButtonText}>{isCreating ? 'Creating...' : 'Create'}</Text>
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
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Setting</Text>
            {currentEditSetting && (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Name"
                  placeholderTextColor={COLORS.muted}
                  value={currentEditSetting.name}
                  onChangeText={(text) => setCurrentEditSetting({ ...currentEditSetting, name: text })}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Description"
                  placeholderTextColor={COLORS.muted}
                  value={currentEditSetting.description}
                  onChangeText={(text) => setCurrentEditSetting({ ...currentEditSetting, description: text })}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Value"
                  placeholderTextColor={COLORS.muted}
                  value={currentEditSetting.value}
                  onChangeText={(text) => setCurrentEditSetting({ ...currentEditSetting, value: text })}
                />
                <View style={styles.modalButtonGroup}>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: COLORS.error }]}
                    onPress={() => setIsEditModalVisible(false)}
                  >
                    <Text style={styles.modalButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: COLORS.primary, marginLeft: 10 }]}
                    onPress={handleEdit}
                    disabled={isUpdating}
                  >
                    <Text style={styles.modalButtonText}>{isUpdating ? 'Updating...' : 'Save Changes'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
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
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 16,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
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
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 15,
    margin: 16,
    marginBottom: 10,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
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
  cardDescription: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  cardText: {
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 3,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalInput: {
    height: 50,
    width: '100%',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 15,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    fontSize: 16,
  },
  modalButtonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    elevation: 2,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default ComplianceSettingsScreen;
