import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
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
interface VirtualCard {
  id: string;
  last4: string;
  cardholderName: string;
  balance: number;
  currency: string;
  status: 'active' | 'frozen' | 'terminated';
  expiryMonth: string;
  expiryYear: string;
}

const VirtualCardsScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');

  // tRPC Queries & Mutations
  const { data: cards, isLoading, error, refetch, isRefetching } = trpc.cards.list.useQuery();
  
  const freezeMutation = trpc.cards.freeze.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => Alert.alert('Error', err.message),
  });
  
  const unfreezeMutation = trpc.cards.unfreeze.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => Alert.alert('Error', err.message),
  });

  // Filtered cards based on search
  const filteredCards = useMemo(() => {
    if (!cards) return [];
    return cards.filter((card: VirtualCard) =>
      card.cardholderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.last4.includes(searchQuery)
    );
  }, [cards, searchQuery]);

  const handleToggleStatus = (card: VirtualCard) => {
    const isFrozen = card.status === 'frozen';
    Alert.alert(
      isFrozen ? 'Unfreeze Card' : 'Freeze Card',
      `Are you sure you want to ${isFrozen ? 'unfreeze' : 'freeze'} this card?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isFrozen ? 'Unfreeze' : 'Freeze',
          style: isFrozen ? 'default' : 'destructive',
          onPress: () => {
            if (isFrozen) {
              unfreezeMutation.mutate({ id: card.id });
            } else {
              freezeMutation.mutate({ id: card.id });
            }
          },
        },
      ]
    );
  };

  const renderCardItem = ({ item }: { item: VirtualCard }) => (
    <View style={styles.cardContainer}>
      <View style={[styles.cardVisual, { backgroundColor: item.status === 'frozen' ? '#334155' : colors.primary }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardBrand}>Virtual Card</Text>
          <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? colors.success : colors.warning }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        
        <Text style={styles.cardNumber}>**** **** **** {item.last4}</Text>
        
        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.cardLabel}>CARDHOLDER</Text>
            <Text style={styles.cardValue}>{item.cardholderName}</Text>
          </View>
          <View>
            <Text style={styles.cardLabel}>EXPIRES</Text>
            <Text style={styles.cardValue}>{item.expiryMonth}/{item.expiryYear}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency }).format(item.balance)}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={[styles.actionButton, { borderColor: colors.border }]}
            onPress={() => handleToggleStatus(item)}
            disabled={freezeMutation.isLoading || unfreezeMutation.isLoading}
          >
            {freezeMutation.isLoading || unfreezeMutation.isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.actionButtonText, { color: item.status === 'frozen' ? colors.success : colors.error }]}>
                {item.status === 'frozen' ? 'Unfreeze Card' : 'Freeze Card'}
              </Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => (navigation as any).navigate('CardDetails', { id: item.id })}
          >
            <Text style={styles.actionButtonText}>View Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load cards</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Virtual Cards</Text>
        <TouchableOpacity 
          style={styles.createButton}
          onPress={() => (navigation as any).navigate('CreateCard')}
        >
          <Text style={styles.createButtonText}>+ New Card</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or last 4 digits..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filteredCards}
        renderItem={renderCardItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No cards match your search' : 'No virtual cards found'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  cardContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardVisual: {
    padding: 20,
    height: 180,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardBrand: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.9,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardNumber: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.7,
    marginBottom: 4,
  },
  cardValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  cardDetails: {
    padding: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceLabel: {
    color: colors.muted,
    fontSize: 14,
  },
  balanceValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
  },
});

export default VirtualCardsScreen;
