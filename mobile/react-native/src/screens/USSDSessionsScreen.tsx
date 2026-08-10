
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { trpc } from '../lib/trpc'; // Assuming this path is correct

// Define the navigation prop type (placeholder, adjust as needed for actual app)
type RootStackParamList = {
  USSDSessions: undefined;
  // Add other screens here if needed for navigation
};
type USSDSessionsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'USSDSessions'>;

interface USSDSessionsScreenProps {
  navigation: USSDSessionsScreenNavigationProp;
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

// Mock data type for USSD Session, adjust based on actual tRPC response
interface USSDSession {
  id: string;
  phoneNumber: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

const USSDSessionsScreen: React.FC<USSDSessionsScreenProps> = ({ navigation }) => {
  const [searchText, setSearchText] = useState('');

  // tRPC query to fetch USSD sessions
  const { data, isLoading, isError, error, refetch } = trpc.ussdSessions.list.useQuery();

  // tRPC mutation for deleting a USSD session
  const deleteMutation = trpc.ussdSessions.delete.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'USSD Session deleted successfully.');
      refetch(); // Refetch data after successful deletion
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to delete USSD Session: ${err.message}`);
    },
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDelete = (sessionId: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this USSD session?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id: sessionId }) },
      ],
      { cancelable: true }
    );
  };

  const handleCreateNew = () => {
    Alert.alert('Create New', 'Navigate to create USSD session screen/modal.');
    // navigation.navigate('CreateUSSDSession'); // Example navigation
  };

  const handleEdit = (session: USSDSession) => {
    Alert.alert('Edit Session', `Navigate to edit screen for session ID: ${session.id}`);
    // navigation.navigate('EditUSSDSession', { sessionId: session.id }); // Example navigation
  };

  const filteredData = data?.filter(session =>
    session.phoneNumber.toLowerCase().includes(searchText.toLowerCase()) ||
    session.status.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderItem = ({ item }: { item: USSDSession }) => {
    const statusColor = item.status === 'COMPLETED' ? COLORS.success :
                        item.status === 'PENDING' ? COLORS.warning :
                        COLORS.error;

    const formattedAmount = item.currency === 'NGN' ? `₦${item.amount.toFixed(2)}` : `$${item.amount.toFixed(2)}`;
    const formattedDate = new Date(item.createdAt).toLocaleDateString();
    const formattedTime = new Date(item.createdAt).toLocaleTimeString();

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.phoneNumberText}>{item.phoneNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.cardText}>Amount: {formattedAmount}</Text>
        <Text style={styles.cardText}>Date: {formattedDate} {formattedTime}</Text>
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => handleEdit(item)}>
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDelete(item.id)}>
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading USSD Sessions...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch USSD sessions'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>USSD Sessions</Text>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateNew}>
          <Text style={styles.createButtonText}>+ Create New</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by phone number or status..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredData && filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No USSD sessions found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}
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
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 15,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
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
    margin: 15,
    paddingHorizontal: 15,
    color: COLORS.text,
    fontSize: 16,
  },
  listContentContainer: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  phoneNumberText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.background,
    fontWeight: 'bold',
    fontSize: 12,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 5,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
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
});

export default USSDSessionsScreen;
