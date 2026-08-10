import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, FlatList, ActivityIndicator, RefreshControl, TextInput, TouchableOpacity, Alert, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface WebhookDelivery {
  id: string;
  url: string;
  status: 'success' | 'failed' | 'pending';
  payload: string;
  response: string;
  createdAt: string;
  updatedAt: string;
}

const WebhookDeliveriesScreen = () => {
  const navigation = useNavigation();

  const { data: webhookDeliveries, isLoading, isError, refetch, isRefetching } = trpc.webhookDeliveries.list.useQuery();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentWebhook, setCurrentWebhook] = useState<WebhookDelivery | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookPayload, setNewWebhookPayload] = useState('');
  const [editWebhookUrl, setEditWebhookUrl] = useState('');
  const [editWebhookPayload, setEditWebhookPayload] = useState('');

  const createWebhookMutation = trpc.webhookDeliveries.create.useMutation();
  const updateWebhookMutation = trpc.webhookDeliveries.update.useMutation();
  const deleteWebhookMutation = trpc.webhookDeliveries.delete.useMutation();

  const filteredDeliveries = webhookDeliveries?.filter(delivery =>
    delivery.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateWebhook = async () => {
    try {
      await createWebhookMutation.mutateAsync({ url: newWebhookUrl, payload: newWebhookPayload });
      setCreateModalVisible(false);
      setNewWebhookUrl('');
      setNewWebhookPayload('');
      refetch();
    } catch (error) {
      console.error("Failed to create webhook:", error);
      Alert.alert("Error", "Failed to create webhook.");
    }
  };

  const handleEditWebhook = async () => {
    if (!currentWebhook) return;
    try {
      await updateWebhookMutation.mutateAsync({ id: currentWebhook.id, url: editWebhookUrl, payload: editWebhookPayload });
      setEditModalVisible(false);
      setCurrentWebhook(null);
      setEditWebhookUrl('');
      setEditWebhookPayload('');
      refetch();
    } catch (error) {
      console.error("Failed to update webhook:", error);
      Alert.alert("Error", "Failed to update webhook.");
    }
  };

  const handleDeleteWebhook = (id: string) => {
    Alert.alert(
      "Delete Webhook",
      "Are you sure you want to delete this webhook?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteWebhookMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              console.error("Failed to delete webhook:", error);
              Alert.alert("Error", "Failed to delete webhook.");
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Webhook Deliveries</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search deliveries..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>

      {/* FlatList for displaying webhook deliveries */}
      {isLoading && <ActivityIndicator size="large" color={COLORS.primary} style={styles.loadingIndicator} />}
      {isError && <Text style={styles.errorText}>Failed to load webhook deliveries.</Text>}
      {!isLoading && !isError && webhookDeliveries && webhookDeliveries.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No webhook deliveries found.</Text>
        </View>
      )}
      {!isLoading && !isError && webhookDeliveries && webhookDeliveries.length > 0 && (
        <FlatList
          data={filteredDeliveries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.url}</Text>
              <View style={styles.statusContainer}>
                <View style={[styles.statusBadge, { backgroundColor: item.status === 'success' ? COLORS.success : item.status === 'failed' ? COLORS.error : COLORS.warning }]}>
                  <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.dateText}>{new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString()}</Text>
              </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.warning }]}
                onPress={() => {
                  setCurrentWebhook(item);
                  setEditWebhookUrl(item.url);
                  setEditWebhookPayload(item.payload);
                  setEditModalVisible(true);
                }}
              >
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.error }]}
                onPress={() => handleDeleteWebhook(item.id)}
              >
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={COLORS.primary}
            />
          }
          contentContainerStyle={styles.listContentContainer}
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Webhook</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Webhook URL"
              placeholderTextColor={COLORS.muted}
              value={newWebhookUrl}
              onChangeText={setNewWebhookUrl}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Payload (JSON)"
              placeholderTextColor={COLORS.muted}
              value={newWebhookPayload}
              onChangeText={setNewWebhookPayload}
              multiline
            />
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.muted }]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButton} onPress={handleCreateWebhook}>
                <Text style={styles.modalButtonText}>Create</Text>
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
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Webhook</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Webhook URL"
              placeholderTextColor={COLORS.muted}
              value={editWebhookUrl}
              onChangeText={setEditWebhookUrl}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Payload (JSON)"
              placeholderTextColor={COLORS.muted}
              value={editWebhookPayload}
              onChangeText={setEditWebhookPayload}
              multiline
            />
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.muted }]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButton} onPress={handleEditWebhook}>
                <Text style={styles.modalButtonText}>Save</Text>
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
    borderRadius: 8,
    color: COLORS.text,
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
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 3,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateText: {
    color: COLORS.muted,
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyStateText: {
    color: COLORS.muted,
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 20,
    width: '80%',
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
  loadingIndicator: {
    marginVertical: 20,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 16,
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
    fontWeight: 'bold',
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 8,
    color: COLORS.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 15,
    minHeight: 40,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 15,
  },
});

export default WebhookDeliveriesScreen;