import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, FlatList, ActivityIndicator, RefreshControl, Alert, TouchableOpacity, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

type WebhookEvent = {
  id: string;
  eventType: string;
  payload: Record<string, any>;
  status: 'pending' | 'success' | 'failed';
  createdAt: string;
};

const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'USD') => {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const WebhookEventsPageScreen = () => {
  const navigation = useNavigation();

  const { data, isLoading, error, refetch } = trpc.webhookEvents.list.useQuery();
  const createMutation = trpc.webhookEvents.create.useMutation();
  const updateMutation = trpc.webhookEvents.update.useMutation();
  const deleteMutation = trpc.webhookEvents.delete.useMutation();

  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [newEventType, setNewEventType] = useState('');
  const [newPayload, setNewPayload] = useState('');
  const [editEventType, setEditEventType] = useState('');
  const [editPayload, setEditPayload] = useState('');

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    return data.filter(event =>
      event.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(event.payload).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  const getStatusColor = (status: WebhookEvent['status']) => {
    switch (status) {
      case 'success':
        return COLORS.success;
      case 'failed':
        return COLORS.error;
      case 'pending':
      default:
        return COLORS.warning;
    }
  };

  const renderItem = ({ item }: { item: WebhookEvent }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.eventType}</Text>
      <Text style={styles.cardText}>ID: {item.id}</Text>
      <View style={styles.statusBadge}>
        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>Status: {item.status.toUpperCase()}</Text>
      </View>
      {item.payload.amount && (
        <Text style={styles.cardText}>Amount: {formatCurrency(item.payload.amount, item.payload.currency || 'USD')}</Text>
      )}
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <Button title="Edit" onPress={() => {
          setSelectedEvent(item);
          setEditEventType(item.eventType);
          setEditPayload(JSON.stringify(item.payload, null, 2));
          setIsEditModalVisible(true);
        }} />
        <Button title="Delete" onPress={() => handleDelete(item.id)} color={COLORS.error} />
      </View>
    </View>
  );

  const handleCreate = async () => {
    try {
      const payloadObject = JSON.parse(newPayload);
      await createMutation.mutateAsync({ eventType: newEventType, payload: payloadObject });
      setNewEventType('');
      setNewPayload('');
      setIsCreateModalVisible(false);
      refetch();
    } catch (e) {
      Alert.alert('Error', 'Failed to create webhook event. Check payload JSON format.');
      console.error(e);
    }
  };

  const handleUpdate = async () => {
    if (!selectedEvent) return;
    try {
      const payloadObject = JSON.parse(editPayload);
      await updateMutation.mutateAsync({ id: selectedEvent.id, eventType: editEventType, payload: payloadObject });
      setSelectedEvent(null);
      setEditEventType('');
      setEditPayload('');
      setIsEditModalVisible(false);
      refetch();
    } catch (e) {
      Alert.alert('Error', 'Failed to update webhook event. Check payload JSON format.');
      console.error(e);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Webhook Event',
      'Are you sure you want to delete this webhook event?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteMutation.mutateAsync({ id });
            refetch();
          } catch (e) {
            Alert.alert('Error', 'Failed to delete webhook event.');
            console.error(e);
          }
        } },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Webhook Events</Text>
        <Button title="Create" onPress={() => setIsCreateModalVisible(true)} />
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search events..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {isLoading && <ActivityIndicator size="large" color={COLORS.primary} style={styles.loadingIndicator} />}
      {error && <Text style={styles.errorText}>Failed to load webhook events: {error.message}</Text>}
      {!isLoading && !error && filteredEvents.length === 0 && (
        <Text style={styles.emptyText}>No webhook events found.</Text>
      )}

      {!isLoading && !error && filteredEvents.length > 0 && (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]} // for Android
              progressBackgroundColor={COLORS.card} // for Android
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
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Webhook Event</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Event Type"
              placeholderTextColor={COLORS.muted}
              value={newEventType}
              onChangeText={setNewEventType}
            />
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Payload (JSON)"
              placeholderTextColor={COLORS.muted}
              value={newPayload}
              onChangeText={setNewPayload}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalActions}>
              <Button title="Save" onPress={handleCreate} />
              <Button title="Cancel" onPress={() => setIsCreateModalVisible(false)} color={COLORS.error} />
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
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Webhook Event</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Event Type"
              placeholderTextColor={COLORS.muted}
              value={editEventType}
              onChangeText={setEditEventType}
            />
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Payload (JSON)"
              placeholderTextColor={COLORS.muted}
              value={editPayload}
              onChangeText={setEditPayload}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalActions}>
              <Button title="Save" onPress={handleUpdate} />
              <Button title="Cancel" onPress={() => setIsEditModalVisible(false)} color={COLORS.error} />
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  loadingIndicator: {
    marginTop: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginBottom: 8,
    backgroundColor: COLORS.border, // A neutral background for the badge itself
  },
  statusText: {
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 10, // Add some space between buttons
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 20,
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
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  modalTextArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingVertical: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
    gap: 10,
  },
});

export default WebhookEventsPageScreen;
