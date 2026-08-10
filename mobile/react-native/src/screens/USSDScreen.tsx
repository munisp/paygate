import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { useTrpc } from '../hooks/useTrpc';

const colors = {
  primary: '#6366f1',
  background: '#0f172a',
  card: '#1e293b',
  text: 'white',
  subtext: '#94a3b8',
};

const UssdScreen = () => {
  const { query } = useTrpc();
  const { data, isLoading, isError, error, refetch } = query.ussdSessions.list.useQuery();

  const handleRefresh = () => {
    refetch();
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Session ID: {item.id}</Text>
      <Text style={styles.cardText}>Status: {item.status}</Text>
      <Text style={styles.cardSubtext}>Last Update: {new Date(item.updatedAt).toLocaleString()}</Text>
      {/* Add more session details as needed */}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading USSD sessions...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load USSD sessions: {error?.message}</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.emptyText}>No active USSD sessions found.</Text>
        <Text style={styles.emptySubtext}>Pull down to refresh or initiate a new session.</Text>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />}
      />
      {/* Placeholder for 'Send USSD Command' functionality */}
      <View style={styles.commandSection}>
        <Text style={styles.commandTitle}>Send USSD Command</Text>
        <Text style={styles.commandSubtext}>Feature to send USSD commands will be implemented here.</Text>
        {/* Example: Input field and button for sending commands */}
        {/* <TextInput style={styles.input} placeholder="Enter USSD code" placeholderTextColor={colors.subtext} /> */}
        {/* <TouchableOpacity style={styles.sendButton}> */}
        {/*   <Text style={styles.sendButtonText}>Send</Text> */}
        {/* </TouchableOpacity> */}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 16,
  },
  listContent: {
    paddingBottom: 20,
  },
  loadingText: {
    marginTop: 10,
    color: colors.text,
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    color: colors.text,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    color: colors.subtext,
    fontSize: 14,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardText: {
    color: colors.text,
    fontSize: 16,
    marginBottom: 2,
  },
  cardSubtext: {
    color: colors.subtext,
    fontSize: 14,
  },
  commandSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 8,
  },
  commandTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  commandSubtext: {
    color: colors.subtext,
    fontSize: 14,
  },
  // input: {
  //   backgroundColor: colors.background,
  //   color: colors.text,
  //   borderRadius: 5,
  //   padding: 10,
  //   marginTop: 10,
  //   marginBottom: 10,
  //   borderWidth: 1,
  //   borderColor: colors.subtext,
  // },
  // sendButton: {
  //   backgroundColor: colors.primary,
  //   paddingVertical: 12,
  //   borderRadius: 5,
  //   alignItems: 'center',
  // },
  // sendButtonText: {
  //   color: colors.text,
  //   fontSize: 16,
  //   fontWeight: 'bold',
  // },
});

export default UssdScreen;
