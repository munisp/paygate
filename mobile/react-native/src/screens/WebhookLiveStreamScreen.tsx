import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, SafeAreaView, StatusBar, TextInput, TouchableOpacity, Alert, Modal, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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

// Placeholder for webhook type - replace with actual tRPC type if available
interface WebhookLiveStream {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

const WebhookLiveStreamScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentWebhook, setCurrentWebhook] = useState<WebhookLiveStream | null>(null);

  // tRPC queries and mutations
  const { data: webhooks, isLoading, isError, refetch } = trpc.webhookLiveStream.list.useQuery();
  const createMutation = trpc.webhookLiveStream.create.useMutation();
  const updateMutation = trpc.webhookLiveStream.update.useMutation();
  const deleteMutation = trpc.webhookLiveStream.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredWebhooks = webhooks?.filter(webhook =>
    webhook.name.toLowerCase().includes(searchText.toLowerCase()) ||
    webhook.url.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateWebhook = async (name: string, url: string) => {
    try {
      await createMutation.mutateAsync({ name, url });
      setCreateModalVisible(false);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create webhook.');
    }
  };

  const handleUpdateWebhook = async (id: string, name: string, url: string, status: 'active' | 'inactive' | 'pending') => {
    try {
      await updateMutation.mutateAsync({ id, name, url, status });
      setEditModalVisible(false);
      setCurrentWebhook(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update webhook.');
    }
  };

  const handleDeleteWebhook = (id: string) => {
    Alert.alert(
      'Delete Webhook',
      'Are you sure you want to delete this webhook?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete webhook.');
            }
          },
        },
      ]
    );
  };

  const renderWebhookItem = ({ item }: { item: WebhookLiveStream }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardText}>URL: {item.url}</Text>
      <View style={styles.statusContainer}>
        <Text style={styles.cardText}>Status: </Text>
        <Text style={[styles.statusBadge, item.status === 'active' && styles.statusActive, item.status === 'inactive' && styles.statusInactive, item.status === 'pending' && styles.statusPending]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.cardText}>Created: {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString()}</Text>
      <Text style={styles.cardText}>Updated: {new Date(item.updatedAt).toLocaleDateString()} {new Date(item.updatedAt).toLocaleTimeString()}</Text>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.button, styles.editButton]} onPress={() => {
          setCurrentWebhook(item);
          setEditModalVisible(true);
        }}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={() => handleDeleteWebhook(item.id)}>
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
          <Text style={styles.loadingText}>Loading webhooks...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load webhooks. Please try again.</Text>
          <Button title="Retry" onPress={refetch} color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Webhook Live Stream</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Create Webhook</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search webhooks..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredWebhooks && filteredWebhooks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No webhooks found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredWebhooks}
          keyExtractor={(item) => item.id}
          renderItem={renderWebhookItem}
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

      {/* Create Webhook Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Webhook</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Webhook Name"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentWebhook(prev => ({ ...prev!, name: text }))}
              value={currentWebhook?.name || ''}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Webhook URL"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentWebhook(prev => ({ ...prev!, url: text }))}
              value={currentWebhook?.url || ''}
            />
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={() => handleCreateWebhook(currentWebhook?.name || '', currentWebhook?.url || '')} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Webhook Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Webhook</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Webhook Name"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentWebhook(prev => ({ ...prev!, name: text }))}
              value={currentWebhook?.name || ''}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Webhook URL"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentWebhook(prev => ({ ...prev!, url: text }))}
              value={currentWebhook?.url || ''}
            />
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={() => handleUpdateWebhook(currentWebhook?.id || '', currentWebhook?.name || '', currentWebhook?.url || '', currentWebhook?.status || 'pending')} color={COLORS.primary} />
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
  screenTitle: {
    fontSize: 24,
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
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
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
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontWeight: 'bold',
    fontSize: 12,
    color: COLORS.background,
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
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    width: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  modalInput: {
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
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
});

export default WebhookLiveStreamScreen;
