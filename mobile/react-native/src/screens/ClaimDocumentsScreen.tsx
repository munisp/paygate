import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, TextInput, Modal, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path is correct

// Design system colors
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

// Dummy data types for demonstration
interface ClaimDocument {
  id: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  amount: number;
  currency: 'Naira' | 'USD';
  date: string;
}

const ClaimDocumentsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ClaimDocument | null>(null);
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [newDocumentAmount, setNewDocumentAmount] = useState('');
  const [newDocumentCurrency, setNewDocumentCurrency] = useState<'Naira' | 'USD'>('Naira');

  // tRPC queries and mutations
  const { data: documents, isLoading, isError, refetch, isRefetching } = trpc.claims.listDocuments.useQuery();
  const createMutation = trpc.claims.createDocument.useMutation();
  const updateMutation = trpc.claims.updateDocument.useMutation();
  const deleteMutation = trpc.claims.deleteDocument.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredDocuments = documents?.filter(doc =>
    doc.title.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const formatAmount = (amount: number, currency: 'Naira' | 'USD') => {
    if (currency === 'Naira') {
      return `₦${amount.toLocaleString('en-NG')}`;
    } else {
      return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const getStatusBadgeColor = (status: 'pending' | 'approved' | 'rejected') => {
    switch (status) {
      case 'approved': return COLORS.success;
      case 'pending': return COLORS.warning;
      case 'rejected': return COLORS.error;
      default: return COLORS.muted;
    }
  };

  const handleCreateOrUpdateDocument = async () => {
    if (!newDocumentTitle || !newDocumentAmount) {
      Alert.alert('Error', 'Title and Amount are required.');
      return;
    }
    const amount = parseFloat(newDocumentAmount);
    if (isNaN(amount)) {
      Alert.alert('Error', 'Invalid amount.');
      return;
    }

    try {
      if (editingDocument) {
        await updateMutation.mutateAsync({
          id: editingDocument.id,
          title: newDocumentTitle,
          amount,
          currency: newDocumentCurrency,
        });
      } else {
        await createMutation.mutateAsync({
          title: newDocumentTitle,
          amount,
          currency: newDocumentCurrency,
          status: 'pending', // Default status for new documents
          date: new Date().toISOString(),
        });
      }
      setModalVisible(false);
      setEditingDocument(null);
      setNewDocumentTitle('');
      setNewDocumentAmount('');
      setNewDocumentCurrency('Naira');
      refetch();
    } catch (error) {
      Alert.alert('Error', `Failed to save document: ${error.message}`);
    }
  };

  const handleDeleteDocument = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this document?',
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
              Alert.alert('Error', `Failed to delete document: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: ClaimDocument }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusBadgeColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Date: {formatDate(item.date)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]}          onPress={() => {
            setEditingDocument(item);
            setNewDocumentTitle(item.title);
            setNewDocumentAmount(item.amount.toString());
            setNewDocumentCurrency(item.currency);
            setModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error, marginLeft: 10 }]}          onPress={() => handleDeleteDocument(item.id)}
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
        <Text style={styles.loadingText}>Loading documents...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load documents.</Text>
        <Button title="Retry" onPress={refetch} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (filteredDocuments.length === 0 && !searchText) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No claim documents found.</Text>
        <Button title="Create New Document" onPress={() => setModalVisible(true)} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Claim Documents</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => {
          setEditingDocument(null);
          setNewDocumentTitle('');
          setNewDocumentAmount('');
          setNewDocumentCurrency('Naira');
          setModalVisible(true);
        }}>
          <Text style={styles.createButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search documents..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredDocuments}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingDocument ? 'Edit Document' : 'Create New Document'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Document Title"
              placeholderTextColor={COLORS.muted}
              value={newDocumentTitle}
              onChangeText={setNewDocumentTitle}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newDocumentAmount}
              onChangeText={setNewDocumentAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, newDocumentCurrency === 'Naira' && styles.currencyButtonActive]}
                onPress={() => setNewDocumentCurrency('Naira')}
              >
                <Text style={styles.currencyButtonText}>₦ Naira</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newDocumentCurrency === 'USD' && styles.currencyButtonActive, { marginLeft: 10 }]}}
                onPress={() => setNewDocumentCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>$ USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.error} />
              <View style={{ width: 10 }} />
              <Button title={editingDocument ? 'Update' : 'Create'} onPress={handleCreateOrUpdateDocument} color={COLORS.primary} />
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
    marginBottom: 20,
    fontSize: 16,
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
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 15,
    borderRadius: 8,
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
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 5,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 20,
    width: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
  },
  currencySelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  currencyButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});

export default ClaimDocumentsScreen;
