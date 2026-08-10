import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useState, useEffect, useMemo } from 'react';
import { trpc } from '../lib/trpc';

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

interface SsoConfig {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
  clientId: string;
  clientSecret: string;
  metadataUrl: string;
  redirectUrl: string;
}

const TenantSsoConfigScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigation = useNavigation();
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<SsoConfig | null>(null);

  const { data, isLoading, isError, refetch } = trpc.tenantSsoConfig.list.useQuery();

  const createMutation = trpc.tenantSsoConfig.create.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });

  const updateMutation = trpc.tenantSsoConfig.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditModalVisible(false);
      setSelectedConfig(null);
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });

  const deleteMutation = trpc.tenantSsoConfig.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });


  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(
      (config) =>
        config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        config.provider.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load SSO configurations.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!data || data.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No SSO configurations found.</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create New SSO Config</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SSO Configurations</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by name or provider..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardText}>Provider: {item.provider}</Text>
            <Text style={styles.cardText}>Status: <Text style={{ color: item.isActive ? COLORS.success : COLORS.error }}>{item.isActive ? 'Active' : 'Inactive'}</Text></Text>
            <View style={styles.cardActions}>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => {
                setSelectedConfig(item);
                setEditModalVisible(true);
              }}>
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() =>
                Alert.alert(
                  'Delete SSO Config',
                  `Are you sure you want to delete ${item.name}?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id: item.id }) },
                  ]
                )
              }>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={COLORS.primary}
          />
        }
      />

      <CreateSsoConfigModal
        isVisible={isCreateModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onSubmit={(config) => createMutation.mutate(config)}
        isLoading={createMutation.isLoading}
      />

      <EditSsoConfigModal
        isVisible={isEditModalVisible}
        onClose={() => {
          setEditModalVisible(false);
          setSelectedConfig(null);
        }}
        onSubmit={(config) => updateMutation.mutate(config)}
        isLoading={updateMutation.isLoading}
        config={selectedConfig}
      />
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
    backgroundColor: COLORS.background,
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
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 15,
    marginBottom: 10,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  listContentContainer: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 3,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
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
});

interface CreateSsoConfigModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (config: Omit<SsoConfig, 'id' | 'isActive'>) => void;
  isLoading: boolean;
}

const CreateSsoConfigModal: React.FC<CreateSsoConfigModalProps> = ({
  isVisible,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [metadataUrl, setMetadataUrl] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');

  const handleSubmit = () => {
    onSubmit({ name, provider, clientId, clientSecret, metadataUrl, redirectUrl });
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={modalStyles.centeredView}>
        <View style={modalStyles.modalView}>
          <Text style={modalStyles.modalTitle}>Create SSO Configuration</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="Name"
            placeholderTextColor={COLORS.muted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Provider"
            placeholderTextColor={COLORS.muted}
            value={provider}
            onChangeText={setProvider}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Client ID"
            placeholderTextColor={COLORS.muted}
            value={clientId}
            onChangeText={setClientId}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Client Secret"
            placeholderTextColor={COLORS.muted}
            value={clientSecret}
            onChangeText={setClientSecret}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Metadata URL"
            placeholderTextColor={COLORS.muted}
            value={metadataUrl}
            onChangeText={setMetadataUrl}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Redirect URL"
            placeholderTextColor={COLORS.muted}
            value={redirectUrl}
            onChangeText={setRedirectUrl}
          />
          <View style={modalStyles.buttonContainer}>
            <TouchableOpacity
              style={[modalStyles.button, modalStyles.buttonClose]}
              onPress={onClose}
            >
              <Text style={modalStyles.textStyle}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.button, modalStyles.buttonSubmit]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              <Text style={modalStyles.textStyle}>
                {isLoading ? <ActivityIndicator color={COLORS.text} /> : 'Create'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

interface EditSsoConfigModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (config: Omit<SsoConfig, 'isActive'>) => void;
  isLoading: boolean;
  config: SsoConfig | null;
}

const EditSsoConfigModal: React.FC<EditSsoConfigModalProps> = ({
  isVisible,
  onClose,
  onSubmit,
  isLoading,
  config,
}) => {
  const [name, setName] = useState(config?.name || '');
  const [provider, setProvider] = useState(config?.provider || '');
  const [clientId, setClientId] = useState(config?.clientId || '');
  const [clientSecret, setClientSecret] = useState(config?.clientSecret || '');
  const [metadataUrl, setMetadataUrl] = useState(config?.metadataUrl || '');
  const [redirectUrl, setRedirectUrl] = useState(config?.redirectUrl || '');
  const [isActive, setIsActive] = useState(config?.isActive || false);

  useEffect(() => {
    if (config) {
      setName(config.name);
      setProvider(config.provider);
      setClientId(config.clientId);
      setClientSecret(config.clientSecret);
      setMetadataUrl(config.metadataUrl);
      setRedirectUrl(config.redirectUrl);
      setIsActive(config.isActive);
    }
  }, [config]);

  const handleSubmit = () => {
    if (config) {
      onSubmit({ ...config, name, provider, clientId, clientSecret, metadataUrl, redirectUrl, isActive });
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={modalStyles.centeredView}>
        <View style={modalStyles.modalView}>
          <Text style={modalStyles.modalTitle}>Edit SSO Configuration</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="Name"
            placeholderTextColor={COLORS.muted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Provider"
            placeholderTextColor={COLORS.muted}
            value={provider}
            onChangeText={setProvider}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Client ID"
            placeholderTextColor={COLORS.muted}
            value={clientId}
            onChangeText={setClientId}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Client Secret"
            placeholderTextColor={COLORS.muted}
            value={clientSecret}
            onChangeText={setClientSecret}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Metadata URL"
            placeholderTextColor={COLORS.muted}
            value={metadataUrl}
            onChangeText={setMetadataUrl}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Redirect URL"
            placeholderTextColor={COLORS.muted}
            value={redirectUrl}
            onChangeText={setRedirectUrl}
          />
          <View style={modalStyles.switchContainer}>
            <Text style={modalStyles.switchLabel}>Active:</Text>
            <Switch
              trackColor={{ false: COLORS.muted, true: COLORS.success }}
              thumbColor={isActive ? COLORS.text : COLORS.text}
              ios_backgroundColor={COLORS.muted}
              onValueChange={setIsActive}
              value={isActive}
            />
          </View>
          <View style={modalStyles.buttonContainer}>
            <TouchableOpacity
              style={[modalStyles.button, modalStyles.buttonClose]}
              onPress={onClose}
            >
              <Text style={modalStyles.textStyle}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.button, modalStyles.buttonSubmit]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              <Text style={modalStyles.textStyle}>
                {isLoading ? <ActivityIndicator color={COLORS.text} /> : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
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
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  input: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    width: '100%',
    backgroundColor: COLORS.background,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  button: {
    borderRadius: 8,
    padding: 10,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  buttonClose: {
    backgroundColor: COLORS.muted,
  },
  buttonSubmit: {
    backgroundColor: COLORS.primary,
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
  },
  switchLabel: {
    color: COLORS.text,
    fontSize: 16,
  },
});

export default TenantSsoConfigScreen;
