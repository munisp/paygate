import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, RefreshControl, Alert, TouchableOpacity, TextInput, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Define design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface WAFAlert {
  id: string;
  ruleName: string;
  ipAddress: string;
  createdAt: string; // Using createdAt for consistency with typical data models
  severity: 'low' | 'medium' | 'high';
  action: 'block' | 'log' | 'allow';
  requestPath: string;
}

const WAFAlertDashboardScreen = () => {
  const navigation = useNavigation();

  const { data: alerts, isLoading, isError, refetch } = trpc.waf.listAlerts.useQuery();
  const deleteAlertMutation = trpc.waf.deleteAlert.useMutation();
  const createAlertMutation = trpc.waf.createAlert.useMutation();
  const updateAlertMutation = trpc.waf.updateAlert.useMutation();

  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<WAFAlert | null>(null);
  const [newAlertInput, setNewAlertInput] = useState<Omit<WAFAlert, 'id' | 'createdAt'>>({
    ruleName: '',
    ipAddress: '',
    requestPath: '',
    severity: 'low',
    action: 'log',
  });

  const handleDeleteAlert = (id: string) => {
    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteAlertMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              console.error('Failed to delete alert:', error);
              Alert.alert('Error', 'Failed to delete alert.');
            }
          }
        },
      ],
      { cancelable: true }
    );
  };

  const handleCreateAlert = async () => {
    try {
      await createAlertMutation.mutateAsync(newAlertInput);
      refetch();
      setCreateModalVisible(false);
      setNewAlertInput({
        ruleName: '',
        ipAddress: '',
        requestPath: '',
        severity: 'low',
        action: 'log',
      }); // Reset form
      Alert.alert('Success', 'Alert created successfully!');
    } catch (error) {
      console.error('Failed to create alert:', error);
      Alert.alert('Error', 'Failed to create alert.');
    }
  };

  const handleEditAlert = (alert: WAFAlert) => {
    setSelectedAlert(alert);
    setEditModalVisible(true);
  };

  const handleUpdateAlert = async (updatedAlert: WAFAlert) => {
    try {
      await updateAlertMutation.mutateAsync(updatedAlert);
      refetch();
      setEditModalVisible(false);
      Alert.alert('Success', 'Alert updated successfully!');
    } catch (error) {
      console.error('Failed to update alert:', error);
      Alert.alert('Error', 'Failed to update alert.');
    }
  };

  const filteredAlerts = alerts?.filter(alert =>
    alert.ruleName.toLowerCase().includes(searchText.toLowerCase()) ||
    alert.ipAddress.toLowerCase().includes(searchText.toLowerCase()) ||
    alert.requestPath.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const renderItem = ({ item }: { item: WAFAlert }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.ruleName}</Text>
      <Text style={styles.cardText}>IP: {item.ipAddress}</Text>
      <Text style={styles.cardText}>Path: {item.requestPath}</Text>
      <Text style={styles.cardText}>Time: {new Date(item.createdAt).toLocaleString()}</Text>
      <View style={styles.badgeContainer}>
        <Text style={[styles.badge, styles[`severity${item.severity.charAt(0).toUpperCase() + item.severity.slice(1)}`]]}>{item.severity}</Text>
        <Text style={[styles.badge, styles[`action${item.action.charAt(0).toUpperCase() + item.action.slice(1)}`]]}>{item.action}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary }]} onPress={() => Alert.alert("View Details", "View details for " + item.ruleName)}>
          <Text style={styles.buttonText}>View Details</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary }]} onPress={() => handleEditAlert(item)}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.error }]} onPress={() => handleDeleteAlert(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.header}>WAF Alert Dashboard</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color={COLORS.primary} />
      ) : isError ? (
        <Text style={styles.errorText}>Failed to load WAF alerts.</Text>
      ) : filteredAlerts.length === 0 ? (
        <Text style={styles.emptyText}>No WAF alerts found.</Text>
      ) : (
        <>
          <TextInput
            style={styles.searchInput}
            placeholder="Search alerts..."
            placeholderTextColor={COLORS.muted}
            value={searchText}
            onChangeText={setSearchText}
          />
          <FlatList
            data={filteredAlerts}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={refetch}
                tintColor={COLORS.primary}
              />
            }
          />
        </>
      )}

      {/* Create Alert Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Alert</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Rule Name"
              placeholderTextColor={COLORS.muted}
              value={newAlertInput.ruleName}
              onChangeText={(text) => setNewAlertInput(prev => ({ ...prev, ruleName: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="IP Address"
              placeholderTextColor={COLORS.muted}
              value={newAlertInput.ipAddress}
              onChangeText={(text) => setNewAlertInput(prev => ({ ...prev, ipAddress: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Request Path"
              placeholderTextColor={COLORS.muted}
              value={newAlertInput.requestPath}
              onChangeText={(text) => setNewAlertInput(prev => ({ ...prev, requestPath: text }))}
            />
            {/* Simplified severity and action for example */}
            <TouchableOpacity style={[styles.button, styles.buttonClose]} onPress={handleCreateAlert}>
              <Text style={styles.textStyle}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.buttonClose]} onPress={() => setCreateModalVisible(false)}>
              <Text style={styles.textStyle}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Alert Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Alert: {selectedAlert?.ruleName}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Rule Name"
              placeholderTextColor={COLORS.muted}
              value={selectedAlert?.ruleName}
              onChangeText={(text) => setSelectedAlert(prev => ({ ...prev!, ruleName: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="IP Address"
              placeholderTextColor={COLORS.muted}
              value={selectedAlert?.ipAddress}
              onChangeText={(text) => setSelectedAlert(prev => ({ ...prev!, ipAddress: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Request Path"
              placeholderTextColor={COLORS.muted}
              value={selectedAlert?.requestPath}
              onChangeText={(text) => setSelectedAlert(prev => ({ ...prev!, requestPath: text }))}
            />
            {/* Simplified severity and action for example */}
            <TouchableOpacity style={[styles.button, styles.buttonClose]} onPress={() => selectedAlert && handleUpdateAlert(selectedAlert)}>
              <Text style={styles.textStyle}>Update</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.buttonClose]} onPress={() => setEditModalVisible(false)}>
              <Text style={styles.textStyle}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add a button to open the create modal */}
      <TouchableOpacity style={styles.fab} onPress={() => {
        setCreateModalVisible(true);
        setNewAlertInput({
          ruleName: '',
          ipAddress: '',
          requestPath: '',
          severity: 'low',
          action: 'log',
        });
      }}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginHorizontal: 10,
    marginBottom: 10,
    color: COLORS.text,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%',
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  buttonClose: {
    backgroundColor: COLORS.primary,
    marginTop: 15,
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    elevation: 8,
  },
  fabText: {
    fontSize: 24,
    color: 'white',
  },
  modalInput: {
    width: '100%',
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: StatusBar.currentHeight,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginVertical: 20,
  },
  loadingText: {
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 20,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 3,
  },
  badgeContainer: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 10,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginRight: 10,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  severityLow: {
    backgroundColor: COLORS.success,
  },
  severityMedium: {
    backgroundColor: COLORS.warning,
  },
  severityHigh: {
    backgroundColor: COLORS.error,
  },
  actionBlock: {
    backgroundColor: COLORS.error,
  },
  actionLog: {
    backgroundColor: COLORS.muted,
  },
  actionAllow: {
    backgroundColor: COLORS.success,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default WAFAlertDashboardScreen;
