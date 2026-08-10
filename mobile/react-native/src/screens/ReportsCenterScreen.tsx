import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Button,
} from 'react-native';
import { trpc } from '../lib/trpc'; // Assuming this path

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Type definitions for reports
interface Report {
  id: string;
  name: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'completed' | 'failed';
  createdAt: string; // ISO date string
  updatedAt: string;
}

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'NGN' ? 'NGN' : 'USD',
    minimumFractionDigits: 2,
  });
  return formatter.format(amount);
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

const ReportsCenterScreen = () => {
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentReport, setCurrentReport] = useState<Report | null>(null);
  const [newReportName, setNewReportName] = useState('');
  const [newReportAmount, setNewReportAmount] = useState('');
  const [newReportCurrency, setNewReportCurrency] = useState<'NGN' | 'USD'>('NGN');

  // tRPC queries and mutations
  const { data: reports, isLoading, isError, refetch } = trpc.reports.list.useQuery();
  const createReportMutation = trpc.reports.create.useMutation();
  const updateReportMutation = trpc.reports.update.useMutation();
  const deleteReportMutation = trpc.reports.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredReports = reports?.filter(report =>
    report.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateReport = async () => {
    if (!newReportName || !newReportAmount) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await createReportMutation.mutateAsync({
        name: newReportName,
        amount: parseFloat(newReportAmount),
        currency: newReportCurrency,
      });
      setCreateModalVisible(false);
      setNewReportName('');
      setNewReportAmount('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create report.');
      console.error(error);
    }
  };

  const handleEditReport = async () => {
    if (!currentReport || !newReportName || !newReportAmount) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await updateReportMutation.mutateAsync({
        id: currentReport.id,
        name: newReportName,
        amount: parseFloat(newReportAmount),
        currency: newReportCurrency,
      });
      setEditModalVisible(false);
      setCurrentReport(null);
      setNewReportName('');
      setNewReportAmount('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update report.');
      console.error(error);
    }
  };

  const handleDeleteReport = (id: string) => {
    Alert.alert(
      'Delete Report',
      'Are you sure you want to delete this report?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReportMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete report.');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  const openEditModal = (report: Report) => {
    setCurrentReport(report);
    setNewReportName(report.name);
    setNewReportAmount(report.amount.toString());
    setNewReportCurrency(report.currency);
    setEditModalVisible(true);
  };

  const renderReportItem = ({ item }: { item: Report }) => (
    <View style={styles.reportItem}>
      <View style={styles.reportDetails}>
        <Text style={styles.reportName}>{item.name}</Text>
        <Text style={styles.reportAmount}>{formatCurrency(item.amount, item.currency)}</Text>
        <View style={[styles.statusBadge, styles[`status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`]]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
        <Text style={styles.reportDate}>Created: {formatDate(item.createdAt)}</Text>
      </View>
      <View style={styles.reportActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteReport(item.id)} style={[styles.actionButton, styles.deleteButton]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading reports...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load reports. Please try again.</Text>
        <Button title="Retry" onPress={refetch} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.header}>Reports Center</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search reports..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
        <Text style={styles.createButtonText}>Create New Report</Text>
      </TouchableOpacity>

      {filteredReports && filteredReports.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No reports found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredReports}
          keyExtractor={(item) => item.id}
          renderItem={renderReportItem}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Report Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Report</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Report Name"
              placeholderTextColor={COLORS.muted}
              value={newReportName}
              onChangeText={setNewReportName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newReportAmount}
              onChangeText={setNewReportAmount}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newReportCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewReportCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newReportCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewReportCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreateReport} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Report Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Report</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Report Name"
              placeholderTextColor={COLORS.muted}
              value={newReportName}
              onChangeText={setNewReportName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newReportAmount}
              onChangeText={setNewReportAmount}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newReportCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewReportCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newReportCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewReportCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save Changes" onPress={handleEditReport} color={COLORS.primary} />
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
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 20,
    paddingBottom: 10,
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    color: COLORS.text,
    paddingHorizontal: 15,
    marginHorizontal: 20,
    marginBottom: 15,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  reportItem: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportDetails: {
    flex: 1,
  },
  reportName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  reportAmount: {
    fontSize: 16,
    color: COLORS.text,
    marginTop: 5,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginTop: 5,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusCompleted: {
    backgroundColor: COLORS.success,
  },
  statusFailed: {
    backgroundColor: COLORS.error,
  },
  reportDate: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 5,
  },
  reportActions: {
    flexDirection: 'row',
    marginLeft: 10,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
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
    width: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    color: COLORS.text,
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  currencyToggle: {
    flexDirection: 'row',
    marginBottom: 20,
    width: '100%',
    justifyContent: 'space-around',
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: COLORS.muted,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
});

export default ReportsCenterScreen;