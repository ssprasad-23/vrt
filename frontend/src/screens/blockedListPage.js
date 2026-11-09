import React, {useCallback, useEffect, useState} from 'react';
import {View, FlatList, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {fetchBlockedUsers, unblockUser} from '../api/blocks';
import {getErrorMessage} from '../api/errors';

// Lists the users you've blocked, with an Unblock button for each. Opened from Home's ⋮ menu.
const BlockedListPage = ({navigation}) => {
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // user ids with an unblock request in flight, so the button can't be pressed twice
  const [unblocking, setUnblocking] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBlockedUsers(await fetchBlockedUsers());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUnblock = userId => {
    Alert.alert(`Unblock @user${userId}?`, 'Their videos will show up in your feed again.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Unblock',
        onPress: async () => {
          setUnblocking(prev => [...prev, userId]);
          try {
            await unblockUser(userId);
            setBlockedUsers(prev => prev.filter(user => user.userId !== userId));
          } catch (err) {
            // 404: already unblocked (e.g. from another device) — drop it from the list anyway
            if (err?.response?.status === 404) {
              setBlockedUsers(prev => prev.filter(user => user.userId !== userId));
            } else {
              Alert.alert('Could not unblock user', getErrorMessage(err));
            }
          } finally {
            setUnblocking(prev => prev.filter(id => id !== userId));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Blocked List</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.doneButton}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load} activeOpacity={0.8}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={item => String(item.userId)}
          contentContainerStyle={blockedUsers.length === 0 && styles.centered}
          renderItem={({item}) => {
            const busy = unblocking.includes(item.userId);
            return (
              <View style={styles.row}>
                <Text style={styles.username}>@user{item.userId}</Text>
                <TouchableOpacity
                  style={styles.unblockButton}
                  onPress={() => handleUnblock(item.userId)}
                  disabled={busy}
                  activeOpacity={0.8}>
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.unblockText}>Unblock</Text>}
                </TouchableOpacity>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          ListEmptyComponent={<Text style={styles.emptyText}>You haven't blocked anyone</Text>}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  doneButton: {
    position: 'absolute',
    right: 16,
  },
  doneText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  centered: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  username: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  unblockButton: {
    minWidth: 84,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  unblockText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 15,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default BlockedListPage;
