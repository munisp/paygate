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
  Alert,
  Modal,
  Button,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path

// --- Design System Colors ---
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

// --- Helper Functions ---
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  if (currency === 'NGN') {
    return `₦${amount.toFixed(2)}`;
  }
  return `$${amount.toFixed(2)}`;
};

const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

// --- Type Definitions (Mock for demonstration) ---
interface AIModel {
  id: string;
  name: string;
  version: string;
  status: 'active' | 'inactive' | 'pending' | 'error';
  costPerUse: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
  updatedAt: string;
}

interface CreateAIModelInput {
  name: string;
  version: string;
  costPerUse: number;
  currency: 'NGN' | 'USD';
}

interface UpdateAIModelInput {
  id: string;
  name?: string;
  version?: string;
  status?: 'active' | 'inactive' | 'pending' | 'error';
  costPerUse?: number;
  currency?: 'NGN' | 'USD';
}

const AIModelAdminScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);

  // tRPC queries and mutations
  const { data, isLoading, isError, refetch, isRefetching } = trpc.aiAdmin.list.useQuery();
  const createMutation = trpc.aiAdmin.create.useMutation();
  const updateMutation = trpc.aiAdmin.update.useMutation();
  const deleteMutation = trpc.aiAdmin.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredModels = data?.filter(model =>
    model.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = async (input: CreateAIModelInput) => {
    try {
      await createMutation.mutateAsync(input);
      setCreateModalVisible(false);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create model.');
      console.error('Create error:', error);
    }
  };

  const handleEdit = async (input: UpdateAIModelInput) => {
    if (!editingModel) return;
    try {
      await updateMutation.mutateAsync(input);
      setEditModalVisible(false);
      setEditingModel(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update model.');
      console.error('Update error:', error);
    }
  };

  const handleDelete = (modelId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this AI model?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id: modelId });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete model.');
              console.error('Delete error:', error);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const getStatusBadgeStyle = (status: AIModel['status']) => {
    switch (status) {
      case 'active':
        return { backgroundColor: COLORS.success };
      case 'inactive':
        return { backgroundColor: COLORS.muted };
      case 'pending':
        return { backgroundColor: COLORS.warning };
      case 'error':
        return { backgroundColor: COLORS.error };
      default:
        return { backgroundColor: COLORS.muted };
    }
  };

  const renderItem = ({ item }: { item: AIModel }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.modelName}>{item.name}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Version: {item.version}</Text>
      <Text style={styles.cardText}>Cost per use: {formatCurrency(item.costPerUse, item.currency)}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} // Primary for edit
          onPress={() => {
            setEditingModel(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error }]} // Error for delete
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
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading AI Models...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load AI models.</Text>
        <Button title="Retry" onPress={refetch} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Model Administration</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ Create Model</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search models..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredModels && filteredModels.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No AI models found.</Text>
          <Button title="Refresh" onPress={refetch} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredModels}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
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
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New AI Model</Text>
            <CreateEditForm
              onSubmit={handleCreate}
              onCancel={() => setCreateModalVisible(false)}
              isSubmitting={createMutation.isLoading}
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
            <Text style={styles.modalTitle}>Edit AI Model</Text>
            {editingModel && (
              <CreateEditForm
                initialData={editingModel}
                onSubmit={handleEdit}
                onCancel={() => {
                  setEditModalVisible(false);
                  setEditingModel(null);
                }}
                isSubmitting={updateMutation.isLoading}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// --- Create/Edit Form Component ---
interface CreateEditFormProps {
  initialData?: AIModel;
  onSubmit: (data: CreateAIModelInput | UpdateAIModelInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const CreateEditForm: React.FC<CreateEditFormProps> = ({ initialData, onSubmit, onCancel, isSubmitting }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [version, setVersion] = useState(initialData?.version || '');
  const [costPerUse, setCostPerUse] = useState(String(initialData?.costPerUse || ''));
  const [currency, setCurrency] = useState<"NGN" | "USD">(initialData?.currency || 'NGN');
  const [status, setStatus] = useState<AIModel['status']>(initialData?.status || 'active');

  const handleSubmit = () => {
    const parsedCost = parseFloat(costPerUse);
    if (!name || !version || isNaN(parsedCost)) {
      Alert.alert('Validation Error', 'Please fill all required fields correctly.');
      return;
    }

    if (initialData) {
      // Update
      onSubmit({
        id: initialData.id,
        name,
        version,
        costPerUse: parsedCost,
        currency,
        status,
      });
    } else {
      // Create
      onSubmit({
        name,
        version,
        costPerUse: parsedCost,
        currency,
      });
    }
  };

  return (
    <View style={formStyles.container}>
      <Text style={formStyles.label}>Name:</Text>
      <TextInput
        style={formStyles.input}
        value={name}
        onChangeText={setName}
        placeholderTextColor={COLORS.muted}
        placeholder="Model Name"
      />

      <Text style={formStyles.label}>Version:</Text>
      <TextInput
        style={formStyles.input}
        value={version}
        onChangeText={setVersion}
        placeholderTextColor={COLORS.muted}
        placeholder="e.g., 1.0.0"
      />

      <Text style={formStyles.label}>Cost Per Use:</Text>
      <TextInput
        style={formStyles.input}
        value={costPerUse}
        onChangeText={setCostPerUse}
        keyboardType="numeric"
        placeholderTextColor={COLORS.muted}
        placeholder="e.g., 0.05"
      />

      <Text style={formStyles.label}>Currency:</Text>
      <View style={formStyles.pickerContainer}>
        <TouchableOpacity
          style={[formStyles.pickerOption, currency === 'NGN' && formStyles.pickerOptionSelected]}
          onPress={() => setCurrency('NGN')}
        >
          <Text style={formStyles.pickerOptionText}>NGN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[formStyles.pickerOption, currency === 'USD' && formStyles.pickerOptionSelected]}
          onPress={() => setCurrency('USD')}
        >
          <Text style={formStyles.pickerOptionText}>USD</Text>
        </TouchableOpacity>
      </View>

      {initialData && (
        <>
          <Text style={formStyles.label}>Status:</Text>
          <View style={formStyles.pickerContainer}>
            {['active', 'inactive', 'pending', 'error'].map((s) => (
              <TouchableOpacity
                key={s}
                style={[formStyles.pickerOption, status === s && formStyles.pickerOptionSelected]}
                onPress={() => setStatus(s as AIModel['status'])}
              >
                <Text style={formStyles.pickerOptionText}>{s.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <View style={formStyles.buttonContainer}>
        <TouchableOpacity
          style={[formStyles.formButton, { backgroundColor: COLORS.muted }]}
          onPress={onCancel}
          disabled={isSubmitting}
        >
          <Text style={formStyles.formButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[formStyles.formButton, { backgroundColor: COLORS.primary }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <Text style={formStyles.formButtonText}>{initialData ? 'Update' : 'Create'}</Text>
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
  label: {
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginTop: 5,
    marginBottom: 10,
  },
  pickerOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRightWidth: 1,
    borderColor: COLORS.border,
  },
  pickerOptionSelected: {
    backgroundColor: COLORS.primary,
  },
  pickerOptionText: {
    color: COLORS.text,
    fontSize: 14,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  formButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  formButtonText: {
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
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
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
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    margin: 10,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
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
  modelName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    flexShrink: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    padding: 25,
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
    maxWidth: 500,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default AIModelAdminScreen;
