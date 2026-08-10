import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, FlatList, StyleSheet, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';

type Webhook = {
  id: string;
  url: string;
  event: string;
  secret: string;
  isActive: boolean;
  createdAt: string;
};

const WebhooksScreen = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvent, setNewWebhookEvent] = useState('');

  const { data: webhooks, isLoading, isError, refetch } = trpc.webhooks.list.useQuery();
  const createWebhookMutation = trpc.webhooks.create.useMutation();
  const deleteWebhookMutation = trpc.webhooks.delete.useMutation();

  const handleCreateWebhook = async () => {
    if (!newWebhookUrl || !newWebhookEvent) {
      Alert.alert('Error', 'Webhook URL and Event are required.');
      return;
    }
    try {
      await createWebhookMutation.mutateAsync({ url: newWebhookUrl, event: newWebhookEvent });
      Alert.alert('Success', 'Webhook created successfully.');
      setNewWebhookUrl('');
      setNewWebhookEvent('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create webhook.');
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this webhook?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteWebhookMutation.mutateAsync({ id });
              Alert.alert('Success', 'Webhook deleted successfully.');
              refetch();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete webhook.');
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  };

  const filteredWebhooks = webhooks?.filter(
    (webhook) =>
      webhook.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      webhook.event.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading webhooks...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Failed to load webhooks. Please try again later.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Webhooks' }} />
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.heading}>Webhook Endpoints</Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Search webhooks by URL or event..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {filteredWebhooks && filteredWebhooks.length > 0 ? (
          <FlatList
            data={filteredWebhooks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.url}</Text>
                <Text style={styles.cardText}>Event: {item.event}</Text>
                <Text style={styles.cardText}>Status: {item.isActive ? 'Active' : 'Inactive'}</Text>
                <Text style={styles.cardText}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteWebhook(item.id)}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
            style={styles.flatList}
          />
        ) : (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateText}>No webhooks found. Time to set up some crucial notifications for your transactions, eh?</Text>
          </View>
        )}

        <Text style={styles.heading}>Create New Webhook</Text>
        <TextInput
          style={styles.input}
          placeholder="Webhook URL (e.g., https://your-app.com/webhook)"
          placeholderTextColor="#94a3b8"
          value={newWebhookUrl}
          onChangeText={setNewWebhookUrl}
        />
        <TextInput
          style={styles.input}
          placeholder="Event Type (e.g., payment.success)"
          placeholderTextColor="#94a3b8"
          value={newWebhookEvent}
          onChangeText={setNewWebhookEvent}
        />
        <TouchableOpacity
          style={styles.createButton}
          onPress={handleCreateWebhook}
          disabled={createWebhookMutation.isLoading}
        >
          <Text style={styles.createButtonText}>
            {createWebhookMutation.isLoading ? 'Creating...' : 'Create Webhook'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 20,
    marginTop: 20,
  },
  searchInput: {
    height: 40,
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: '#f8fafc',
    backgroundColor: '#1e293b',
    marginBottom: 20,
  },
  flatList: {
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 5,
  },
  cardText: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 3,
  },
  deleteButton: {
    backgroundColor: '#dc2626',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#f8fafc',
    fontWeight: 'bold',
  },
  input: {
    height: 50,
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    color: '#f8fafc',
    backgroundColor: '#1e293b',
    marginBottom: 15,
    fontSize: 16,
  },
  createButton: {
    backgroundColor: '#6366f1',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  createButtonText: {
    color: '#f8fafc',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingText: {
    color: '#f8fafc',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 50,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 50,
  },
  emptyStateContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyStateText: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default WebhooksScreen;
