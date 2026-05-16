import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert, RefreshControl, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is set up here

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface SDKToken {
  id: string;
  name: string;
  token: string;
  status: 'active' | 'inactive' | 'expired';
  createdAt: string;
  expiresAt: string;
}

const SDKTokensScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [newSDKTokenName, setNewSDKTokenName] = useState('');
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingToken, setEditingToken] = useState<SDKToken | null>(null);
  const [editedTokenName, setEditedTokenName] = useState('');

  // tRPC queries and mutations
  const { data: sdkTokens, isLoading, isError, refetch, isRefetching } = trpc.sdkTokens.list.useQuery();
  const createMutation = trpc.sdkTokens.create.useMutation();
  const updateMutation = trpc.sdkTokens.update.useMutation();
  const deleteMutation = trpc.sdkTokens.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredTokens = sdkTokens?.filter(token =>
    token.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateToken = async () => {
    try {
      await createMutation.mutateAsync({ name: newSDKTokenName });
      setCreateModalVisible(false);
      setNewSDKTokenName('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create SDK Token.');
    }
  };

  const handleEditToken = async () => {
    if (!editingToken) return;
    try {
      await updateMutation.mutateAsync({ id: editingToken.id, name: editedTokenName });
      setEditModalVisible(false);
      setEditingToken(null);
      setEditedTokenName('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update SDK Token.');
    }
  };

  const handleDeleteToken = (id: string) => {
    Alert.alert(
      'Delete SDK Token',
      'Are you sure you want to delete this SDK Token?',
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
              Alert.alert('Error', 'Failed to delete SDK Token.');
            }
          },
        },
      ]
    );
  };

  const renderTokenItem = ({ item }: { item: SDKToken }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.tokenName}>{item.name}</Text>
        <View style={[styles.statusBadge, item.status === 'active' ? styles.statusActive : item.status === 'inactive' ? styles.statusInactive : styles.statusExpired]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.tokenValue}>Token: {item.token}</Text>
      <Text style={styles.cardText}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <Text style={styles.cardText}>Expires: {new Date(item.expiresAt).toLocaleDateString()}</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => {
          setEditingToken(item);
          setEditedTokenName(item.name);
          setEditModalVisible(true);
        }} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteToken(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading SDK Tokens...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load SDK Tokens.</Text>
        <TouchableOpacity onPress={refetch} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>SDK Tokens</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Create Token</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search tokens..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredTokens?.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No SDK Tokens found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTokens}
          keyExtractor={(item) => item.id}
          renderItem={renderTokenItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New SDK Token</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Token Name"
              placeholderTextColor={COLORS.muted}
              value={newSDKTokenName}
              onChangeText={setNewSDKTokenName}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={handleCreateToken} color={COLORS.primary} />
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit SDK Token</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Token Name"
              placeholderTextColor={COLORS.muted}
              value={editedTokenName}
              onChangeText={setEditedTokenName}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button title="Save" onPress={handleEditToken} color={COLORS.primary} />
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
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.background,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 15,
    margin: 20,
    borderRadius: 10,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tokenName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  tokenValue: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 5,
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 3,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  statusActive: {
    backgroundColor: COLORS.success,
  },
  statusInactive: {
    backgroundColor: COLORS.warning,
  },
  statusExpired: {
    backgroundColor: COLORS.error,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  actions: {
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
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
    backgroundColor: COLORS.background,
    color: COLORS.text,
    width: '100%',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
});

export default SDKTokensScreen;
