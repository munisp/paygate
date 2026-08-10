import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface MutualFund {
  id: string;
  name: string;
  balance: number;
  currency: 'NGN' | 'USD';
  status: 'Active' | 'Inactive' | 'Pending';
  lastUpdated: string;
}

const MutualFundsScreen = () => {
  const navigation = useNavigation();

  // Placeholder for tRPC queries and mutations
  const { data, isLoading, isError, refetch } = trpc.mutualFunds.list.useQuery();
  const createMutation = trpc.mutualFunds.create.useMutation();
  const updateMutation = trpc.mutualFunds.update.useMutation();
  const deleteMutation = trpc.mutualFunds.delete.useMutation();

  const [isCreateModalVisible, setCreateModalVisible] = React.useState(false);
  const [isEditModalVisible, setEditModalVisible] = React.useState(false);
  const [currentFund, setCurrentFund] = React.useState<MutualFund | null>(null);
  const [newFundName, setNewFundName] = React.useState('');
  const [newFundBalance, setNewFundBalance] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredFunds = data?.filter(fund =>
    fund.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateFund = () => {
    // Implement create logic
    console.log('Create fund:', newFundName, newFundBalance);
    createMutation.mutate({
      name: newFundName,
      balance: parseFloat(newFundBalance),
      currency: 'NGN', // Default currency
      status: 'Pending', // Default status
    }, {
      onSuccess: () => {
        refetch();
        setCreateModalVisible(false);
        setNewFundName('');
        setNewFundBalance('');
      },
      onError: (error) => {
        Alert.alert('Error', 'Failed to create mutual fund: ' + error.message);
      }
    });
  };

  const handleEditFund = () => {
    // Implement edit logic
    if (currentFund) {
      console.log('Edit fund:', currentFund.id, newFundName, newFundBalance);
      updateMutation.mutate({
        id: currentFund.id,
        name: newFundName,
        balance: parseFloat(newFundBalance),
      }, {
        onSuccess: () => {
          refetch();
          setEditModalVisible(false);
          setCurrentFund(null);
          setNewFundName('');
          setNewFundBalance('');
        },
        onError: (error) => {
          Alert.alert('Error', 'Failed to update mutual fund: ' + error.message);
        }
      });
    }
  };

  const handleDeleteFund = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this mutual fund?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate({ id }, {
              onSuccess: () => {
                refetch();
              },
              onError: (error) => {
                Alert.alert('Error', 'Failed to delete mutual fund: ' + error.message);
              }
            });
          },
        },
      ]
    );
  };

  const renderFundItem = ({ item }: { item: MutualFund }) => (
    <View style={styles.fundItem}>
      <View>
        <Text style={styles.fundName}>{item.name}</Text>
        <Text style={styles.fundBalance}>
          {item.currency === 'NGN' ? '₦' : '$'}{item.balance.toFixed(2)}
        </Text>
        <Text style={styles.fundStatus}>
          Status: <Text style={{ color: item.status === 'Active' ? COLORS.success : item.status === 'Pending' ? COLORS.warning : COLORS.error }}>{item.status}</Text>
        </Text>
        <Text style={styles.fundLastUpdated}>Last Updated: {new Date(item.lastUpdated).toLocaleDateString()}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => {
            setCurrentFund(item);
            setNewFundName(item.name);
            setNewFundBalance(item.balance.toString());
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error }]} 
          onPress={() => handleDeleteFund(item.id)}
        >
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Mutual Funds...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load mutual funds.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mutual Funds</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ Add Fund</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search funds..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {filteredFunds && filteredFunds.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No mutual funds found.</Text>
          <Button title="Refresh" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredFunds}
          keyExtractor={(item) => item.id}
          renderItem={renderFundItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
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
            <Text style={styles.modalTitle}>Create New Mutual Fund</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Fund Name"
              placeholderTextColor={COLORS.muted}
              value={newFundName}
              onChangeText={setNewFundName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Initial Balance"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newFundBalance}
              onChangeText={setNewFundBalance}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreateFund} color={COLORS.primary} />
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
            <Text style={styles.modalTitle}>Edit Mutual Fund</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Fund Name"
              placeholderTextColor={COLORS.muted}
              value={newFundName}
              onChangeText={setNewFundName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Balance"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newFundBalance}
              onChangeText={setNewFundBalance}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={handleEditFund} color={COLORS.primary} />
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
  headerTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 10,
    borderRadius: 5,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  fundItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fundName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  fundBalance: {
    color: COLORS.text,
    fontSize: 16,
    marginTop: 5,
  },
  fundStatus: {
    color: COLORS.muted,
    fontSize: 14,
    marginTop: 5,
  },
  fundLastUpdated: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 5,
  },
  actions: {
    flexDirection: 'row',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
    borderRadius: 10,
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
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 15,
  },
});

export default MutualFundsScreen;