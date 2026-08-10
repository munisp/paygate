import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

const OllamaChatScreen = () => {
  const navigation = useNavigation();

  // Placeholder for tRPC queries and mutations
  const { data: chatMessagesData, isLoading, isError, refetch } = trpc.ollamaChat.list.useQuery();
    const sendMessageMutation = trpc.ollamaChat.send.useMutation({
    onSuccess: () => {
      refetch(); // Invalidate and refetch chat messages after sending a new one
    },
  });
    const editMessageMutation = trpc.ollamaChat.edit.useMutation({
    onSuccess: () => {
      refetch();
    },
  });
    const deleteMessageMutation = trpc.ollamaChat.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const [messageInput, setMessageInput] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const chatMessages = chatMessagesData?.messages || [];



  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => setIsRefreshing(false));

  }, []);

  const handleLongPressMessage = (message: any) => {
    Alert.alert(
      'Message Options',
      'What would you like to do with this message?',
      [
        {
          text: 'Edit',
          onPress: () => {
            Alert.prompt(
              'Edit Message',
              'Enter new message content:',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Save',
                  onPress: (newContent) => {
                    if (newContent && newContent.trim() !== '') {
                      editMessageMutation.mutate({ id: message.id, content: newContent });
                    }
                  },
                },
              ],
              'plain-text',
              message.content
            );
          },
        },
        {
          text: 'Delete',
          onPress: () => {
            Alert.alert(
              'Confirm Delete',
              'Are you sure you want to delete this message?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteMessageMutation.mutate({ id: message.id }) },
              ]
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderMessage = ({ item }: { item: any }) => (
    <TouchableOpacity onLongPress={() => handleLongPressMessage(item)} disabled={item.sender === 'ollama'}>
      <View style={[styles.messageBubble, item.sender === 'user' ? styles.userMessage : styles.ollamaMessage]}>
      <Text style={styles.messageSender}>{item.sender === 'user' ? 'You' : 'Ollama'}</Text>
      <Text style={styles.messageContent}>{item.content}</Text>
      <Text style={styles.messageTimestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
    </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ollama Chat</Text>
      </View>

      {isLoading && <ActivityIndicator size="large" color={COLORS.primary} style={styles.loadingIndicator} />}
      {isError && <Text style={styles.errorText}>Failed to load messages.</Text>}
      {(!isLoading && !isError && chatMessages.length === 0) && <Text style={styles.emptyText}>No messages yet. Start a conversation!</Text>}


      <FlatList
        data={chatMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Type your message..."
          placeholderTextColor={COLORS.muted}
          value={messageInput}
          onChangeText={setMessageInput}
        />
        <TouchableOpacity
          style={styles.sendButton}
          onPress={() => {
            if (messageInput.trim()) {
              sendMessageMutation.mutate({ content: messageInput });
              setMessageInput('');
            }
          }}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
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
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  loadingIndicator: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    padding: 20,
  },
  messageList: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primary,
  },
  ollamaMessage: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.card,
  },
  messageSender: {
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  messageContent: {
    color: COLORS.text,
  },
  messageTimestamp: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 5,
    textAlign: 'right',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    paddingHorizontal: 15,
    color: COLORS.text,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default OllamaChatScreen;
