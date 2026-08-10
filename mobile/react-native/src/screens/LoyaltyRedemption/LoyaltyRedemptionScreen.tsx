import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { useTrpc } from '../../hooks/useTrpc';

export default function LoyaltyRedemptionScreen() {
  const { query, mutation } = useTrpc();
  const [rewards, setRewards] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReward, setSelectedReward] = useState<any>(null);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [rewardsResult, balanceResult] = await Promise.all([
        query.loyalty.getRewards.query({ limit: 20 }),
        query.loyalty.getBalance.query(),
      ]);
      setRewards(rewardsResult?.rewards ?? rewardsResult ?? []);
      setBalance(balanceResult?.balance ?? balanceResult?.points ?? 0);
    } catch (error) {
      console.error('Failed to fetch loyalty data:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const handleRedeem = (reward: any) => {
    if (balance < (reward.pointsCost ?? reward.points ?? 0)) {
      Alert.alert('Insufficient Points', 'You do not have enough points for this reward');
      return;
    }
    setSelectedReward(reward);
    setShowPin(true);
  };

  const confirmRedeem = async () => {
    if (!selectedReward) return;
    try {
      await mutation.loyalty.redeemReward.mutate({ rewardId: selectedReward.id, pin });
      Alert.alert('Success', 'Reward redeemed successfully!');
      setShowPin(false);
      setPin('');
      fetchData();
    } catch (error) {
      Alert.alert('Error', 'Failed to redeem reward');
    }
  };

  if (isLoading) return <View style={styles.container}><ActivityIndicator color="#6366f1" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Your Points</Text>
        <Text style={styles.balanceValue}>{balance.toLocaleString()}</Text>
      </View>
      <FlatList
        data={rewards}
        keyExtractor={item => item.id ?? String(Math.random())}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleRedeem(item)}>
            <Text style={styles.rewardName}>{item.name}</Text>
            <Text style={styles.points}>{(item.pointsCost ?? item.points ?? 0).toLocaleString()} pts</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No rewards available</Text>}
      />
      <Modal visible={showPin} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Enter PIN to confirm</Text>
            <TextInput style={styles.input} value={pin} onChangeText={setPin} secureTextEntry keyboardType="numeric" maxLength={4} placeholder="4-digit PIN" placeholderTextColor="#64748b" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowPin(false); setPin(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirmRedeem}>
                <Text style={styles.confirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  balanceCard: { backgroundColor: '#6366f1', borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center' },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  balanceValue: { color: 'white', fontSize: 36, fontWeight: 'bold' },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rewardName: { color: 'white', fontSize: 15, fontWeight: '600', flex: 1 },
  points: { color: '#6366f1', fontSize: 14, fontWeight: '700' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, width: '80%' },
  modalTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  input: { backgroundColor: '#0f172a', borderRadius: 8, padding: 12, color: 'white', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: '#334155', borderRadius: 8, padding: 12, alignItems: 'center' },
  cancelText: { color: 'white', fontWeight: '600' },
  confirmBtn: { flex: 1, backgroundColor: '#6366f1', borderRadius: 8, padding: 12, alignItems: 'center' },
  confirmText: { color: 'white', fontWeight: '600' },
});
