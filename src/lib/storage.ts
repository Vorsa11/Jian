// IndexedDB storage for files and data

const DB_NAME = 'KnowledgeLibraryDB';
const DB_VERSION = 1;

// Store names
export const STORES = {
  FILES: 'files',
  DATA: 'data',
} as const;

// Open database
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Files store
      if (!db.objectStoreNames.contains(STORES.FILES)) {
        const fileStore = db.createObjectStore(STORES.FILES, { keyPath: 'id' });
        fileStore.createIndex('name', 'name', { unique: false });
      }

      // Data store (for sync)
      if (!db.objectStoreNames.contains(STORES.DATA)) {
        db.createObjectStore(STORES.DATA, { keyPath: 'key' });
      }
    };
  });
}

// File operations
export async function saveFile(id: string, name: string, type: string, data: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FILES], 'readwrite');
    const store = transaction.objectStore(STORES.FILES);

    const fileData = {
      id,
      name,
      type,
      size: data.byteLength,
      data,
      createdAt: new Date().toISOString(),
    };

    const request = store.put(fileData);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getFile(id: string): Promise<{ name: string; type: string; data: ArrayBuffer } | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FILES], 'readonly');
    const store = transaction.objectStore(STORES.FILES);
    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        resolve({
          name: result.name,
          type: result.type,
          data: result.data,
        });
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFile(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FILES], 'readwrite');
    const store = transaction.objectStore(STORES.FILES);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllFiles(): Promise<{ id: string; name: string; type: string; size: number; createdAt: string }[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.FILES], 'readonly');
    const store = transaction.objectStore(STORES.FILES);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        size: r.size,
        createdAt: r.createdAt,
      }));
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

// Data operations (for cloud sync simulation)
export async function saveData(key: string, data: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DATA], 'readwrite');
    const store = transaction.objectStore(STORES.DATA);
    const request = store.put({ key, data, updatedAt: new Date().toISOString() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getData(key: string): Promise<any | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DATA], 'readonly');
    const store = transaction.objectStore(STORES.DATA);
    const request = store.get(key);

    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.data : null);
    };
    request.onerror = () => reject(request.error);
  });
}

// Export all data for backup
export async function exportAllData(): Promise<{
  files: { id: string; name: string; type: string; size: number; createdAt: string }[];
}> {
  const files = await getAllFiles();
  return { files };
}
