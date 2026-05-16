import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path is correct

// Design system colors
const COLORS = {
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

// Assuming a basic type for FraudAlertComment. Adjust as per actual tRPC schema.
interface FraudAlertComment {
  id: string;
  fraudAlertId: string;
  comment: string;
  status: 'active' | 'resolved' | 'pending';
  createdAt: string;
  updatedAt: string;
}

const FraudAlertCommentsScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentComment, setCurrentComment] = useState<FraudAlertComment | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [editCommentText, setEditCommentText] = useState('');

  // Fetching data
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.fraud.alertComments.list.useQuery(
    { search: searchText },
    { staleTime: 5 * 60 * 1000 } // Cache data for 5 minutes
  );

  // Mutations
  const createCommentMutation = trpc.fraud.alertComments.create.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
      setNewCommentText('');
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to create comment: ${err.message}`);
    },
  });

  const updateCommentMutation = trpc.fraud.alertComments.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditModalVisible(false);
      setCurrentComment(null);
      setEditCommentText('');
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to update comment: ${err.message}`);
    },
  });

  const deleteCommentMutation = trpc.fraud.alertComments.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to delete comment: ${err.message}`);
    },
  });

  const handleCreateComment = () => {
    if (newCommentText.trim()) {
      // Assuming fraudAlertId is passed via route params or context
      // For this example, we'll use a placeholder or assume it's available globally
      createCommentMutation.mutate({ fraudAlertId: 'some-fraud-alert-id', comment: newCommentText });
    } else {
      Alert.alert('Validation', 'Comment cannot be empty.');
    }
  };

  const handleUpdateComment = () => {
    if (currentComment && editCommentText.trim()) {
      updateCommentMutation.mutate({ id: currentComment.id, comment: editCommentText });
    } else {
      Alert.alert('Validation', 'Comment cannot be empty.');
    }
  };

  const handleDeleteComment = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteCommentMutation.mutate({ id }) },
      ]
    );
  };

  const openEditModal = (comment: FraudAlertComment) => {
    setCurrentComment(comment);
    setEditCommentText(comment.comment);
    setEditModalVisible(true);
  };

  const filteredComments = useMemo(() => {
    if (!data) return [];
    return data.filter(comment =>
      comment.comment.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [data, searchText]);

  const renderCommentItem = useCallback(({ item }: { item: FraudAlertComment }) => {
    const statusColor = item.status === 'active' ? COLORS.success : item.status === 'resolved' ? COLORS.muted : COLORS.warning;
    const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    return (
      <View style={styles.commentCard}>
        <Text style={styles.commentText}>{item.comment}</Text>
        <View style={styles.commentMeta}>
          <Text style={[styles.statusBadge, { backgroundColor: statusColor }]}>{item.status.toUpperCase()}</Text>
          <Text style={styles.dateText}>Created: {formattedDate}</Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteComment(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [handleDeleteComment, openEditModal]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading comments...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load comments'}</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.header}>Fraud Alert Comments</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search comments..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
        <Text style={styles.createButtonText}>Add New Comment</Text>
      </TouchableOpacity>

      {filteredComments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No comments found.</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredComments}
          keyExtractor={(item) => item.id}
          renderItem={renderCommentItem}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      {/* Create Comment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Add New Comment</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter your comment..."
              placeholderTextColor={COLORS.muted}
              multiline
              value={newCommentText}
              onChangeText={setNewCommentText}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.muted }]}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={handleCreateComment}
                disabled={createCommentMutation.isLoading}
              >
                {createCommentMutation.isLoading ? (
                  <ActivityIndicator color={COLORS.text} />
                ) : (
                  <Text style={styles.modalButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Comment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Comment</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Edit your comment..."
              placeholderTextColor={COLORS.muted}
              multiline
              value={editCommentText}
              onChangeText={setEditCommentText}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.muted }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={handleUpdateComment}
                disabled={updateCommentMutation.isLoading}
              >
                {updateCommentMutation.isLoading ? (
                  <ActivityIndicator color={COLORS.text} />
                ) : (
                  <Text style={styles.modalButtonText}>Save</Text>
                )}
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
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.text,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginBottom: 10,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 15,
    textAlign: 'center',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginHorizontal: 15,
    marginBottom: 10,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  createButton: {
    backgroundColor: COLORS.success,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 15,
    marginBottom: 15,
    alignItems: 'center',
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContentContainer: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  commentCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  commentText: {
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 10,
  },
  commentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateText: {
    color: COLORS.muted,
    fontSize: 12,
  },
  actionButtons: {
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
    fontSize: 14,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
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
    width: '90%',
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalInput: {
    width: '100%',
    minHeight: 80,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    borderRadius: 8,
    padding: 10,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default FraudAlertCommentsScreen;
