import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readMeta(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function writeMeta(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function readMetaMany(keys: string[]): Promise<Array<string | null>> {
  if (keys.length === 0) {
    return [];
  }
  const entries = await AsyncStorage.multiGet(keys);
  return entries.map((entry) => entry[1] ?? null);
}

export async function writeMetaMany(entries: Array<[string, string]>): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  await AsyncStorage.multiSet(entries);
}

export async function removeMetaMany(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }
  await AsyncStorage.multiRemove(keys);
}
