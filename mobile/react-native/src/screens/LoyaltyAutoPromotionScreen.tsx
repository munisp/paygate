import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is available at this path

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface LoyaltyAutoPromotion {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'pending';
  discountAmount: number;
  currency: 'NGN' | 'USD';
  startDate: string;
  endDate: string;
}

const LoyaltyAutoPromotionScreen = () => {
  const navigation = useNavigation();
  const { data: promotions, isLoading, isError, refetch } = trpc.loyalty.autoPromotion.list.useQuery();
  const createMutation = trpc.loyalty.autoPromotion.create.useMutation();
  const updateMutation = trpc.loyalty.autoPromotion.update.useMutation();
  const deleteMutation = trpc.loyalty.autoPromotion.delete.useMutation();

  const [refreshing, setRefreshing] = useState(false);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentPromotion, setCurrentPromotion] = useState<LoyaltyAutoPromotion | null>(null);
  const [promotionName, setPromotionName] = useState('');
  const [promotionDescription, setPromotionDescription] = useState('');
  const [promotionDiscount, setPromotionDiscount] = useState('');
  const [promotionCurrency, setPromotionCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [promotionStartDate, setPromotionStartDate] = useState('');
  const [promotionEndDate, setPromotionEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const filteredPromotions = useMemo(() => {
    if (!promotions) return [];
    return promotions.filter(promo =>
      promo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      promo.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      promo.status.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [promotions, searchQuery]);

  const handleCreatePromotion = async () => {
    try {
      await createMutation.mutateAsync({
        name: promotionName,
        description: promotionDescription,
        discountAmount: parseFloat(promotionDiscount),
        currency: promotionCurrency,
        startDate: promotionStartDate,
        endDate: promotionEndDate,
      });
      refetch();
      setCreateModalVisible(false);
      resetForm();
    } catch (error) {
      Alert.alert('Error', 'Failed to create promotion.');
    }
  };

  const handleEditPromotion = async () => {
    if (!currentPromotion) return;
    try {
      await updateMutation.mutateAsync({
        id: currentPromotion.id,
        name: promotionName,
        description: promotionDescription,
        discountAmount: parseFloat(promotionDiscount),
        currency: promotionCurrency,
        startDate: promotionStartDate,
        endDate: promotionEndDate,
      });
      refetch();
      setEditModalVisible(false);
      resetForm();
    } catch (error) {
      Alert.alert('Error', 'Failed to update promotion.');
    }
  };

  const handleDeletePromotion = (id: string) => {
    Alert.alert(
      'Delete Promotion',
      'Are you sure you want to delete this promotion?',
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
              Alert.alert('Error', 'Failed to delete promotion.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (promotion: LoyaltyAutoPromotion) => {
    setCurrentPromotion(promotion);
    setPromotionName(promotion.name);
    setPromotionDescription(promotion.description);
    setPromotionDiscount(promotion.discountAmount.toString());
    setPromotionCurrency(promotion.currency);
    setPromotionStartDate(promotion.startDate);
    setPromotionEndDate(promotion.endDate);
    setEditModalVisible(true);
  };

  const resetForm = () => {
    setPromotionName('');
    setPromotionDescription('');
    setPromotionDiscount('');
    setPromotionCurrency('NGN');
    setPromotionStartDate('');
    setPromotionEndDate('');
    setCurrentPromotion(null);
  };

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const renderItem = ({ item }: { item: LoyaltyAutoPromotion }) => (
    <View style={styles.promotionCard}>
      <Text style={styles.promotionName}>{item.name}</Text>
      <Text style={styles.promotionDescription}>{item.description}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Status:</Text>
        <Text style={[styles.statusBadge, styles[item.status]]}>{item.status.toUpperCase()}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Discount:</Text>
        <Text style={styles.value}>{formatCurrency(item.discountAmount, item.currency)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Period:</Text>
        <Text style={styles.value}>{new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()}</Text>
      </View>
      <View style={styles.actionsContainer}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, styles.editButton]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePromotion(item.id)} style={[styles.actionButton, styles.deleteButton]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading promotions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load promotions.</Text>
          <TouchableOpacity onPress={refetch} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Tap to Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!promotions || promotions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No loyalty auto promotions found.</Text>
          <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
            <Text style={styles.createButtonText}>Create New Promotion</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Loyalty Auto Promotions</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.headerCreateButton}>
          <Text style={styles.headerCreateButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search promotions..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={filteredPromotions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      {/* Create Promotion Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Promotion</Text>
            <TextInput
              style={styles.input}
              placeholder="Promotion Name"
              placeholderTextColor={COLORS.muted}
              value={promotionName}
              onChangeText={setPromotionName}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={promotionDescription}
              onChangeText={setPromotionDescription}
            />
            <TextInput
              style={styles.input}
              placeholder="Discount Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={promotionDiscount}
              onChangeText={setPromotionDiscount}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={promotionCurrency}
              onChangeText={(text) => setPromotionCurrency(text as 'NGN' | 'USD')}
            />
            <TextInput
              style={styles.input}
              placeholder="Start Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={promotionStartDate}
              onChangeText={setPromotionStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="End Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={promotionEndDate}
              onChangeText={setPromotionEndDate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => { setCreateModalVisible(false); resetForm(); }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleCreatePromotion}
              >
                <Text style={styles.buttonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Promotion Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Promotion</Text>
            <TextInput
              style={styles.input}
              placeholder="Promotion Name"
              placeholderTextColor={COLORS.muted}
              value={promotionName}
              onChangeText={setPromotionName}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={promotionDescription}
              onChangeText={setPromotionDescription}
            />
            <TextInput
              style={styles.input}
              placeholder="Discount Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={promotionDiscount}
              onChangeText={setPromotionDiscount}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={promotionCurrency}
              onChangeText={(text) => setPromotionCurrency(text as 'NGN' | 'USD')}
            />
            <TextInput
              style={styles.input}
              placeholder="Start Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={promotionStartDate}
              onChangeText={setPromotionStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="End Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={promotionEndDate}
              onChangeText={setPromotionEndDate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => { setEditModalVisible(false); resetForm(); }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleEditPromotion}
              >
                <Text style={styles.buttonText}>Save</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerCreateButton: {
    backgroundColor: COLORS.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCreateButtonText: {
    color: COLORS.text,
    fontSize: 20,
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    marginBottom: 10,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginBottom: 10,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  promotionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  promotionName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  promotionDescription: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  label: {
    color: COLORS.muted,
    marginRight: 5,
  },
  value: {
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontWeight: 'bold',
    fontSize: 12,
  },
  active: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  inactive: {
    backgroundColor: COLORS.error,
    color: COLORS.background,
  },
  pending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
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
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
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
    width: '90%',
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
    backgroundColor: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    borderRadius: 5,
    padding: 10,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.muted,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 5,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
});

export default LoyaltyAutoPromotionScreen;