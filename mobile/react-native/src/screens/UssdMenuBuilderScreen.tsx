import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TextInput, TouchableOpacity, Alert, Modal, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is available at this path
import { Picker } from '@react-native-picker/picker'; // For status selection
import { format } from 'date-fns'; // For date formatting

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface UssdMenuItem {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

const UssdMenuBuilderScreen = () => {
  const navigation = useNavigation();

  const { data: ussdMenus, isLoading, isError, refetch } = trpc.ussd.list.useQuery();
  const createMutation = trpc.ussd.create.useMutation();
  const updateMutation = trpc.ussd.update.useMutation();
  const deleteMutation = trpc.ussd.delete.useMutation();

  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [currentMenuItem, setCurrentMenuItem] = useState<UssdMenuItem | null>(null);
  const [menuName, setMenuName] = useState('');
  const [menuCode, setMenuCode] = useState('');
  const [menuStatus, setMenuStatus] = useState<'active' | 'inactive'>('active');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filteredUssdMenus = useMemo(() => {
    if (!ussdMenus) return [];
    return ussdMenus.filter(menu =>
      menu.name.toLowerCase().includes(searchText.toLowerCase()) ||
      menu.code.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [ussdMenus, searchText]);

  const handleCreatePress = () => {
    setCurrentMenuItem(null);
    setMenuName('');
    setMenuCode('');
    setMenuStatus('active');
    setModalVisible(true);
  };

  const handleEditPress = (item: UssdMenuItem) => {
    setCurrentMenuItem(item);
    setMenuName(item.name);
    setMenuCode(item.code);
    setMenuStatus(item.status);
    setModalVisible(true);
  };

  const handleDeletePress = (id: string) => {
    Alert.alert(
      'Delete Menu',
      'Are you sure you want to delete this USSD menu?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              console.error('Failed to delete menu:', error);
              Alert.alert('Error', 'Failed to delete USSD menu.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleSaveMenu = async () => {
    try {
      if (currentMenuItem) {
        // Update existing menu
        await updateMutation.mutateAsync({
          id: currentMenuItem.id,
          name: menuName,
          code: menuCode,
          status: menuStatus,
        });
      } else {
        // Create new menu
        await createMutation.mutateAsync({
          name: menuName,
          code: menuCode,
          status: menuStatus,
        });
      }
      setModalVisible(false);
      refetch();
    } catch (error) {
      console.error('Failed to save menu:', error);
      Alert.alert('Error', 'Failed to save USSD menu.');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading USSD Menus...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load USSD menus.</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: UssdMenuItem }) => (
    <View style={styles.menuItem}>
      <View>
        <Text style={styles.menuItemName}>{item.name}</Text>
        <Text style={styles.menuItemCode}>{item.code}</Text>
        <View style={styles.statusBadgeContainer}>
          <Text style={[styles.statusBadge, item.status === 'active' ? styles.statusActive : styles.statusInactive]}>
            {item.status.toUpperCase()}
          </Text>
          <Text style={styles.dateText}>Created: {format(new Date(item.createdAt), 'MMM dd, yyyy HH:mm')}</Text>
          <Text style={styles.dateText}>Updated: {format(new Date(item.updatedAt), 'MMM dd, yyyy HH:mm')}</Text>
        </View>
      </View>
      <View style={styles.menuItemActions}>
        <TouchableOpacity onPress={() => handleEditPress(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePress(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error, marginLeft: 10 }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>USSD Menu Builder</Text>
        <TouchableOpacity style={styles.createButtonHeader} onPress={handleCreatePress}>
            <Text style={styles.createButtonText}>Create New</Text>
          </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search menus..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredUssdMenus.length === 0 && !isLoading && !isError ? (
        <View style={styles.content}>
          <Text style={styles.emptyText}>No USSD menus found.</Text>
          <TouchableOpacity style={styles.createButton} onPress={handleCreatePress}>
            <Text style={styles.createButtonText}>Create New Menu</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredUssdMenus}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{currentMenuItem ? 'Edit USSD Menu' : 'Create USSD Menu'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Menu Name"
              placeholderTextColor={COLORS.muted}
              value={menuName}
              onChangeText={setMenuName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Menu Code"
              placeholderTextColor={COLORS.muted}
              value={menuCode}
              onChangeText={setMenuCode}
            />
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={menuStatus}
                onValueChange={(itemValue) => setMenuStatus(itemValue)}
                style={styles.picker}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="Active" value="active" />
                <Picker.Item label="Inactive" value="inactive" />
              </Picker>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalButton, { backgroundColor: COLORS.muted }]}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveMenu} style={[styles.modalButton, { backgroundColor: COLORS.primary, marginLeft: 10 }]}>
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
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
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  createButtonHeader: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    margin: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  menuItem: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuItemName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  menuItemCode: {
    color: COLORS.muted,
    fontSize: 14,
    marginTop: 5,
  },
  statusBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    marginRight: 10,
  },
  statusActive: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusInactive: {
    backgroundColor: COLORS.error,
    color: COLORS.background,
  },
  dateText: {
    color: COLORS.muted,
    fontSize: 12,
    marginLeft: 10,
  },
  menuItemActions: {
    flexDirection: 'row',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    height: 45,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  pickerContainer: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: COLORS.card,
  },
  picker: {
    color: COLORS.text,
    height: 45,
    width: '100%',
  },
  pickerItem: {
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  modalButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default UssdMenuBuilderScreen;
