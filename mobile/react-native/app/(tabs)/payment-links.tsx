import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator, Alert, Share } from 'react-native';
import { Link } from 'expo-router';
import { trpc } from '@/lib/trpc';
import Clipboard from '@react-native-clipboard/clipboard';

// Define types for PaymentLink and CreatePaymentLinkInput
interface PaymentLink {
  id: string;
  amount: number;
  description: string;
  url: string;
  createdAt: string;
}

interface CreatePaymentLinkInput {
  amount: number;
  description: string;
}

// Define theme colors
const COLORS = {
  background: '#0f172a',
  card: '#1e293b',
  accent: '#6366f1',
  text: '#f8fafc',
  muted: '#94a3b8',
};

export default function PaymentLinksScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [newLinkAmount, setNewLinkAmount] = useState('');
  const [newLinkDescription, setNewLinkDescription] = useState('');
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  const { data: paymentLinks, isLoading: isPaymentLinksLoading, isError: isPaymentLinksError, error: paymentLinksError, refetch: refetchPaymentLinks } = trpc.paymentLinks.list.useQuery();
  const createPaymentLinkMutation = trpc.paymentLinks.create.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Payment link created successfully!');
      setNewLinkAmount('');
      setNewLinkDescription('');
      setIsCreatingLink(false);
      refetchPaymentLinks();
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to create payment link: ${error.message}`);
      setIsCreatingLink(false);
    },
  });

  const deletePaymentLinkMutation = trpc.paymentLinks.delete.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Payment link deleted successfully!');
      refetchPaymentLinks();
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete payment link: ${error.message}`);
    },
  });

  const handleCreateLink = () => {
    if (!newLinkAmount || !newLinkDescription) {
      Alert.alert('Validation Error', 'Amount and description are required.');
      return;
    }
    const amount = parseFloat(newLinkAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid positive amount.');
      return;
    }

    setIsCreatingLink(true);
    createPaymentLinkMutation.mutate({ amount, description: newLinkDescription });
  };

  const handleDeleteLink = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this payment link?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', onPress: () => deletePaymentLinkMutation.mutate({ id }), style: 'destructive' },
      ]
    );
  };

  const handleCopyLink = (url: string) => {
    Clipboard.setString(url);
    Alert.alert('Copied!', 'Payment link URL copied to clipboard.');
  };

  const handleShareLink = async (url: string, description: string) => {
    try {
      await Share.share({
        message: `Here's a payment link for ${description}: ${url}`,
        url: url,
        title: 'Share Payment Link',
      });
    } catch (error: any) {
      Alert.alert('Share Error', error.message);
    }
  };

  const filteredPaymentLinks = paymentLinks?.filter(link =>
    link.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.amount.toString().includes(searchQuery)
  );

  const renderPaymentLinkItem = ({ item }: { item: PaymentLink }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>₦{item.amount.toLocaleString()}</Text>
      <Text style={styles.cardDescription}>{item.description}</Text>
      <Text style={styles.cardUrl}>{item.url}</Text>
      <Text style={styles.cardDate}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.button, styles.copyButton]} onPress={() => handleCopyLink(item.url)}>
          <Text style={styles.buttonText}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.shareButton]} onPress={() => handleShareLink(item.url, item.description)}>
          <Text style={styles.buttonText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={() => handleDeleteLink(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.header}>Payment Links</Text>

      {/* Create New Payment Link Form */}
      <View style={styles.formContainer}>
        <Text style={styles.formTitle}>Create New Payment Link</Text>
        <TextInput
          style={styles.input}
          placeholder="Amount (e.g., 5000)"
          placeholderTextColor={COLORS.muted}
          keyboardType="numeric"
          value={newLinkAmount}
          onChangeText={setNewLinkAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Description (e.g., 'Invoice for services')"
          placeholderTextColor={COLORS.muted}
          value={newLinkDescription}
          onChangeText={setNewLinkDescription}
        />
        <TouchableOpacity
          style={styles.createButton}
          onPress={handleCreateLink}
          disabled={isCreatingLink || createPaymentLinkMutation.isLoading}
        >
          {isCreatingLink || createPaymentLinkMutation.isLoading ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <Text style={styles.buttonText}>Create Link</Text>
          )}
        </TouchableOpacity>
        {createPaymentLinkMutation.isError && (
          <Text style={styles.errorText}>Error: {createPaymentLinkMutation.error?.message}</Text>
        )}
      </View>

      {/* Search/Filter Input */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search payment links by description or amount..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {/* Loading, Error, Empty, or Data Display */}
      {isPaymentLinksLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Fetching your payment links, please wait...</Text>
        </View>
      ) : isPaymentLinksError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load payment links: {paymentLinksError?.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetchPaymentLinks()}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (filteredPaymentLinks?.length === 0) ? (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>No payment links found. Time to create your first link and get paid!</Text>
          <Text style={styles.emptyStateSubText}>Perhaps you're looking for a payment link for that 'Aso-ebi' contribution or 'Owambe' savings?</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPaymentLinks}
          renderItem={renderPaymentLinkItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContentContainer}
          scrollEnabled={false} // Disable FlatList's own scrolling inside ScrollView
        />
      )}

      {(deletePaymentLinkMutation.isLoading || deletePaymentLinkMutation.isError) && (
        <View style={styles.overlayLoadingContainer}>
          {deletePaymentLinkMutation.isLoading && <ActivityIndicator size="large" color={COLORS.accent} />}
          {deletePaymentLinkMutation.isError && <Text style={styles.errorText}>Error deleting: {deletePaymentLinkMutation.error?.message}</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 24,
    textAlign: 'center',
  },
  formContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  input: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 16,
  },
  createButton: {
    backgroundColor: COLORS.accent,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    fontSize: 16,
  },
  listContentContainer: {
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 16,
    color: COLORS.muted,
    marginBottom: 8,
  },
  cardUrl: {
    fontSize: 14,
    color: COLORS.accent,
    marginBottom: 12,
  },
  cardDate: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  copyButton: {
    backgroundColor: COLORS.muted,
  },
  shareButton: {
    backgroundColor: COLORS.accent,
  },
  deleteButton: {
    backgroundColor: 'red',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.accent,
    padding: 10,
    borderRadius: 8,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyStateSubText: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  overlayLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
