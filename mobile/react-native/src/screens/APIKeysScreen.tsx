import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Clipboard,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

/**
 * Design System Colors
 */
const colors = {
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

/**
 * TypeScript Interfaces
 */
interface APIKey {
  id: string;
  name: string;
  key: string;
  environment: 'test' | 'live';
  createdAt: string;
}

interface CreateKeyModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, environment: 'test' | 'live') => void;
  isSubmitting: boolean;
}

/**
 * Create New Key Modal Component
 */
const CreateKeyModal: React.FC<CreateKeyModalProps> = ({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
}) => {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<'test' | 'live'>('test');

  const handleCreate = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a key name');
      return;
    }
    onSubmit(name, environment);
    setName('');
    setEnvironment('test');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Create New API Key</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Key Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Production Web App"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Environment</Text>
            <div style={styles.radioGroup}>
              <TouchableOpacity
                style={[
                  styles.radioButton,
                  environment === 'test' && styles.radioButtonActive,
                ]}
                onPress={() => setEnvironment('test')}
              >
                <Text
                  style={[
                    styles.radioText,
                    environment === 'test' && styles.radioTextActive,
                  ]}
                >
                  Test
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.radioButton,
                  environment === 'live' && styles.radioButtonActive,
                ]}
                onPress={() => setEnvironment('live')}
              >
                <Text
                  style={[
                    styles.radioText,
                    environment === 'live' && styles.radioTextActive,
                  ]}
                >
                  Live
                </Text>
              </TouchableOpacity>
            </div>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.buttonTextSecondary}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleCreate}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.buttonTextPrimary}>Create Key</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

/**
 * APIKeysScreen Component
 */
const APIKeysScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);

  // tRPC Queries & Mutations
  const utils = trpc.useContext();
  const { data: apiKeys, isLoading, isError, refetch, isRefetching } = trpc.apiKeys.list.useQuery();
  
  const createKeyMutation = trpc.apiKeys.create.useMutation({
    onSuccess: () => {
      utils.apiKeys.list.invalidate();
      setIsModalVisible(false);
      Alert.alert('Success', 'API key created successfully');
    },
    onError: (error) => {
      Alert.alert('Error', error.message || 'Failed to create API key');
    },
  });

  const deleteKeyMutation = trpc.apiKeys.delete.useMutation({
    onSuccess: () => {
      utils.apiKeys.list.invalidate();
      Alert.alert('Success', 'API key deleted');
    },
    onError: (error) => {
      Alert.alert('Error', error.message || 'Failed to delete API key');
    },
  });

  // Filtered Keys
  const filteredKeys = useMemo(() => {
    if (!apiKeys) return [];
    return apiKeys.filter((item: APIKey) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [apiKeys, searchQuery]);

  const handleCopy = (key: string) => {
    Clipboard.setString(key);
    Alert.alert('Copied', 'API key copied to clipboard');
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete API Key',
      'Are you sure you want to delete this API key? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteKeyMutation.mutate({ id }),
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: APIKey }) => (
    <View style={styles.keyCard}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.keyName}>{item.name}</Text>
          <Text style={styles.keyDate}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <View
          style={[
            styles.badge,
            { backgroundColor: item.environment === 'live' ? colors.success + '20' : colors.warning + '20' },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: item.environment === 'live' ? colors.success : colors.warning },
            ]}
          >
            {item.environment.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.keyContainer}>
        <Text style={styles.keyValue} numberOfLines={1} ellipsizeMode="middle">
          {item.key.replace(/.(?=.{4})/g, '•')}
        </Text>
        <TouchableOpacity
          style={styles.copyButton}
          onPress={() => handleCopy(item.key)}
        >
          <Text style={styles.copyButtonText}>Copy</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(item.id)}
      >
        <Text style={styles.deleteButtonText}>Revoke Key</Text>
      </TouchableOpacity>
    </View>
  );

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load API keys</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <Text style={styles.title}>API Keys</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setIsModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ New Key</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search keys..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredKeys}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No keys match your search' : 'No API keys found'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.emptyActionButton}
                onPress={() => setIsModalVisible(true)}
              >
                <Text style={styles.emptyActionButtonText}>Create your first key</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <CreateKeyModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        isSubmitting={createKeyMutation.isLoading}
        onSubmit={(name, environment) => createKeyMutation.mutate({ name, environment })}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  keyCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  keyName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  keyDate: {
    fontSize: 12,
    color: colors.muted,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  keyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  keyValue: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: colors.muted,
    fontSize: 14,
  },
  copyButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.border,
    borderRadius: 6,
  },
  copyButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  deleteButton: {
    alignSelf: 'flex-start',
  },
  deleteButtonText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '500',
  },
  emptyContainer: {
    marginTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
    marginBottom: 16,
  },
  emptyActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
  },
  emptyActionButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  radioButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  radioButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  radioText: {
    color: colors.muted,
    fontWeight: '500',
  },
  radioTextActive: {
    color: colors.primary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
  },
  buttonTextPrimary: {
    color: '#FFF',
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: colors.muted,
    fontWeight: '600',
  },
});

export default APIKeysScreen;
