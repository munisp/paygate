import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design System Colors
const colors = {
  primary: '#6366F1',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  muted: '#94A3B8',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  border: '#334155',
};

// Types
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalSpent: number;
  riskLevel: RiskLevel;
  createdAt: string;
  lastTransaction?: string;
}

const RiskBadge = ({ level }: { level: RiskLevel }) => {
  const getBadgeStyles = () => {
    switch (level) {
      case 'LOW':
        return { bg: '#10B98120', text: colors.success };
      case 'MEDIUM':
        return { bg: '#F59E0B20', text: colors.warning };
      case 'HIGH':
        return { bg: '#EF444420', text: colors.error };
      default:
        return { bg: colors.border, text: colors.muted };
    }
  };

  const styles = getBadgeStyles();

  return (
    <View style={[viewStyles.badge, { backgroundColor: styles.bg }]}>
      <Text style={[viewStyles.badgeText, { color: styles.text }]}>{level}</Text>
    </View>
  );
};

const Avatar = ({ name }: { name: string }) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <View style={viewStyles.avatar}>
      <Text style={viewStyles.avatarText}>{initials}</Text>
    </View>
  );
};

const CustomersScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'ALL'>('ALL');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // tRPC Query
  const { data, isLoading, isError, refetch, isRefetching } = trpc.customers.list.useQuery();

  const filteredCustomers = useMemo(() => {
    if (!data) return [];
    return data.filter((customer: Customer) => {
      const matchesSearch =
        customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.phone.includes(searchQuery);
      
      const matchesRisk = riskFilter === 'ALL' || customer.riskLevel === riskFilter;
      
      return matchesSearch && matchesRisk;
    });
  }, [data, searchQuery, riskFilter]);

  const handleCustomerPress = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsModalVisible(true);
  };

  const renderItem = ({ item }: { item: Customer }) => (
    <TouchableOpacity
      style={viewStyles.customerCard}
      onPress={() => handleCustomerPress(item)}
      activeOpacity={0.7}
    >
      <View style={viewStyles.cardHeader}>
        <Avatar name={item.name} />
        <View style={viewStyles.headerInfo}>
          <Text style={viewStyles.customerName}>{item.name}</Text>
          <Text style={viewStyles.customerEmail}>{item.email}</Text>
        </View>
        <RiskBadge level={item.riskLevel} />
      </View>
      <View style={viewStyles.cardFooter}>
        <View>
          <Text style={viewStyles.footerLabel}>Total Spent</Text>
          <Text style={viewStyles.footerValue}>
            ${item.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={viewStyles.footerLabel}>Phone</Text>
          <Text style={viewStyles.footerValue}>{item.phone}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (isLoading && !isRefetching) {
    return (
      <View style={viewStyles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={viewStyles.centerContainer}>
        <Text style={viewStyles.errorText}>Failed to load customers</Text>
        <TouchableOpacity style={viewStyles.retryButton} onPress={() => refetch()}>
          <Text style={viewStyles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={viewStyles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header & Search */}
      <View style={viewStyles.header}>
        <Text style={viewStyles.title}>Customers</Text>
        <Text style={viewStyles.subtitle}>{filteredCustomers.length} Total Customers</Text>
        
        <View style={viewStyles.searchContainer}>
          <TextInput
            style={viewStyles.searchInput}
            placeholder="Search name, email, or phone..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Risk Filters */}
        <View style={viewStyles.filterContainer}>
          {(['ALL', 'LOW', 'MEDIUM', 'HIGH'] as const).map((level) => (
            <TouchableOpacity
              key={level}
              style={[
                viewStyles.filterChip,
                riskFilter === level && viewStyles.filterChipActive,
              ]}
              onPress={() => setRiskFilter(level)}
            >
              <Text
                style={[
                  viewStyles.filterChipText,
                  riskFilter === level && viewStyles.filterChipTextActive,
                ]}
              >
                {level}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredCustomers}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={viewStyles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={viewStyles.emptyContainer}>
            <Text style={viewStyles.emptyText}>No customers found</Text>
          </View>
        }
      />

      {/* Customer Detail Modal */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={viewStyles.modalOverlay}>
          <View style={viewStyles.modalContent}>
            {selectedCustomer && (
              <>
                <View style={viewStyles.modalHeader}>
                  <Avatar name={selectedCustomer.name} />
                  <Text style={viewStyles.modalTitle}>{selectedCustomer.name}</Text>
                  <RiskBadge level={selectedCustomer.riskLevel} />
                </View>
                
                <View style={viewStyles.modalBody}>
                  <DetailRow label="Email" value={selectedCustomer.email} />
                  <DetailRow label="Phone" value={selectedCustomer.phone} />
                  <DetailRow 
                    label="Total Spent" 
                    value={`$${selectedCustomer.totalSpent.toLocaleString()}`} 
                  />
                  <DetailRow 
                    label="Customer Since" 
                    value={new Date(selectedCustomer.createdAt).toLocaleDateString()} 
                  />
                  {selectedCustomer.lastTransaction && (
                    <DetailRow 
                      label="Last Transaction" 
                      value={new Date(selectedCustomer.lastTransaction).toLocaleDateString()} 
                    />
                  )}
                </View>

                <TouchableOpacity
                  style={viewStyles.closeButton}
                  onPress={() => setIsModalVisible(false)}
                >
                  <Text style={viewStyles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View style={viewStyles.detailRow}>
    <Text style={viewStyles.detailLabel}>{label}</Text>
    <Text style={viewStyles.detailValue}>{value}</Text>
  </View>
);

const viewStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  searchContainer: {
    marginTop: 16,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterContainer: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
  },
  customerCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  customerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  customerEmail: {
    color: colors.muted,
    fontSize: 13,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLabel: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 2,
  },
  footerValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: '50%',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  modalBody: {
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 14,
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    backgroundColor: colors.border,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  closeButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
});

export default CustomersScreen;
