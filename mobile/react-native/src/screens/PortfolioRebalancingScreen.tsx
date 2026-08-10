import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { trpc } from '../lib/trpc';

// Define the type for navigation props (assuming a root stack navigator)
type RootStackParamList = {
  PortfolioRebalancing: undefined;
  // Add other screen names if necessary
};

type PortfolioRebalancingScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'PortfolioRebalancing'
>;

interface PortfolioRebalancingScreenProps {
  navigation: PortfolioRebalancingScreenNavigationProp;
}

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

interface PortfolioItem {
  id: string;
  name: string;
  amount: number;
  status: 'Active' | 'Inactive' | 'Pending';
  lastRebalanced: string;
}

const PortfolioRebalancingScreen: React.FC<PortfolioRebalancingScreenProps> = () => {
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentPortfolioItem, setCurrentPortfolioItem] = useState<PortfolioItem | null>(null);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [newPortfolioAmount, setNewPortfolioAmount] = useState('');

  const { data, isLoading, isError, refetch } = trpc.portfolioRebalancing.list.useQuery();
  const createMutation = trpc.portfolioRebalancing.create.useMutation();
  const updateMutation = trpc.portfolioRebalancing.update.useMutation();
  const deleteMutation = trpc.portfolioRebalancing.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreatePortfolio = async () => {
    if (!newPortfolioName || !newPortfolioAmount) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: newPortfolioName,
        amount: parseFloat(newPortfolioAmount),
        status: 'Pending',
        lastRebalanced: new Date().toISOString(),
      });
      setCreateModalVisible(false);
      setNewPortfolioName('');
      setNewPortfolioAmount('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create portfolio.');
    }
  };

  const handleEditPortfolio = async () => {
    if (!currentPortfolioItem || !newPortfolioName || !newPortfolioAmount) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: currentPortfolioItem.id,
        name: newPortfolioName,
        amount: parseFloat(newPortfolioAmount),
        status: currentPortfolioItem.status,
        lastRebalanced: new Date().toISOString(),
      });
      setEditModalVisible(false);
      setNewPortfolioName('');
      setNewPortfolioAmount('');
      setCurrentPortfolioItem(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update portfolio.');
    }
  };

  const handleDeletePortfolio = (id: string) => {
    Alert.alert(
      'Delete Portfolio',
      'Are you sure you want to delete this portfolio?',
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
              Alert.alert('Error', 'Failed to delete portfolio.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (item: PortfolioItem) => {
    setCurrentPortfolioItem(item);
    setNewPortfolioName(item.name);
    setNewPortfolioAmount(item.amount.toString());
    setEditModalVisible(true);
  };

  const renderItem = ({ item }: { item: PortfolioItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'Active' ? COLORS.success : item.status === 'Pending' ? COLORS.warning : COLORS.error }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: ${item.amount.toFixed(2)}</Text>
      <Text style={styles.cardText}>Last Rebalanced: {new Date(item.lastRebalanced).toLocaleDateString()}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => openEditModal(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDeletePortfolio(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading portfolios...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load portfolios. Please try again.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (filteredData?.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No portfolios found.</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create New Portfolio</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Portfolio Rebalancing</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search portfolios..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Portfolio</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Portfolio Name"
              placeholderTextColor={COLORS.muted}
              value={newPortfolioName}
              onChangeText={setNewPortfolioName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount (USD)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newPortfolioAmount}
              onChangeText={setNewPortfolioAmount}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.error }]}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={handleCreatePortfolio}
              >
                <Text style={styles.actionButtonText}>Create</Text>
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Portfolio</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Portfolio Name"
              placeholderTextColor={COLORS.muted}
              value={newPortfolioName}
              onChangeText={setNewPortfolioName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount (USD)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newPortfolioAmount}
              onChangeText={setNewPortfolioAmount}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.error }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={handleEditPortfolio}
              >
                <Text style={styles.actionButtonText}>Save Changes</Text>
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
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  screenTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 15,
    margin: 15,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
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
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    width: '100%',
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
  },
});

export default PortfolioRebalancingScreen;
