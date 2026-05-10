
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';

const DOC_TYPES = [
  { type: 'cac_certificate', label: 'CAC Certificate', required: true, status: 'verified' },
  { type: 'memorandum', label: 'Memorandum & Articles', required: true, status: 'pending' },
  { type: 'directors_id', label: "Directors' ID", required: true, status: 'uploaded' },
  { type: 'proof_of_address', label: 'Proof of Address', required: true, status: null },
  { type: 'bank_statement', label: 'Bank Statement', required: true, status: null },
];

const STATUS_COLORS: Record<string, string> = { verified: '#22c55e', pending: '#f97316', uploaded: '#3b82f6' };

export default function KYBDocumentUploadScreen() {
  const verified = DOC_TYPES.filter(d => d.status === 'verified').length;
  const required = DOC_TYPES.filter(d => d.required).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>KYB Document Upload</Text>
      <View style={styles.progressCard}>
        <Text style={styles.progressLabel}>Progress: {verified}/{required} verified</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: \`\${(verified / required) * 100}%\` as any }]} />
        </View>
      </View>
      <FlatList
        data={DOC_TYPES}
        keyExtractor={item => item.type}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.docLabel}>{item.label}</Text>
              <Text style={styles.docMeta}>{item.required ? 'Required' : 'Optional'}</Text>
            </View>
            {item.status ? (
              <Text style={[styles.status, { color: STATUS_COLORS[item.status] ?? '#64748b' }]}>
                {item.status.toUpperCase()}
              </Text>
            ) : (
              <TouchableOpacity style={styles.uploadBtn} onPress={() => Alert.alert('Upload', 'File picker coming soon')}>
                <Text style={styles.uploadBtnText}>Upload</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  progressCard: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 16, marginBottom: 16 },
  progressLabel: { fontSize: 13, color: '#1e40af', marginBottom: 8 },
  progressBar: { height: 8, backgroundColor: '#bfdbfe', borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: '#3b82f6', borderRadius: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  docLabel: { fontSize: 14, fontWeight: '600' },
  docMeta: { fontSize: 12, color: '#64748b' },
  status: { fontSize: 11, fontWeight: '700' },
  uploadBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  uploadBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
