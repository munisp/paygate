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

// Dummy data types for API documentation
interface ApiDoc {
  id: string;
  name: string;
  version: string;
  status: 'Active' | 'Deprecated' | 'Beta';
  description: string;
  endpoint: string;
  lastUpdated: Date;
  price?: number; // Example for amount formatting
  currency?: 'NGN' | 'USD'; // Example for amount formatting
}

const APIDocsPortalScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<ApiDoc | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // tRPC query for listing API documentation
  // Assuming a tRPC router named `apiDocs` with a procedure `list`
  const { data, isLoading, isError, refetch, isRefetching } = trpc.apiDocs.list.useQuery();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(doc =>
    doc.name.toLowerCase().includes(searchText.toLowerCase()) ||
    doc.description.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    if (currency === 'NGN') {
      return `₦${amount.toFixed(2)}`;
    } else if (currency === 'USD') {
      return `$${amount.toFixed(2)}`;
    }
    return amount.toFixed(2);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const renderStatusBadge = (status: ApiDoc['status']) => {
    let backgroundColor;
    let textColor = COLORS.text;
    switch (status) {
      case 'Active':
        backgroundColor = COLORS.success;
        break;
      case 'Deprecated':
        backgroundColor = COLORS.error;
        break;
      case 'Beta':
        backgroundColor = COLORS.warning;
        break;
      default:
        backgroundColor = COLORS.muted;
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor }]}>
        <Text style={[styles.statusBadgeText, { color: textColor }]}>{status}</Text>
      </View>
    );
  };

  const handleViewDetails = (doc: ApiDoc) => {
    setSelectedDoc(doc);
    setModalVisible(true);
  };

  // Placeholder for delete functionality (if applicable, e.g., managing own custom API docs)
  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this API documentation entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
            // trpc.apiDocs.delete.useMutation().mutate({ id }); // Example mutation call
            console.log(`Deleting doc with ID: ${id}`);
            // After successful deletion, refetch data or update local state
          }
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading API Documentation...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load API Documentation.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!filteredData || filteredData.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No API documentation found.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>API Documentation Portal</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search API Docs..."
          placeholderTextColor={COLORS.muted}
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.name} v{item.version}</Text>
              {renderStatusBadge(item.status)}
            </View>
            <Text style={styles.cardDescription}>{item.description}</Text>
            <Text style={styles.cardDetail}>Endpoint: {item.endpoint}</Text>
            <Text style={styles.cardDetail}>Last Updated: {formatDate(item.lastUpdated)}</Text>
            {item.price !== undefined && item.currency && (
              <Text style={styles.cardDetail}>Price: {formatCurrency(item.price, item.currency)}</Text>
            )}
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleViewDetails(item)}>
                <Text style={styles.actionButtonText}>View Details</Text>
              </TouchableOpacity>
              {/* Example for an "Edit" button, if applicable */}
              {/* <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.warning }]} onPress={() => console.log('Edit', item.id)}>
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity> */}
              {/* Example for a "Delete" button, if applicable */}
              {/* <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDelete(item.id)}>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity> */}
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContentContainer}
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

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{selectedDoc?.name} v{selectedDoc?.version}</Text>
            <Text style={styles.modalText}>Description: {selectedDoc?.description}</Text>
            <Text style={styles.modalText}>Endpoint: {selectedDoc?.endpoint}</Text>
            <Text style={styles.modalText}>Status: {selectedDoc?.status}</Text>
            {selectedDoc?.lastUpdated && <Text style={styles.modalText}>Last Updated: {formatDate(selectedDoc.lastUpdated)}</Text>}
            {selectedDoc?.price !== undefined && selectedDoc?.currency && (
              <Text style={styles.modalText}>Price: {formatCurrency(selectedDoc.price, selectedDoc.currency)}</Text>
            )}
            <TouchableOpacity
              style={[styles.button, styles.buttonClose]}
              onPress={() => setModalVisible(!modalVisible)}
            >
              <Text style={styles.textStyle}>Close</Text>
            </TouchableOpacity>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
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
    fontWeight: 'bold',
  },
  header: {
    padding: 15,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContentContainer: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginTop: 15,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flexShrink: 1,
    marginRight: 10,
  },
  cardDescription: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 5,
  },
  cardDetail: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Dim background
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
  modalText: {
    marginBottom: 10,
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 15,
  },
  button: {
    borderRadius: 10,
    padding: 10,
    elevation: 2,
    marginTop: 20,
  },
  buttonClose: {
    backgroundColor: COLORS.primary,
  },
  textStyle: {
    color: COLORS.text,
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
});

export default APIDocsPortalScreen;
