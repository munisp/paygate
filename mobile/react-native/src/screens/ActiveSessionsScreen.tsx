import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface Session {
  id: string;
  merchantId: string;
  deviceInfo: string;
  ipAddress: string;
  status: 'active' | 'inactive' | 'blocked';
  createdAt: string;
  lastActivity: string;
}

const ActiveSessionsScreen = () => {
  const navigation = useNavigation();

  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [newSessionData, setNewSessionData] = useState({
    deviceInfo: '',
    ipAddress: '',
    status: 'active' as 'active' | 'inactive' | 'blocked',
  });

  const { data: sessions, isLoading, isError, error, refetch } = trpc.sessions.list.useQuery();
  const createSessionMutation = trpc.sessions.create.useMutation();
  const updateSessionMutation = trpc.sessions.update.useMutation();
  const deleteSessionMutation = trpc.sessions.delete.useMutation();

  const handleCreateSession = async () => {
    try {
      await createSessionMutation.mutateAsync(newSessionData);
      setCreateModalVisible(false);
      setNewSessionData({ deviceInfo: '', ipAddress: '', status: 'active' });
      refetch();
    } catch (err) {
      console.error('Failed to create session:', err);
      Alert.alert('Error', 'Failed to create session.');
    }
  };

  const handleUpdateSession = async () => {
    if (!currentSession) return;
    try {
      await updateSessionMutation.mutateAsync({ id: currentSession.id, ...newSessionData });
      setEditModalVisible(false);
      setCurrentSession(null);
      setNewSessionData({ deviceInfo: '', ipAddress: '', status: 'active' });
      refetch();
    } catch (err) {
      console.error('Failed to update session:', err);
      Alert.alert('Error', 'Failed to update session.');
    }
  };

  const handleDeleteSession = (id: string) => {
    Alert.alert(
      'Delete Session',
      'Are you sure you want to delete this session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSessionMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              console.error('Failed to delete session:', err);
              Alert.alert('Error', 'Failed to delete session.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const onRefresh = useCallback(() => {
    refetch();
  }, []);

  const filteredSessions = sessions?.filter(session =>
    session.deviceInfo.toLowerCase().includes(searchText.toLowerCase()) ||
    session.ipAddress.toLowerCase().includes(searchText.toLowerCase())
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading sessions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error?.message}</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Active Sessions</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addButton}>
          <Text style={styles.addButtonText}>Add Session</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        {/* Search and Filter */}
        <TextInput
          style={styles.searchInput}
          placeholder="Search sessions..."
          placeholderTextColor={COLORS.muted}
          value={searchText}
          onChangeText={setSearchText}
        />

        {/* Empty State */}
        {filteredSessions?.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateText}>No active sessions found.</Text>
            <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.emptyStateButton}>
              <Text style={styles.emptyStateButtonText}>Create New Session</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredSessions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.sessionCard}>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionText}>Device: {item.deviceInfo}</Text>
                  <Text style={styles.sessionText}>IP: {item.ipAddress}</Text>
                  <Text style={styles.sessionText}>Status: <Text style={{ color: item.status === 'active' ? COLORS.success : item.status === 'blocked' ? COLORS.error : COLORS.warning }}>{item.status}</Text></Text>
                  <Text style={styles.sessionText}>Created: {new Date(item.createdAt).toLocaleString()}</Text>
                  <Text style={styles.sessionText}>Last Activity: {new Date(item.lastActivity).toLocaleString()}</Text>
                </View>
                <View style={styles.sessionActions}>
                  <TouchableOpacity onPress={() => {
                    setCurrentSession(item);
                    setNewSessionData({ deviceInfo: item.deviceInfo, ipAddress: item.ipAddress, status: item.status });
                    setEditModalVisible(true);
                  }} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteSession(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
              />
            }
          />
        )}
      </View>

      {/* Create Session Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Session</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Device Info"
              placeholderTextColor={COLORS.muted}
              value={newSessionData.deviceInfo}
              onChangeText={(text) => setNewSessionData({ ...newSessionData, deviceInfo: text })}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="IP Address"
              placeholderTextColor={COLORS.muted}
              value={newSessionData.ipAddress}
              onChangeText={(text) => setNewSessionData({ ...newSessionData, ipAddress: text })}
            />
            {/* Status Picker could be added here */}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateSession} style={[styles.actionButton, { backgroundColor: COLORS.success }]}>
                <Text style={styles.actionButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Session Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Session</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Device Info"
              placeholderTextColor={COLORS.muted}
              value={newSessionData.deviceInfo}
              onChangeText={(text) => setNewSessionData({ ...newSessionData, deviceInfo: text })}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="IP Address"
              placeholderTextColor={COLORS.muted}
              value={newSessionData.ipAddress}
              onChangeText={(text) => setNewSessionData({ ...newSessionData, ipAddress: text })}
            />
            {/* Status Picker could be added here */}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUpdateSession} style={[styles.actionButton, { backgroundColor: COLORS.success }]}>
                <Text style={styles.actionButtonText}>Save</Text>
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
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  content: {
    flex: 1,
    padding: 16,
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
    marginBottom: 15,
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
  addButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyStateButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  sessionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionText: {
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 4,
  },
  sessionActions: {
    flexDirection: 'row',
    marginLeft: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalView: {
    margin: 20,
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
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 15,
    width: '100%',
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 15,
  },
});

export default ActiveSessionsScreen;
