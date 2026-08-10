import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useTrpc } from '../hooks/useTrpc';

interface BNPLPlan {
  planId: string;
  name: string;
  installments: number;
  interestRate: number;
  monthlyPayment: number;
  totalRepayment: number;
}

export default function BNPLCalculatorScreen() {
  const { trpc } = useTrpc();
  const [amount, setAmount] = useState('');
  const [plans, setPlans] = useState<BNPLPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const calculatePlans = async () => {
    if (!amount || isNaN(Number(amount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    setIsLoading(true);
    try {
      const res = await trpc.bnpl.calculatePlans.query({ amount: Number(amount) });
      setPlans(res.plans || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to calculate BNPL plans');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async (planId: string) => {
    try {
      await trpc.bnpl.applyForPlan.mutate({ planId, amount: Number(amount) });
      Alert.alert('Success', 'BNPL application submitted successfully');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to apply for BNPL plan');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>BNPL Calculator</Text>
        <Text style={styles.subtitle}>Buy Now, Pay Later — calculate your installments</Text>
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.label}>Purchase Amount (₦)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="Enter amount"
          placeholderTextColor="#64748B"
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.calcButton} onPress={calculatePlans} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.calcButtonText}>Calculate Plans</Text>
          )}
        </TouchableOpacity>
      </View>

      {plans.length > 0 && (
        <View style={styles.plansSection}>
          <Text style={styles.sectionTitle}>Available Plans</Text>
          {plans.map((plan) => (
            <TouchableOpacity
              key={plan.planId}
              style={[styles.planCard, selectedPlan === plan.planId && styles.planCardSelected]}
              onPress={() => setSelectedPlan(plan.planId)}
            >
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planInstallments}>{plan.installments} installments</Text>
              </View>
              <View style={styles.planDetails}>
                <View style={styles.planDetail}>
                  <Text style={styles.planDetailLabel}>Monthly</Text>
                  <Text style={styles.planDetailValue}>₦{plan.monthlyPayment.toLocaleString()}</Text>
                </View>
                <View style={styles.planDetail}>
                  <Text style={styles.planDetailLabel}>Interest</Text>
                  <Text style={styles.planDetailValue}>{plan.interestRate}%</Text>
                </View>
                <View style={styles.planDetail}>
                  <Text style={styles.planDetailLabel}>Total</Text>
                  <Text style={styles.planDetailValue}>₦{plan.totalRepayment.toLocaleString()}</Text>
                </View>
              </View>
              {selectedPlan === plan.planId && (
                <TouchableOpacity style={styles.applyButton} onPress={() => handleApply(plan.planId)}>
                  <Text style={styles.applyButtonText}>Apply for This Plan</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#F1F5F9' },
  subtitle: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  inputSection: { padding: 20, backgroundColor: '#1E293B', margin: 16, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  label: { fontSize: 14, color: '#94A3B8', marginBottom: 8 },
  input: { backgroundColor: '#0F172A', borderRadius: 10, padding: 14, color: '#F1F5F9', fontSize: 16, borderWidth: 1, borderColor: '#334155', marginBottom: 16 },
  calcButton: { backgroundColor: '#3B82F6', borderRadius: 10, padding: 14, alignItems: 'center' },
  calcButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  plansSection: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#F1F5F9', marginBottom: 16 },
  planCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  planCardSelected: { borderColor: '#3B82F6' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  planName: { fontSize: 16, fontWeight: 'bold', color: '#F1F5F9' },
  planInstallments: { fontSize: 14, color: '#3B82F6' },
  planDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  planDetail: { alignItems: 'center' },
  planDetailLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  planDetailValue: { fontSize: 14, fontWeight: '600', color: '#F1F5F9' },
  applyButton: { backgroundColor: '#3B82F6', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 16 },
  applyButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
