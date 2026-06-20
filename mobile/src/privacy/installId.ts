import AsyncStorage from '@react-native-async-storage/async-storage';

const INSTALL_ID_KEY = '@radiotedu/install_id';

// Pseudonymous, rotatable id. Not linked to the user account; used only to
// de-duplicate anonymized analytics. Rotating it fully anonymizes prior data.
function uuidv4(): string {
  // Sufficient for a pseudonymous analytics id (not a security token).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached: string | null = null;

export async function getInstallId(): Promise<string> {
  if (cached) {
    return cached;
  }
  let id = await AsyncStorage.getItem(INSTALL_ID_KEY);
  if (!id) {
    id = uuidv4();
    await AsyncStorage.setItem(INSTALL_ID_KEY, id);
  }
  cached = id;
  return id;
}

/** Rotate the id (used on consent withdrawal to break linkage to past data). */
export async function rotateInstallId(): Promise<string> {
  const id = uuidv4();
  await AsyncStorage.setItem(INSTALL_ID_KEY, id);
  cached = id;
  return id;
}
