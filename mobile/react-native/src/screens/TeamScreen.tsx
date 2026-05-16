import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert } from 'react-native';
import { useTrpc } from '../hooks/useTrpc';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

const TeamScreen: React.FC = () => {
  const { query, mutation } = useTrpc();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeamMembers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await query.team.list.query();
      setTeamMembers(data as TeamMember[]); // Assuming data matches TeamMember[] structure
    } catch (err: any) {
      setError(err.message || 'Failed to fetch team members.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [query.team.list]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  const handleInviteMember = () => {
    Alert.alert('Invite Member', 'Invite member functionality goes here.');
    // Implement actual invite logic using mutation.team.invite.mutate() if available
  };

  const handleRemoveMember = (memberId: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove member ${memberId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', onPress: () => {
            // Implement actual remove logic using mutation.team.remove.mutate() if available
            Alert.alert('Removed', `Member ${memberId} removed.`);
          }
        },
      ]
    );
  };

  const renderTeamMember = ({ item }: { item: TeamMember }) => (
    <View style={styles.card}>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{item.name}</Text>
        <Text style={styles.memberEmail}>{item.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{item.role}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemoveMember(item.id)}
      >
        <Text style={styles.removeButtonText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );

  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading team members...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchTeamMembers}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (teamMembers.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.centeredContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.emptyText}>No team members found. Invite new members to get started!</Text>
        <TouchableOpacity style={styles.inviteButton} onPress={handleInviteMember}>
          <Text style={styles.inviteButtonText}>Invite New Member</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={teamMembers}
        keyExtractor={(item) => item.id}
        renderItem={renderTeamMember}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={(
          <TouchableOpacity style={styles.inviteButton} onPress={handleInviteMember}>
            <Text style={styles.inviteButtonText}>Invite New Member</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const colors = {
  primary: '#6366f1',
  background: '#0f172a',
  card: '#1e293b',
  text: 'white',
  subtext: '#94a3b8',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  listContentContainer: {
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  memberEmail: {
    color: colors.subtext,
    fontSize: 14,
    marginBottom: 5,
  },
  roleBadge: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  roleText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  removeButton: {
    backgroundColor: '#dc2626', // A red color for remove action
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  removeButtonText: {
    color: colors.text,
    fontWeight: 'bold',
  },
  loadingText: {
    color: colors.subtext,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444', // A red color for error
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 15,
  },
  emptyText: {
    color: colors.subtext,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  inviteButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'center',
    marginVertical: 10,
  },
  inviteButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default TeamScreen;
