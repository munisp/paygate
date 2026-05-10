import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export default function SupportChatScreen() {
  const [message, setMessage] = useState('');
  const sessions = [
    { id: '1', subject: 'Payment issue', status: 'open', priority: 'high' },
    { id: '2', subject: 'API integration', status: 'resolved', priority: 'medium' },
  ];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Support Chat</Text>
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.subject}>{item.subject}</Text>
            <Text style={[styles.badge, item.status === 'open' ? styles.open : styles.resolved]}>
              {item.status}
            </Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={message} onChangeText={setMessage} placeholder="Type a message..." />
        <TouchableOpacity style={styles.sendBtn} onPress={() => setMessage('')}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  card: { padding: 12, borderRadius: 8, backgroundColor: '#f5f5f5', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  subject: { fontSize: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 12, overflow: 'hidden' },
  open: { backgroundColor: '#fef3c7', color: '#92400e' },
  resolved: { backgroundColor: '#d1fae5', color: '#065f46' },
  inputRow: { flexDirection: 'row', marginTop: 16, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12 },
  sendBtn: { backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  sendText: { color: '#fff', fontWeight: '600' },
});
