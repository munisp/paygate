import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button, Platform } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { trpc } from '../lib/trpc';
import DateTimePicker from '@react-native-community/datetimepicker';

type RootStackParamList = {
  CouponManagement: undefined;
};

type CouponManagementScreenProps = StackScreenProps<RootStackParamList, 'CouponManagement'>;

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface Coupon {
  id: string;
  code: string;
  discountAmount: number;
  currency: 'NGN' | 'USD';
  minOrderAmount: number;
  maxDiscountAmount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const CouponManagementScreen: React.FC<CouponManagementScreenProps> = () => {
  const { data: coupons, isLoading, isError, refetch } = trpc.coupons.list.useQuery();
  const createCouponMutation = trpc.coupons.create.useMutation();
  const updateCouponMutation = trpc.coupons.update.useMutation();
  const deleteCouponMutation = trpc.coupons.delete.useMutation();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentCoupon, setCurrentCoupon] = useState<Coupon | null>(null);

  const [newCouponCode, setNewCouponCode] = useState('');
  const [newDiscountAmount, setNewDiscountAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [newMinOrderAmount, setNewMinOrderAmount] = useState('');
  const [newMaxDiscountAmount, setNewMaxDiscountAmount] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newIsActive, setNewIsActive] = useState(true);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerField, setDatePickerField] = useState<'startDate' | 'endDate' | null>(null);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const filteredCoupons = coupons?.filter(coupon =>
    coupon.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    return currency === 'NGN' ? `₦${amount.toFixed(2)}` : `$${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const resetFormFields = () => {
    setNewCouponCode('');
    setNewDiscountAmount('');
    setNewCurrency('NGN');
    setNewMinOrderAmount('');
    setNewMaxDiscountAmount('');
    setNewStartDate('');
    setNewEndDate('');
    setNewIsActive(true);
  };

  const handleCreateCoupon = async () => {
    if (!newCouponCode || !newDiscountAmount || !newMinOrderAmount || !newMaxDiscountAmount || !newStartDate || !newEndDate) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await createCouponMutation.mutateAsync({
        code: newCouponCode,
        discountAmount: parseFloat(newDiscountAmount),
        currency: newCurrency,
        minOrderAmount: parseFloat(newMinOrderAmount),
        maxDiscountAmount: parseFloat(newMaxDiscountAmount),
        startDate: new Date(newStartDate).toISOString(),
        endDate: new Date(newEndDate).toISOString(),
        isActive: newIsActive,
      });
      setCreateModalVisible(false);
      refetch();
      resetFormFields();
    } catch (error) {
      Alert.alert('Error', 'Failed to create coupon.');
    }
  };

  const handleEditCoupon = async () => {
    if (!currentCoupon || !newCouponCode || !newDiscountAmount || !newMinOrderAmount || !newMaxDiscountAmount || !newStartDate || !newEndDate) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await updateCouponMutation.mutateAsync({
        id: currentCoupon.id,
        code: newCouponCode,
        discountAmount: parseFloat(newDiscountAmount),
        currency: newCurrency,
        minOrderAmount: parseFloat(newMinOrderAmount),
        maxDiscountAmount: parseFloat(newMaxDiscountAmount),
        startDate: new Date(newStartDate).toISOString(),
        endDate: new Date(newEndDate).toISOString(),
        isActive: newIsActive,
      });
      setEditModalVisible(false);
      refetch();
      resetFormFields();
    } catch (error) {
      Alert.alert('Error', 'Failed to update coupon.');
    }
  };

  const handleDeleteCoupon = (id: string) => {
    Alert.alert(
      'Delete Coupon',
      'Are you sure you want to delete this coupon?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCouponMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete coupon.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (coupon: Coupon) => {
    setCurrentCoupon(coupon);
    setNewCouponCode(coupon.code);
    setNewDiscountAmount(coupon.discountAmount.toString());
    setNewCurrency(coupon.currency);
    setNewMinOrderAmount(coupon.minOrderAmount.toString());
    setNewMaxDiscountAmount(coupon.maxDiscountAmount.toString());
    setNewStartDate(new Date(coupon.startDate).toISOString().split('T')[0]);
    setNewEndDate(new Date(coupon.endDate).toISOString().split('T')[0]);
    setNewIsActive(coupon.isActive);
    setEditModalVisible(true);
  };

  const onDateChange = (event: any, selectedDate: Date | undefined) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      const formattedDate = selectedDate.toISOString().split('T')[0];
      if (datePickerField === 'startDate') {
        setNewStartDate(formattedDate);
      } else if (datePickerField === 'endDate') {
        setNewEndDate(formattedDate);
      }
    }
  };

  const showDatepicker = (field: 'startDate' | 'endDate') => {
    setDatePickerField(field);
    setShowDatePicker(true);
  };

  const renderCouponItem = ({ item }: { item: Coupon }) => (
    <View style={styles.couponCard}>
      <Text style={styles.couponCode}>{item.code}</Text>
      <Text style={styles.couponDetail}>Discount: {formatCurrency(item.discountAmount, item.currency)}</Text>
      <Text style={styles.couponDetail}>Min Order: {formatCurrency(item.minOrderAmount, item.currency)}</Text>
      <Text style={styles.couponDetail}>Max Discount: {formatCurrency(item.maxDiscountAmount, item.currency)}</Text>
      <Text style={styles.couponDetail}>Valid: {formatDate(item.startDate)} - {formatDate(item.endDate)}</Text>
      <Text style={[styles.couponStatus, { color: item.isActive ? COLORS.success : COLORS.error }]}>
        {item.isActive ? 'Active' : 'Inactive'}
      </Text>
      <View style={styles.couponActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteCoupon(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading coupons...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load coupons.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.header}>Coupon Management</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search coupons..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <TouchableOpacity onPress={() => { setCreateModalVisible(true); resetFormFields(); }} style={styles.createButton}>
        <Text style={styles.buttonText}>Create New Coupon</Text>
      </TouchableOpacity>

      {filteredCoupons?.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No coupons found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCoupons}
          keyExtractor={(item) => item.id}
          renderItem={renderCouponItem}
          contentContainerStyle={styles.flatListContent}
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

      {/* Create Coupon Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Coupon</Text>
            <TextInput
              style={styles.input}
              placeholder="Coupon Code"
              placeholderTextColor={COLORS.muted}
              value={newCouponCode}
              onChangeText={setNewCouponCode}
            />
            <TextInput
              style={styles.input}
              placeholder="Discount Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newDiscountAmount}
              onChangeText={setNewDiscountAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={newCurrency}
              onChangeText={(text) => setNewCurrency(text as 'NGN' | 'USD')}
              maxLength={3}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder="Minimum Order Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newMinOrderAmount}
              onChangeText={setNewMinOrderAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Maximum Discount Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newMaxDiscountAmount}
              onChangeText={setNewMaxDiscountAmount}
            />
            <TouchableOpacity onPress={() => showDatepicker('startDate')} style={styles.dateInputButton}>
              <Text style={styles.dateInputText}>{newStartDate ? `Start Date: ${newStartDate}` : 'Select Start Date'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => showDatepicker('endDate')} style={styles.dateInputButton}>
              <Text style={styles.dateInputText}>{newEndDate ? `End Date: ${newEndDate}` : 'Select End Date'}</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                testID="dateTimePicker"
                value={new Date()}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}

            <View style={styles.checkboxContainer}>
              <Text style={styles.checkboxLabel}>Active:</Text>
              <TouchableOpacity onPress={() => setNewIsActive(!newIsActive)} style={styles.toggleButton}>
                <Text style={{ color: newIsActive ? COLORS.success : COLORS.error, fontWeight: 'bold' }}>
                  {newIsActive ? 'Yes' : 'No'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreateCoupon} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Coupon Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Coupon</Text>
            <TextInput
              style={styles.input}
              placeholder="Coupon Code"
              placeholderTextColor={COLORS.muted}
              value={newCouponCode}
              onChangeText={setNewCouponCode}
            />
            <TextInput
              style={styles.input}
              placeholder="Discount Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newDiscountAmount}
              onChangeText={setNewDiscountAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={newCurrency}
              onChangeText={(text) => setNewCurrency(text as 'NGN' | 'USD')}
              maxLength={3}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder="Minimum Order Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newMinOrderAmount}
              onChangeText={setNewMinOrderAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Maximum Discount Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newMaxDiscountAmount}
              onChangeText={setNewMaxDiscountAmount}
            />
            <TouchableOpacity onPress={() => showDatepicker('startDate')} style={styles.dateInputButton}>
              <Text style={styles.dateInputText}>{newStartDate ? `Start Date: ${newStartDate}` : 'Select Start Date'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => showDatepicker('endDate')} style={styles.dateInputButton}>
              <Text style={styles.dateInputText}>{newEndDate ? `End Date: ${newEndDate}` : 'Select End Date'}</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                testID="dateTimePicker"
                value={new Date()}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}

            <View style={styles.checkboxContainer}>
              <Text style={styles.checkboxLabel}>Active:</Text>
              <TouchableOpacity onPress={() => setNewIsActive(!newIsActive)} style={styles.toggleButton}>
                <Text style={{ color: newIsActive ? COLORS.success : COLORS.error, fontWeight: 'bold' }}>
                  {newIsActive ? 'Yes' : 'No'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save Changes" onPress={handleEditCoupon} color={COLORS.primary} />
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
    paddingTop: StatusBar.currentHeight,
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    marginBottom: 10,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 15,
    textAlign: 'center',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
  },
  flatListContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  couponCard: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  couponCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  couponDetail: {
    color: COLORS.muted,
    marginBottom: 3,
  },
  couponStatus: {
    fontWeight: 'bold',
    marginTop: 5,
  },
  couponActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 10,
    width: '90%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateInputButton: {
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
  },
  dateInputText: {
    color: COLORS.muted,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    justifyContent: 'space-between',
  },
  checkboxLabel: {
    color: COLORS.text,
    fontSize: 16,
  },
  toggleButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: COLORS.card,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
});

export default CouponManagementScreen;