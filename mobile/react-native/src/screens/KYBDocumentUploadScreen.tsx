import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, SafeAreaView, StatusBar, Alert } from 'react-native';
import { trpc } from '../lib/trpc';
const C = { primary: '#6366F1', bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', muted: '#94A3B8', success: '#10B981', error: '#EF4444', border: '#334155', warning: '#F59E0B' };
const DOC_TYPES = ['CAC Certificate', 'Memorandum of Association', 'Director ID', 'Utility Bill', 'Bank Statement', 'Tax Clearance'];
export default function KYBDocumentUploadScreen() {
  const utils = trpc.useUtils();
  const [uploading, setUploading] = useState<string | null>(null);
  const { data: kybData, isLoading } = trpc.kyb.getStatus.useQuery();
  const submitMutation = trpc.kyb.submitDocument.useMutation({
    onSuccess: () => { utils.kyb.getStatus.invalidate(); Alert.alert('Success', 'Document submitted for review'); },
    onError: (err: any) => Alert.alert('Error', err.message),
    onSettled: () => setUploading(null),
  });
  const handleUpload = (docType: string) => {
    setUploading(docType);
    submitMutation.mutate({ documentType: docType, documentUrl: `https://placeholder.docs/${docType.replace(/\s/g, '_').toLowerCase()}.pdf`, notes: 'Uploaded via mobile app' });
  };
  const docs = (kybData as any)?.documents ?? [];
  if (isLoading) return <View style={[s.container, s.center]}><ActivityIndicator color={C.primary} size="large" /></View>;
  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>KYB Documents</Text>
        <Text style={s.subtitle}>Upload required business verification documents</Text>
        <View style={s.statusCard}>
          <Text style={s.statusLabel}>Verification Status</Text>
          <Text style={[s.statusValue, { color: (kybData as any)?.status === 'approved' ? C.success : C.warning }]}>
            {(kybData as any)?.status ?? 'Pending'}
          </Text>
        </View>
        {DOC_TYPES.map(docType => {
          const existing = docs.find((d: any) => d.documentType === docType);
          return (
            <View key={docType} style={s.card}>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.docType}>{docType}</Text>
                  {existing && <Text style={s.docStatus}>{existing.status}</Text>}
                </View>
                <TouchableOpacity
                  style={[s.btn, existing ? s.btnSecondary : s.btnPrimary]}
                  onPress={() => handleUpload(docType)}
                  disabled={uploading === docType || existing?.status === 'approved'}
                >
                  {uploading === docType ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>{existing ? 'Re-upload' : 'Upload'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg }, center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 }, title: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.muted, marginBottom: 20 },
  statusCard: { backgroundColor: '#1E1B4B', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.primary },
  statusLabel: { fontSize: 12, color: C.muted }, statusValue: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docType: { fontSize: 14, fontWeight: '600', color: C.text }, docStatus: { fontSize: 11, color: C.muted, marginTop: 2 },
  btn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  btnPrimary: { backgroundColor: C.primary }, btnSecondary: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
