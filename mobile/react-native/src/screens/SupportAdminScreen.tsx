import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Mock data types for Support tickets
interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  status: 'open' | 'closed' | 'pending';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
}

const SupportAdminScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [currentTicket, setCurrentTicket] = useState<SupportTicket | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  // tRPC queries and mutations
  const { data, isLoading, isError, refetch } = trpc.support.list.useQuery();
  const createTicketMutation = trpc.support.create.useMutation();
  const updateTicketMutation = trpc.support.update.useMutation();
  const deleteTicketMutation = trpc.support.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(ticket =>
    ticket.subject.toLowerCase().includes(searchText.toLowerCase()) ||
    ticket.description.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateTicket = async () => {
    try {
      await createTicketMutation.mutateAsync({ subject, description, priority });
      setModalVisible(false);
      setSubject('');
      setDescription('');
      setPriority('medium');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create ticket.');
    }
  };

  const handleEditTicket = async () => {
    if (!currentTicket) return;
    try {
      await updateTicketMutation.mutateAsync({ id: currentTicket.id, subject, description, priority });
      setModalVisible(false);
      setCurrentTicket(null);
      setSubject('');
      setDescription('');
      setPriority('medium');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update ticket.');
    }
  };

  const handleDeleteTicket = (id: string) => {
    Alert.alert(
      'Delete Ticket',
      'Are you sure you want to delete this ticket?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTicketMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete ticket.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openCreateModal = () => {
    setCurrentTicket(null);
    setSubject('');
    setDescription('');
    setPriority('medium');
    setModalVisible(true);
  };

  const openEditModal = (ticket: SupportTicket) => {
    setCurrentTicket(ticket);
    setSubject(ticket.subject);
    setDescription(ticket.description);
    setPriority(ticket.priority);
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: SupportTicket }) => (
    <View style={styles.ticketCard}>
      <Text style={styles.ticketSubject}>{item.subject}</Text>
      <Text style={styles.ticketDescription}>{item.description}</Text>
      <View style={styles.ticketDetails}>
        <Text style={styles.ticketDetailText}>Status: <Text style={[styles.statusBadge, styles[item.status]]}>{item.status}</Text></Text>
        <Text style={styles.ticketDetailText}>Priority: {item.priority}</Text>
        <Text style={styles.ticketDetailText}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <View style={styles.actionButtons}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteTicket(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Support Admin</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.createButton}>
          <Text style={styles.createButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tickets..."
          placeholderTextColor={COLORS.muted}
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading tickets...</Text>
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load tickets.</Text>
          <TouchableOpacity onPress={refetch} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !isError && (!filteredData || filteredData.length === 0) && (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No support tickets found.</Text>
        </View>
      )}

      {!isLoading && !isError && filteredData && filteredData.length > 0 && (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{currentTicket ? 'Edit Ticket' : 'Create New Ticket'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Subject"
              placeholderTextColor={COLORS.muted}
              value={subject}
              onChangeText={setSubject}
            />
            <TextInput
              style={[styles.modalInput, { height: 100, textAlignVertical: 'top' }]}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              multiline
              value={description}
              onChangeText={setDescription}
            />
            <View style={styles.priorityContainer}>
              <Text style={styles.priorityLabel}>Priority:</Text>
              {['low', 'medium', 'high'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityButton, priority === p && styles.priorityButtonActive]}
                  onPress={() => setPriority(p as 'low' | 'medium' | 'high')}
                >
                  <Text style={styles.priorityButtonText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <Pressable style={[styles.button, styles.buttonClose]} onPress={() => setModalVisible(false)}>
                <Text style={styles.textStyle}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonSave]}
                onPress={currentTicket ? handleEditTicket : handleCreateTicket}
              >
                <Text style={styles.textStyle}>{currentTicket ? 'Save Changes' : 'Create Ticket'}</Text>
              </Pressable>
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
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 20,
  },
  searchContainer: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
  },
  errorText: {
    color: COLORS.error,
    marginTop: 10,
  },
  emptyText: {
    color: COLORS.muted,
    marginTop: 10,
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
  },
  listContent: {
    padding: 16,
  },
  ticketCard: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  ticketSubject: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  ticketDescription: {
    color: COLORS.muted,
    marginBottom: 8,
  },
  ticketDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  ticketDetailText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  open: {
    backgroundColor: COLORS.warning,
  },
  closed: {
    backgroundColor: COLORS.success,
  },
  pending: {
    backgroundColor: COLORS.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
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
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  priorityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 15,
    alignItems: 'center',
  },
  priorityLabel: {
    color: COLORS.text,
    marginRight: 10,
  },
  priorityButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    backgroundColor: COLORS.muted,
  },
  priorityButtonActive: {
    backgroundColor: COLORS.primary,
  },
  priorityButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    borderRadius: 8,
    padding: 10,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
  },
  buttonClose: {
    backgroundColor: COLORS.muted,
  },
  buttonSave: {
    backgroundColor: COLORS.primary,
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default SupportAdminScreen;
