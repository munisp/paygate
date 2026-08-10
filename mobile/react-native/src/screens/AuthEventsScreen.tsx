import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
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

// --- Type Definitions (Mocked for demonstration) ---
// In a real app, these would come from your tRPC schema or a shared types file.
interface AuthEvent {
  id: string;
  type: string; // e.g., 'LOGIN', 'PASSWORD_RESET', 'MFA_CHALLENGE'
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  timestamp: string; // ISO date string
  ipAddress: string;
  userAgent: string;
  userId: string;
}

interface CreateAuthEventInput {
  type: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  ipAddress: string;
  userAgent: string;
  userId: string;
}

interface UpdateAuthEventInput {
  id: string;
  type?: string;
  status?: 'SUCCESS' | 'FAILED' | 'PENDING';
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
}

// --- Helper Components ---
const StatusBadge: React.FC<{ status: AuthEvent['status'] }> = ({ status }) => {
  let backgroundColor;
  let textColor = COLORS.text;

  switch (status) {
    case 'SUCCESS':
      backgroundColor = COLORS.success;
      break;
    case 'FAILED':
      backgroundColor = COLORS.error;
      break;
    case 'PENDING':
      backgroundColor = COLORS.warning;
      break;
    default:
      backgroundColor = COLORS.muted;
  }

  return (
    <View style={[styles.statusBadge, { backgroundColor }]}>
      <Text style={[styles.statusBadgeText, { color: textColor }]}>{status}</Text>
    </View>
  );
};

const AuthEventsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AuthEvent | null>(null);

  // --- tRPC Queries and Mutations (Mocked for demonstration) ---
  // In a real app, these would be actual tRPC calls.
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.authEvents.list.useQuery();
  const createMutation = trpc.authEvents.create.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
      Alert.alert('Success', 'Auth event created successfully.');
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to create event: ${err.message}`);
    },
  });
  const updateMutation = trpc.authEvents.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditModalVisible(false);
      setEditingEvent(null);
      Alert.alert('Success', 'Auth event updated successfully.');
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to update event: ${err.message}`);
    },
  });
  const deleteMutation = trpc.authEvents.delete.useMutation({
    onSuccess: () => {
      refetch();
      Alert.alert('Success', 'Auth event deleted successfully.');
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to delete event: ${err.message}`);
    },
  });

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(
      (event) =>
        event.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.ipAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.userId.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  const handleCreateEvent = (input: CreateAuthEventInput) => {
    createMutation.mutate(input);
  };

  const handleUpdateEvent = (input: UpdateAuthEventInput) => {
    updateMutation.mutate(input);
  };

  const handleDeleteEvent = (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this authentication event?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
      ],
      { cancelable: true }
    );
  };

  const renderItem = useCallback(({ item }: { item: AuthEvent }) => {
    const formattedDate = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(item.timestamp));

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.type}</Text>
          <StatusBadge status={item.status} />
        </View>
        <Text style={styles.cardText}>User ID: {item.userId}</Text>
        <Text style={styles.cardText}>IP Address: {item.ipAddress}</Text>
        <Text style={styles.cardText}>User Agent: {item.userAgent}</Text>
        <Text style={styles.cardText}>Timestamp: {formattedDate}</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: COLORS.primary }]} // Primary for Edit
            onPress={() => {
              setEditingEvent(item);
              setEditModalVisible(true);
            }}
          >
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: COLORS.error }]} // Error for Delete
            onPress={() => handleDeleteEvent(item.id)}
          >
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [handleDeleteEvent]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading authentication events...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load authentication events.</Text>
        <Text style={styles.errorText}>Error: {error?.message || 'Unknown error'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Authentication Events</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ Add Event</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search events by type, status, IP, or user ID..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No authentication events found.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      {/* Create Event Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Auth Event</Text>
            {/* Mocked form fields */}
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Event Type (e.g., LOGIN)" />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Status (SUCCESS, FAILED, PENDING)" />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="IP Address" />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="User Agent" />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="User ID" />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.muted }]}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={() => handleCreateEvent({ type: 'MOCK_CREATE', status: 'PENDING', ipAddress: '127.0.0.1', userAgent: 'MockAgent', userId: 'mockUser' })}
              >
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Event Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Auth Event</Text>
            {editingEvent && (
              <>
                <Text style={styles.modalLabel}>ID: {editingEvent.id}</Text>
                {/* Mocked form fields pre-filled with editingEvent data */}
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Event Type" defaultValue={editingEvent.type} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Status" defaultValue={editingEvent.status} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="IP Address" defaultValue={editingEvent.ipAddress} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="User Agent" defaultValue={editingEvent.userAgent} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="User ID" defaultValue={editingEvent.userId} />
              </>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.muted }]}
                onPress={() => {
                  setEditModalVisible(false);
                  setEditingEvent(null);
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={() => editingEvent && handleUpdateEvent({ id: editingEvent.id, type: 'MOCK_UPDATE', status: 'SUCCESS' })}
              >
                <Text style={styles.modalButtonText}>Save Changes</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 16 : 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    margin: 16,
    paddingHorizontal: 12,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
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
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
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
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalLabel: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  modalInput: {
    height: 45,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
    marginBottom: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  modalButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default AuthEventsScreen;
