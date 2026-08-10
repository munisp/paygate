import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, TouchableOpacity, Alert, RefreshControl, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface WorkflowItem {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  lastRun: string;
  duration: number;
}

const WorkflowObservabilityScreen: React.FC = () => {
  const navigation = useNavigation();

  const { data: workflows, isLoading, isError, error, refetch } = trpc.workflowObservability.list.useQuery();
  const createWorkflowMutation = trpc.workflowObservability.create.useMutation();
  const updateWorkflowMutation = trpc.workflowObservability.update.useMutation();
  const deleteWorkflowMutation = trpc.workflowObservability.delete.useMutation();

  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowItem | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDuration, setWorkflowDuration] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleCreateWorkflow = async () => {
    if (!workflowName || !workflowDuration) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    try {
      await createWorkflowMutation.mutateAsync({
        name: workflowName,
        duration: parseInt(workflowDuration),
      });
      setModalVisible(false);
      setWorkflowName('');
      setWorkflowDuration('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create workflow.');
    }
  };

  const handleUpdateWorkflow = async () => {
    if (!currentWorkflow || !workflowName || !workflowDuration) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    try {
      await updateWorkflowMutation.mutateAsync({
        id: currentWorkflow.id,
        name: workflowName,
        duration: parseInt(workflowDuration),
      });
      setModalVisible(false);
      setCurrentWorkflow(null);
      setWorkflowName('');
      setWorkflowDuration('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update workflow.');
    }
  };

  const handleDeleteWorkflow = (id: string) => {
    Alert.alert(
      'Delete Workflow',
      'Are you sure you want to delete this workflow?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorkflowMutation.mutateAsync({ id });
              refetch();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete workflow.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (workflow: WorkflowItem) => {
    setCurrentWorkflow(workflow);
    setWorkflowName(workflow.name);
    setWorkflowDuration(workflow.duration.toString());
    setModalVisible(true);
  };

  const filteredWorkflows = useMemo(() => {
    if (!workflows) return [];
    return workflows.filter(workflow =>
      workflow.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [workflows, searchTerm]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const renderWorkflowItem = ({ item }: { item: WorkflowItem }) => {
    let statusColor;
    switch (item.status) {
      case 'completed':
        statusColor = COLORS.success;
        break;
      case 'failed':
        statusColor = COLORS.error;
        break;
      case 'running':
      default:
        statusColor = COLORS.warning;
        break;
    }

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={styles.statusBadge}>
          <Text style={[styles.statusBadgeText, { backgroundColor: statusColor }]}>{item.status.toUpperCase()}</Text>
        </View>
        <Text style={styles.cardText}>Last Run: {new Date(item.lastRun).toLocaleString()}</Text>
        <Text style={styles.cardText}>Duration: {formatDuration(item.duration)}</Text>
        <View style={styles.actionsContainer}>
          <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteWorkflow(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Workflow Observability</Text>
        <TouchableOpacity onPress={() => { setCurrentWorkflow(null); setWorkflowName(''); setWorkflowDuration(''); setModalVisible(true); }} style={[styles.actionButton, { backgroundColor: COLORS.success }]}>
          <Text style={styles.actionButtonText}>Add Workflow</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search workflows..."
          placeholderTextColor={COLORS.muted}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />

        {isLoading && <ActivityIndicator size="large" color={COLORS.primary} style={styles.loadingSpinner} />}
        {isError && <Text style={styles.errorText}>Error: {error?.message || 'Failed to load workflows.'}</Text>}
        {!isLoading && !isError && (!filteredWorkflows || filteredWorkflows.length === 0) && (
          <Text style={styles.mutedText}>No workflows found.</Text>
        )}
        {!isLoading && !isError && filteredWorkflows && filteredWorkflows.length > 0 && (
          <FlatList
            data={filteredWorkflows}
            keyExtractor={(item) => item.id}
            renderItem={renderWorkflowItem}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
                progressBackgroundColor={COLORS.card}
              />
            }
          />
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{currentWorkflow ? 'Edit Workflow' : 'Create Workflow'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Workflow Name"
              placeholderTextColor={COLORS.muted}
              value={workflowName}
              onChangeText={setWorkflowName}
            />
            <TextInput
              style={styles.input}
              placeholder="Duration (seconds)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={workflowDuration}
              onChangeText={setWorkflowDuration}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={currentWorkflow ? handleUpdateWorkflow : handleCreateWorkflow}
                style={[styles.actionButton, { backgroundColor: COLORS.success, marginLeft: 10 }]}>
                <Text style={styles.actionButtonText}>{currentWorkflow ? 'Update' : 'Create'}</Text>
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  text: {
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 10,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  mutedText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 10,
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
  },
  loadingSpinner: {
    marginTop: 20,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 5,
  },
  statusBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionsContainer: {
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
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    width: '80%',
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
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    width: '100%',
    backgroundColor: COLORS.card,
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    marginBottom: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 15,
  },
});

export default WorkflowObservabilityScreen;
