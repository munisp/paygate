import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useTrpc } from '../hooks/useTrpc';

// Define color scheme
const Colors = {
  primary: '#6366f1',
  background: '#0f172a',
  card: '#1e293b',
  text: 'white',
  subtext: '#94a3b8',
};

const KybDocumentUploadScreen = () => {
  const { mutation } = useTrpc();
  const uploadDocumentMutation = mutation.kybDocUpload.upload;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [documentToUpload, setDocumentToUpload] = useState(null);
  const [documentName, setDocumentName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleSelectDocument = () => {
    // In a real application, this would integrate with a library
    // like 'react-native-image-picker' or 'react-native-document-picker'
    // to allow users to select a file from their device or camera.
    Alert.alert(
      'Select Document',
      'This would typically open a camera or gallery picker to select a document. For this example, a placeholder document is used.'
    );
    // Simulate selecting a document for demonstration purposes
    setDocumentToUpload({ uri: 'file://path/to/document.pdf', type: 'application/pdf', name: 'my_document.pdf' });
    setDocumentName('my_document.pdf');
    setUploadProgress(0); // Reset progress on new selection
  };

  const handleUploadDocument = async () => {
    if (!documentToUpload) {
      Alert.alert('Error', 'Please select a document first.');
      return;
    }

    // Simulate upload progress for demonstration
    setUploadProgress(0);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      setUploadProgress(i);
    }

    try {
      // In a real app, 'documentToUpload' would be passed to the mutation
      // For example: await uploadDocumentMutation.mutateAsync({ file: documentToUpload });
      await uploadDocumentMutation.mutateAsync({}); // Calling without actual data for simulation
      Alert.alert('Success', 'Document uploaded successfully!');
      setDocumentToUpload(null);
      setDocumentName('');
      setUploadProgress(0);
    } catch (error) {
      Alert.alert('Upload Failed', `Error: ${error.message || 'Unknown error'}`);
    }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // In a real app, this would re-fetch any relevant data or clear states
    // For this screen, it might clear the current selection or check upload status
    setDocumentToUpload(null);
    setDocumentName('');
    setUploadProgress(0);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network request
    setIsRefreshing(false);
  }, []);

  const renderContent = () => {
    if (uploadDocumentMutation.isLoading) {
      return (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Uploading document...</Text>
          {uploadProgress > 0 && (
            <Text style={styles.loadingText}>{`Progress: ${uploadProgress}%`}</Text>
          )}
        </View>
      );
    }

    if (uploadDocumentMutation.isError) {
      return (
        <View style={styles.centeredContainer}>
          <Text style={styles.errorText}>Failed to upload document.</Text>
          <Text style={styles.subtext}>{uploadDocumentMutation.error?.message || 'Please try again.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => uploadDocumentMutation.reset()}>
            <Text style={styles.retryButtonText}>Retry Upload</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Empty state or initial state
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>KYB Document Upload</Text>
        <Text style={styles.subtext}>Please select a document to upload for your Know Your Business verification.</Text>

        <TouchableOpacity style={styles.selectButton} onPress={handleSelectDocument}>
          <Text style={styles.selectButtonText}>Select Document</Text>
        </TouchableOpacity>

        {documentName ? (
          <View style={styles.documentInfoContainer}>
            <Text style={styles.documentNameText}>Selected: {documentName}</Text>
            <TouchableOpacity style={styles.uploadButton} onPress={handleUploadDocument}>
              <Text style={styles.uploadButtonText}>Upload Document</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.emptyStateText}>No document selected.</Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
          colors={[Colors.primary]}
          progressBackgroundColor={Colors.card}
        />
      }
    >
      {renderContent()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 15,
  },
  loadingText: {
    color: Colors.subtext,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtext: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyStateText: {
    color: Colors.subtext,
    fontSize: 16,
    marginTop: 15,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 15,
  },
  retryButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
    marginBottom: 15,
  },
  selectButtonText: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: 'bold',
  },
  documentInfoContainer: {
    marginTop: 15,
    alignItems: 'center',
  },
  documentNameText: {
    color: Colors.text,
    fontSize: 16,
    marginBottom: 10,
  },
  uploadButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: 'bold',
  },
});

export default KybDocumentUploadScreen;
