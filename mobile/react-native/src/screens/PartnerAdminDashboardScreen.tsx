import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, Alert, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface Partner {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  revenue: number;
  currency: 'NGN' | 'USD';
}

const PartnerAdminDashboardScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerRevenue, setNewPartnerRevenue] = useState('');
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);

  const { data: partners, isLoading, isError, refetch } = trpc.partner.list.useQuery();
  const createPartnerMutation = trpc.partner.create.useMutation();
  const updatePartnerMutation = trpc.partner.update.useMutation();
  const deletePartnerMutation = trpc.partner.delete.useMutation();

  const handleCreatePartner = async () => {
    if (!newPartnerName.trim()) return;
    try {
      await createPartnerMutation.mutateAsync({ name: newPartnerName, revenue: parseFloat(newPartnerRevenue || '0'), currency: 'USD' });
      setNewPartnerName("");
      setNewPartnerRevenue("");
      setModalVisible(false);
      refetch();
    } catch (error) {
      Alert.alert("Error", "Failed to create partner.");
    }
  };

  const handleUpdatePartner = async () => {
    if (!editingPartner || !newPartnerName.trim()) return;
    try {
      await updatePartnerMutation.mutateAsync({ id: editingPartner.id, name: newPartnerName, revenue: parseFloat(newPartnerRevenue || '0'), currency: 'USD' });
      setNewPartnerName("");
      setNewPartnerRevenue("");
      setEditingPartner(null);
      setModalVisible(false);
      refetch();
    } catch (error) {
      Alert.alert("Error", "Failed to update partner.");
    }
  };

  const handleDeletePartner = (id: string) => {
    Alert.alert(
      "Delete Partner",
      "Are you sure you want to delete this partner?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePartnerMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert("Error", "Failed to delete partner.");
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.emptyStateContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.emptyStateText}>Loading partners...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorStateContainer}>
          <Text style={styles.errorStateText}>Failed to load partners.</Text>
          <TouchableOpacity onPress={refetch} style={styles.createButton}>
            <Text style={styles.createButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const filteredPartners = partners?.filter(partner =>
    partner.name.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const handleEditPress = (partner: Partner) => {
    setEditingPartner(partner);
    setNewPartnerName(partner.name);
    setNewPartnerRevenue(partner.revenue.toString());
    setModalVisible(true);
  };

  const renderPartnerItem = ({ item }: { item: Partner }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardText}>ID: {item.id}</Text>
      <Text style={styles.cardText}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <Text style={styles.cardText}>Revenue: {item.currency === 'NGN' ? '₦' : '$'}{item.revenue.toFixed(2)}</Text>
      <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : item.status === 'inactive' ? styles.badgeInactive : item.status === 'pending' ? styles.badgePending : null]}>
        <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => handleEditPress(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePartner(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Partner Admin Dashboard</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>Add Partner</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search partners..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredPartners.length === 0 && !isLoading && !isError ? (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>No partners found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPartners}
          renderItem={renderPartnerItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => {
          setModalVisible(false);
          setEditingPartner(null);
          setNewPartnerName('');
          setNewPartnerRevenue('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingPartner ? 'Edit Partner' : 'Add New Partner'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Partner Name"
              placeholderTextColor={COLORS.muted}
              value={newPartnerName}
              onChangeText={setNewPartnerName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Revenue"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newPartnerRevenue}
              onChangeText={setNewPartnerRevenue}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.muted} />
              <Button title={editingPartner ? 'Save Changes' : 'Create Partner'} onPress={editingPartner ? handleUpdatePartner : handleCreatePartner} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    margin: 16,
    padding: 12,
    borderRadius: 8,
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 4,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  badgeActive: {
    backgroundColor: COLORS.success,
  },
  badgeInactive: {
    backgroundColor: COLORS.error,
  },
  badgePending: {
    backgroundColor: COLORS.warning,
  },
  badgeText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 10,
    width: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    color: COLORS.muted,
    fontSize: 18,
    marginTop: 10,
  },
  errorStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorStateText: {
    color: COLORS.error,
    fontSize: 18,
    marginTop: 10,
  },
});

export default PartnerAdminDashboardScreen;
