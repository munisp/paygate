import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, TextInput, Modal, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Placeholder for Agent type - replace with actual tRPC type if available
interface Agent {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive' | 'pending';
  commissionRate: number;
  createdAt: string;
  updatedAt: string;
}

const SuperAgentManagementScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);

  // tRPC queries and mutations
  const { data: agents, isLoading, isError, refetch, isRefetching } = trpc.superAgent.list.useQuery();
  const createAgentMutation = trpc.superAgent.create.useMutation();
  const updateAgentMutation = trpc.superAgent.update.useMutation();
  const deleteAgentMutation = trpc.superAgent.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredAgents = agents?.filter(agent =>
    agent.name.toLowerCase().includes(searchText.toLowerCase()) ||
    agent.email.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateAgent = async (newAgentData: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => {
    try {
      await createAgentMutation.mutateAsync(newAgentData);
      setCreateModalVisible(false);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create agent.');
    }
  };

  const handleUpdateAgent = async (updatedAgentData: Omit<Agent, 'createdAt' | 'updatedAt'>) => {
    if (!currentAgent) return;
    try {
      await updateAgentMutation.mutateAsync(updatedAgentData);
      setEditModalVisible(false);
      setCurrentAgent(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update agent.');
    }
  };

  const handleDeleteAgent = (agentId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this agent?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAgentMutation.mutateAsync({ id: agentId });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete agent.');
            }
          },
        },
      ]
    );
  };

  const renderAgentItem = ({ item }: { item: Agent }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.agentName}>{item.name}</Text>
        <View style={[styles.statusBadge, styles[`status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`]]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.agentEmail}>{item.email}</Text>
      <Text style={styles.agentDetail}>Commission Rate: {item.commissionRate}%</Text>
      <Text style={styles.agentDetail}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => { setCurrentAgent(item); setEditModalVisible(true); }} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteAgent(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading agents...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load agents. Please try again.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!filteredAgents || filteredAgents.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No agents found.</Text>
        <Button title="Create New Agent" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Super Agent Management</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Add Agent</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search agents..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredAgents}
        keyExtractor={(item) => item.id}
        renderItem={renderAgentItem}
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

      {/* Create Agent Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Agent</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Agent Name"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentAgent(prev => ({ ...prev!, name: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Agent Email"
              placeholderTextColor={COLORS.muted}
              keyboardType="email-address"
              onChangeText={(text) => setCurrentAgent(prev => ({ ...prev!, email: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Commission Rate (%)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              onChangeText={(text) => setCurrentAgent(prev => ({ ...prev!, commissionRate: parseFloat(text) }))}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={() => handleCreateAgent(currentAgent as any)} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Agent Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Agent</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Agent Name"
              placeholderTextColor={COLORS.muted}
              value={currentAgent?.name}
              onChangeText={(text) => setCurrentAgent(prev => ({ ...prev!, name: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Agent Email"
              placeholderTextColor={COLORS.muted}
              keyboardType="email-address"
              value={currentAgent?.email}
              onChangeText={(text) => setCurrentAgent(prev => ({ ...prev!, email: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Commission Rate (%)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentAgent?.commissionRate.toString()}
              onChangeText={(text) => setCurrentAgent(prev => ({ ...prev!, commissionRate: parseFloat(text) }))}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => { setEditModalVisible(false); setCurrentAgent(null); }} color={COLORS.error} />
              <Button title="Save" onPress={() => handleUpdateAgent(currentAgent as any)} color={COLORS.primary} />
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
    fontSize: 16,
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
    fontSize: 20,
    fontWeight: 'bold',
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
    color: COLORS.text,
    margin: 15,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
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
  agentName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  agentEmail: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  agentDetail: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 2,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 20,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
});

export default SuperAgentManagementScreen;