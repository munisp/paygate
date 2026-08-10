import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, Button, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface ComplianceReport {
  id: string;
  reportName: string;
  status: 'pending' | 'approved' | 'rejected';
  amount: number;
  currency: 'NGN' | 'USD';
  submissionDate: string;
  description?: string;
}

interface CreateReportInput {
  reportName: string;
  description?: string;
  amount: number;
  currency: 'NGN' | 'USD';
}

interface UpdateReportInput {
  id: string;
  reportName?: string;
  description?: string;
  amount?: number;
  currency?: 'NGN' | 'USD';
  status?: 'pending' | 'approved' | 'rejected';
}

const ComplianceReportsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentReport, setCurrentReport] = useState<ComplianceReport | null>(null);

  const [newReportName, setNewReportName] = useState('');
  const [newReportDescription, setNewReportDescription] = useState('');
  const [newReportAmount, setNewReportAmount] = useState('');
  const [newReportCurrency, setNewReportCurrency] = useState<'NGN' | 'USD'>('NGN');

  useEffect(() => {
    if (isEditModalVisible && currentReport) {
      setEditReportName(currentReport.reportName);
      setEditReportDescription(currentReport.description || '');
      setEditReportAmount(currentReport.amount.toString());
      setEditReportCurrency(currentReport.currency);
      setEditReportStatus(currentReport.status);
    }
  }, [isEditModalVisible, currentReport]);

  // Placeholder for tRPC queries and mutations
    const { data: reportsData, isLoading, error, refetch } = trpc.compliance.listReports.useQuery();
    const createMutation = trpc.compliance.createReport.useMutation();
    const updateMutation = trpc.compliance.updateReport.useMutation();
    const deleteMutation = trpc.compliance.deleteReport.useMutation();

  const reports = reportsData || [];

  const filteredReports = reports.filter(report =>
    report.reportName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  const handleCreate = () => {
    if (!newReportName || !newReportAmount) {
      Alert.alert('Error', 'Report Name and Amount are required.');
      return;
    }
    createMutation.mutate(
      {
        reportName: newReportName,
        description: newReportDescription,
        amount: parseFloat(newReportAmount),
        currency: newReportCurrency,
      },
      {
        onSuccess: () => {
          refetch();
          setCreateModalVisible(false);
          setNewReportName('');
          setNewReportDescription('');
          setNewReportAmount('');
          setNewReportCurrency('NGN');
        },
        onError: (err) => {
          Alert.alert('Error creating report', err.message);
        },
      }
    );
  };

  const handleEdit = () => {
    if (!currentReport) return;
    updateMutation.mutate(
      {
        id: currentReport.id,
        reportName: editReportName,
        description: editReportDescription,
        amount: parseFloat(editReportAmount),
        currency: editReportCurrency,
        status: editReportStatus,
      },
      {
        onSuccess: () => {
          refetch();
          setEditModalVisible(false);
          setCurrentReport(null);
        },
        onError: (err) => {
          Alert.alert('Error updating report', err.message);
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Report',
      'Are you sure you want to delete this report?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          deleteMutation.mutate({ id }, {
            onSuccess: () => refetch(),
            onError: (err) => Alert.alert('Error deleting report', err.message),
          });
        }},
      ]
    );
  };

  const renderReportItem = ({ item }: { item: ComplianceReport }) => (
    <View style={styles.reportItem}>
      <View>
        <Text style={styles.reportName}>{item.reportName}</Text>
        {item.description && <Text style={styles.reportDescription}>{item.description}</Text>}
        <Text style={styles.reportDate}>Submitted: {new Date(item.submissionDate).toLocaleDateString()}</Text>
        <Text style={styles.reportAmount}>Amount: {item.currency === 'NGN' ? '₦' : '$'}{item.amount.toLocaleString()}</Text>
      </View>
      <View style={styles.statusContainer}>
        <Text style={[styles.statusBadge, item.status === 'approved' && styles.statusApproved, item.status === 'pending' && styles.statusPending, item.status === 'rejected' && styles.statusRejected]}>
          {item.status.toUpperCase()}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => { setCurrentReport(item); setEditModalVisible(true); }}>
            <Text style={styles.actionButton}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item.id)}>
            <Text style={[styles.actionButton, { color: COLORS.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Compliance Reports</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Create Report</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search reports..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {isLoading && <ActivityIndicator size="large" color={COLORS.primary} style={styles.loading} />}
      {error && <Text style={styles.errorText}>Failed to load reports.</Text>}
      {!isLoading && !error && filteredReports.length === 0 && <Text style={styles.emptyText}>No compliance reports found.</Text>}

      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item.id}
        renderItem={renderReportItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

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
              placeholderTextColor={COLORS.muted}
              placeholder="Report Name"
              value={newReportName}
              onChangeText={setNewReportName}
            />
            <TextInput
              style={styles.modalInput}
              placeholderTextColor={COLORS.muted}
              placeholder="Description (Optional)"
              value={newReportDescription}
              onChangeText={setNewReportDescription}
            />
            <TextInput
              style={styles.modalInput}
              placeholderTextColor={COLORS.muted}
              placeholder="Amount"
              keyboardType="numeric"
              value={newReportAmount}
              onChangeText={setNewReportAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, newReportCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewReportCurrency('NGN')}
              >
                <Text style={[styles.currencyButtonText, newReportCurrency === 'NGN' && styles.currencyButtonTextActive]}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newReportCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewReportCurrency('USD')}
              >
                <Text style={[styles.currencyButtonText, newReportCurrency === 'USD' && styles.currencyButtonTextActive]}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={handleCreate} color={COLORS.primary} />
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
              placeholderTextColor={COLORS.muted}
              placeholder="Report Name"
              value={editReportName}
              onChangeText={setEditReportName}
            />
            <TextInput
              style={styles.modalInput}
              placeholderTextColor={COLORS.muted}
              placeholder="Description (Optional)"
              value={editReportDescription}
              onChangeText={setEditReportDescription}
            />
            <TextInput
              style={styles.modalInput}
              placeholderTextColor={COLORS.muted}
              placeholder="Amount"
              keyboardType="numeric"
              value={editReportAmount}
              onChangeText={setEditReportAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, editReportCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setEditReportCurrency('NGN')}
              >
                <Text style={[styles.currencyButtonText, editReportCurrency === 'NGN' && styles.currencyButtonTextActive]}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, editReportCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setEditReportCurrency('USD')}
              >
                <Text style={[styles.currencyButtonText, editReportCurrency === 'USD' && styles.currencyButtonTextActive]}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.statusSelector}>
              <TouchableOpacity
                style={[styles.statusOption, editReportStatus === 'pending' && styles.statusPending]}
                onPress={() => setEditReportStatus('pending')}
              >
                <Text style={[styles.statusOptionText, editReportStatus === 'pending' && { color: COLORS.background }]}>PENDING</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusOption, editReportStatus === 'approved' && styles.statusApproved]}
                onPress={() => setEditReportStatus('approved')}
              >
                <Text style={[styles.statusOptionText, editReportStatus === 'approved' && { color: COLORS.background }]}>APPROVED</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusOption, editReportStatus === 'rejected' && styles.statusRejected]}
                onPress={() => setEditReportStatus('rejected')}
              >
                <Text style={[styles.statusOptionText, editReportStatus === 'rejected' && { color: COLORS.background }]}>REJECTED</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button title="Save" onPress={handleEdit} color={COLORS.primary} />
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
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
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
  },
  loading: {
    marginTop: 20,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  reportItem: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  reportDate: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 4,
  },
  reportAmount: {
    fontSize: 16,
    color: COLORS.text,
    marginTop: 4,
  },
  reportDescription: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 2,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    overflow: 'hidden',
    color: COLORS.background,
  },
  statusApproved: {
    backgroundColor: COLORS.success,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusRejected: {
    backgroundColor: COLORS.error,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  actionButton: {
    color: COLORS.primary,
    marginLeft: 15,
    fontSize: 14,
    fontWeight: 'bold',
  },
  currencySelector: {
    flexDirection: 'row',
    marginBottom: 15,
    width: '100%',
    justifyContent: 'center',
  },
  currencyButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 5,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  currencyButtonTextActive: {
    color: COLORS.background,
  },
  statusSelector: {
    flexDirection: 'row',
    marginBottom: 15,
    width: '100%',
    justifyContent: 'center',
  },
  statusOption: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 5,
  },
  statusOptionText: {
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
    width: '100%',
    height: 40,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 15,
    color: COLORS.text,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
});

export default ComplianceReportsScreen;
