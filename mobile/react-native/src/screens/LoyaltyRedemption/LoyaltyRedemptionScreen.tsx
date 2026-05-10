
import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput } from 'react-native';

const REWARDS = [
  { id: '1', name: 'Free Transfer', points: 500, category: 'banking' },
  { id: '2', name: '\u20a61,000 Airtime', points: 1000, category: 'telecom' },
  { id: '3', name: 'Premium Subscription', points: 5000, category: 'subscription' },
  { id: '4', name: 'Cash Bonus \u20a6500', points: 2500, category: 'cash' },
];

export default function LoyaltyRedemptionScreen() {
  const [balance] = useState(12500);
  const [selectedReward, setSelectedReward] = useState<any>(null);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  const handleRedeem = (reward: any) => {
    if (balance < reward.points) {
      Alert.alert('Insufficient Points', \`You need \${reward.points - balance} more points\`);
      return;
    }
    setSelectedReward(reward);
    setShowPin(true);
  };

  const confirmRedemption = () => {
    if (pin.length !== 4) { Alert.alert('Invalid PIN', 'Enter your 4-digit PIN'); return; }
    setShowPin(false);
    setPin('');
    Alert.alert('Success', \`\${selectedReward.name} redeemed! Kafka event published.\`);
    setSelectedReward(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.tierLabel}>Gold Member</Text>
        <Text style={styles.balanceText}>{balance.toLocaleString()} pts</Text>
        <Text style={styles.balanceSubLabel}>Available balance</Text>
      </View>
      <FlatList
        data={REWARDS}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardName}>{item.name}</Text>
              <Text style={styles.rewardMeta}>{item.points.toLocaleString()} pts • {item.category}</Text>
            </View>
            <TouchableOpacity
              style={[styles.redeemBtn, balance < item.points && styles.disabledBtn]}
              onPress={() => handleRedeem(item)}
              disabled={balance < item.points}
            >
              <Text style={styles.redeemBtnText}>Redeem</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <Modal visible={showPin} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter PIN</Text>
            <Text style={styles.modalSubtitle}>Confirm: {selectedReward?.name}</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              placeholder="••••"
              textAlign="center"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setShowPin(false); setPin(''); }} style={styles.cancelBtn}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmRedemption} style={styles.confirmBtn}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  balanceCard: { backgroundColor: '#d97706', borderRadius: 16, padding: 20, marginBottom: 20 },
  tierLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  balanceText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  balanceSubLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  rewardName: { fontSize: 14, fontWeight: '600' },
  rewardMeta: { fontSize: 12, color: '#64748b' },
  redeemBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  disabledBtn: { backgroundColor: '#cbd5e1' },
  redeemBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  pinInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 24, letterSpacing: 8, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  confirmBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#3b82f6', alignItems: 'center' },
});
