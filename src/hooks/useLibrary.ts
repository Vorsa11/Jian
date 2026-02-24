import { useState, useEffect, useCallback } from 'react';
import type {
  Book, Category, FilterCriteria,
  StoredFile, PDFAnnotation, Project, KnowledgeItem, LessonItem,
  Note, SyncState
} from '@/types';
import { DEFAULT_CATEGORIES, detectFileType } from '@/types';

const STORAGE_KEY = 'jian-v1.1.0';

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Get device ID
const getDeviceId = () => {
  let deviceId = localStorage.getItem('knowledge-library-device-id');
  if (!deviceId) {
    deviceId = generateId();
    localStorage.setItem('knowledge-library-device-id', deviceId);
  }
  return deviceId;
};

// Generate sync code
const generateSyncCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

interface LibraryData {
  books: Book[];
  categories: Category[];
  pdfAnnotations: PDFAnnotation[];
  projects: Project[];
  notes: Note[];
  sync: SyncState;
}

const defaultSyncState: SyncState = {
  lastSyncAt: null,
  syncStatus: 'idle',
  deviceId: getDeviceId(),
  syncCode: generateSyncCode(),
};

const defaultData: LibraryData = {
  books: [],
  categories: DEFAULT_CATEGORIES,
  pdfAnnotations: [],
  projects: [],
  notes: [],
  sync: defaultSyncState,
};

// IndexedDB for file storage
const DB_NAME = 'KnowledgeLibraryDB';
const DB_VERSION = 2;
const FILE_STORE = 'files';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      }
    };
  });
}

async function saveFileToDB(file: StoredFile): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([FILE_STORE], 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    const request = store.put(file);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getFileFromDB(id: string): Promise<StoredFile | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([FILE_STORE], 'readonly');
    const store = tx.objectStore(FILE_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFileFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([FILE_STORE], 'readwrite');
    const store = tx.objectStore(FILE_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function useLibrary() {
  const [data, setData] = useState<LibraryData>(defaultData);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load data from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setData({
          ...defaultData,
          ...parsed,
          sync: { ...defaultSyncState, ...parsed.sync },
        });
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save data to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, isLoaded]);

  // ==================== Books ====================
  const addBook = useCallback((bookData: Omit<Book, 'id' | 'createdAt' | 'updatedAt' | 'annotations'>) => {
    const newBook: Book = {
      ...bookData,
      id: generateId(),
      annotations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, books: [newBook, ...prev.books] }));
    return newBook;
  }, []);

  const updateBook = useCallback((id: string, updates: Partial<Book>) => {
    setData((prev) => ({
      ...prev,
      books: prev.books.map((book) =>
        book.id === id ? { ...book, ...updates, updatedAt: new Date().toISOString() } : book
      ),
    }));
  }, []);

  const deleteBook = useCallback(async (id: string) => {
    const book = data.books.find((b) => b.id === id);
    if (book?.fileId) {
      await deleteFileFromDB(book.fileId);
    }
    setData((prev) => ({
      ...prev,
      books: prev.books.filter((b) => b.id !== id),
      pdfAnnotations: prev.pdfAnnotations.filter((a) => a.bookId !== id),
    }));
  }, [data.books]);

  const getBook = useCallback((id: string) => data.books.find((b) => b.id === id), [data.books]);

  // ==================== File Upload/Download ====================
  const uploadFile = useCallback(async (bookId: string, file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const fileId = generateId();
    const fileType = detectFileType(file.type, file.name);
    
    const storedFile: StoredFile = {
      id: fileId,
      name: file.name,
      type: file.type,
      fileType,
      size: file.size,
      data: arrayBuffer,
      createdAt: new Date().toISOString(),
    };
    
    await saveFileToDB(storedFile);
    
    updateBook(bookId, { 
      fileId, 
      fileType,
      fileName: file.name,
    });
    
    return storedFile;
  }, [updateBook]);

  const downloadFile = useCallback(async (fileId: string): Promise<StoredFile | null> => {
    return await getFileFromDB(fileId);
  }, []);

  const deleteBookFile = useCallback(async (bookId: string) => {
    const book = getBook(bookId);
    if (book?.fileId) {
      await deleteFileFromDB(book.fileId);
      updateBook(bookId, { fileId: undefined, fileType: undefined, fileName: undefined });
    }
  }, [getBook, updateBook]);

  // ==================== PDF Annotations ====================
  const addPDFAnnotation = useCallback((annotation: Omit<PDFAnnotation, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newAnnotation: PDFAnnotation = {
      ...annotation,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, pdfAnnotations: [newAnnotation, ...prev.pdfAnnotations] }));
    return newAnnotation;
  }, []);

  const updatePDFAnnotation = useCallback((id: string, content: string) => {
    setData((prev) => ({
      ...prev,
      pdfAnnotations: prev.pdfAnnotations.map((a) =>
        a.id === id ? { ...a, content, updatedAt: new Date().toISOString() } : a
      ),
    }));
  }, []);

  const deletePDFAnnotation = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      pdfAnnotations: prev.pdfAnnotations.filter((a) => a.id !== id),
    }));
  }, []);

  const getBookPDFAnnotations = useCallback(
    (bookId: string) => data.pdfAnnotations.filter((a) => a.bookId === bookId),
    [data.pdfAnnotations]
  );

  // ==================== Projects ====================
  const addProject = useCallback((projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'knowledge' | 'lessons' | 'files'>) => {
    const newProject: Project = {
      ...projectData,
      id: generateId(),
      knowledge: [],
      lessons: [],
      files: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, projects: [newProject, ...prev.projects] }));
    return newProject;
  }, []);

  const deleteProject = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== id),
    }));
  }, []);

  const addProjectKnowledge = useCallback((projectId: string, knowledge: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newKnowledge: KnowledgeItem = {
      ...knowledge,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId
          ? { ...p, knowledge: [newKnowledge, ...p.knowledge], updatedAt: new Date().toISOString() }
          : p
      ),
    }));
    return newKnowledge;
  }, []);

  const addProjectLesson = useCallback((projectId: string, lesson: Omit<LessonItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newLesson: LessonItem = {
      ...lesson,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId
          ? { ...p, lessons: [newLesson, ...p.lessons], updatedAt: new Date().toISOString() }
          : p
      ),
    }));
    return newLesson;
  }, []);

  const addProjectFile = useCallback(async (projectId: string, file: File, description?: string) => {
    const arrayBuffer = await file.arrayBuffer();
    const fileId = generateId();
    const fileType = detectFileType(file.type, file.name);
    
    const storedFile: StoredFile = {
      id: fileId,
      name: file.name,
      type: file.type,
      fileType,
      size: file.size,
      data: arrayBuffer,
      createdAt: new Date().toISOString(),
    };
    
    await saveFileToDB(storedFile);
    
    const projectFile: Project['files'][0] = {
      id: fileId,
      name: file.name,
      type: file.type,
      fileType,
      size: file.size,
      description,
      createdAt: new Date().toISOString(),
    };
    
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId
          ? { ...p, files: [projectFile, ...p.files], updatedAt: new Date().toISOString() }
          : p
      ),
    }));
    
    return projectFile;
  }, []);

  const deleteProjectFile = useCallback(async (projectId: string, fileId: string) => {
    await deleteFileFromDB(fileId);
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === projectId
          ? { ...p, files: p.files.filter((f) => f.id !== fileId), updatedAt: new Date().toISOString() }
          : p
      ),
    }));
  }, []);

  const downloadProjectFile = useCallback(async (fileId: string): Promise<StoredFile | null> => {
    return await getFileFromDB(fileId);
  }, []);

  // ==================== Notes (合并备忘录和日程) ====================
  const addNote = useCallback((noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'completed' | 'completedAt'>) => {
    const newNote: Note = {
      ...noteData,
      id: generateId(),
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, notes: [newNote, ...prev.notes] }));
    return newNote;
  }, []);

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
    setData((prev) => ({
      ...prev,
      notes: prev.notes.map((n) =>
        n.id === id
          ? {
              ...n,
              ...updates,
              completedAt: updates.completed ? new Date().toISOString() : n.completedAt,
              updatedAt: new Date().toISOString(),
            }
          : n
      ),
    }));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      notes: prev.notes.filter((n) => n.id !== id),
    }));
  }, []);

  const toggleNoteComplete = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      notes: prev.notes.map((n) =>
        n.id === id
          ? {
              ...n,
              completed: !n.completed,
              completedAt: !n.completed ? new Date().toISOString() : undefined,
              updatedAt: new Date().toISOString(),
            }
          : n
      ),
    }));
  }, []);

  // ==================== Categories ====================
  const addCategory = useCallback((name: string, color: string) => {
    const newCategory: Category = { id: generateId(), name, color };
    setData((prev) => ({ ...prev, categories: [...prev.categories, newCategory] }));
    return newCategory;
  }, []);

  const deleteCategory = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c.id !== id),
      books: prev.books.map((b) =>
        b.categoryId === id ? { ...b, categoryId: 'cat-other', updatedAt: new Date().toISOString() } : b
      ),
    }));
  }, []);

  // ==================== Filter & Search ====================
  const filterBooks = useCallback(
    (criteria: FilterCriteria) => {
      return data.books.filter((book) => {
        if (criteria.categoryId && book.categoryId !== criteria.categoryId) return false;
        if (criteria.status && book.status !== criteria.status) return false;
        if (criteria.type && book.type !== criteria.type) return false;
        if (criteria.tags?.length && !criteria.tags.some((tag) => book.tags.includes(tag))) return false;
        if (criteria.searchQuery) {
          const q = criteria.searchQuery.toLowerCase();
          const match =
            book.title.toLowerCase().includes(q) ||
            book.author.toLowerCase().includes(q) ||
            book.description?.toLowerCase().includes(q) ||
            book.tags.some((t) => t.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      });
    },
    [data.books]
  );

  const getAllTags = useCallback(() => {
    const tags = new Set<string>();
    data.books.forEach((b) => b.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [data.books]);

  // ==================== Stats ====================
  const getStats = useCallback(() => {
    const books = data.books;
    return {
      total: books.length,
      completed: books.filter((b) => b.status === 'completed').length,
      reading: books.filter((b) => b.status === 'reading').length,
      unread: books.filter((b) => b.status === 'unread').length,
      totalAnnotations: books.reduce((sum, b) => sum + b.annotations.length, 0),
      categoryStats: data.categories.map((c) => ({ ...c, count: books.filter((b) => b.categoryId === c.id).length })),
      projectCount: data.projects.length,
      noteCount: data.notes.length,
      pendingNotes: data.notes.filter((n) => !n.completed && n.type === 'todo').length,
    };
  }, [data.books, data.categories, data.projects, data.notes]);

  // ==================== Sync ====================
  // Sync to "cloud" (localStorage with sync code as key)
  const syncDataToCloud = useCallback((syncCode: string, syncData: LibraryData): boolean => {
    try {
      const syncPayload = {
        data: syncData,
        timestamp: Date.now(),
        deviceId: syncData.sync.deviceId,
      };
      localStorage.setItem(`knowledge-sync-${syncCode}`, JSON.stringify(syncPayload));
      setData((prev) => ({
        ...prev,
        sync: { ...prev.sync, lastSyncAt: new Date().toISOString(), syncStatus: 'idle' },
      }));
      return true;
    } catch (error) {
      console.error('Sync to cloud failed:', error);
      return false;
    }
  }, []);

  // Sync from "cloud"
  const syncDataFromCloud = useCallback((syncCode: string): LibraryData | null => {
    try {
      const stored = localStorage.getItem(`knowledge-sync-${syncCode}`);
      if (stored) {
        const payload = JSON.parse(stored);
        return payload.data as LibraryData;
      }
      return null;
    } catch (error) {
      console.error('Sync from cloud failed:', error);
      return null;
    }
  }, []);

  // Merge data from another device
  const mergeData = useCallback((remoteData: LibraryData) => {
    setData((prev) => {
      // Merge books: keep both, use updatedAt to resolve conflicts
      const bookMap = new Map<string, Book>();
      [...prev.books, ...remoteData.books].forEach((book) => {
        const existing = bookMap.get(book.id);
        if (!existing || new Date(book.updatedAt) > new Date(existing.updatedAt)) {
          bookMap.set(book.id, book);
        }
      });

      // Merge categories: keep unique ones
      const categoryMap = new Map<string, Category>();
      [...prev.categories, ...remoteData.categories].forEach((cat) => {
        if (!categoryMap.has(cat.id)) {
          categoryMap.set(cat.id, cat);
        }
      });

      // Merge PDF annotations
      const annotationMap = new Map<string, PDFAnnotation>();
      [...prev.pdfAnnotations, ...remoteData.pdfAnnotations].forEach((ann) => {
        const existing = annotationMap.get(ann.id);
        if (!existing || new Date(ann.updatedAt) > new Date(existing.updatedAt)) {
          annotationMap.set(ann.id, ann);
        }
      });

      // Merge projects
      const projectMap = new Map<string, Project>();
      [...prev.projects, ...remoteData.projects].forEach((proj) => {
        const existing = projectMap.get(proj.id);
        if (!existing || new Date(proj.updatedAt) > new Date(existing.updatedAt)) {
          projectMap.set(proj.id, proj);
        }
      });

      // Merge notes
      const noteMap = new Map<string, Note>();
      [...prev.notes, ...remoteData.notes].forEach((note) => {
        const existing = noteMap.get(note.id);
        if (!existing || new Date(note.updatedAt) > new Date(existing.updatedAt)) {
          noteMap.set(note.id, note);
        }
      });

      return {
        books: Array.from(bookMap.values()),
        categories: Array.from(categoryMap.values()),
        pdfAnnotations: Array.from(annotationMap.values()),
        projects: Array.from(projectMap.values()),
        notes: Array.from(noteMap.values()),
        sync: {
          ...prev.sync,
          lastSyncAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const exportData = useCallback(() => {
    return JSON.stringify(data, null, 2);
  }, [data]);

  const importData = useCallback((jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      setData({
        ...defaultData,
        ...parsed,
        sync: { ...defaultSyncState, ...parsed.sync },
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  // Generate new sync code
  const regenerateSyncCode = useCallback(() => {
    const newCode = generateSyncCode();
    setData((prev) => ({
      ...prev,
      sync: { ...prev.sync, syncCode: newCode },
    }));
    return newCode;
  }, []);

  return {
    // Data
    books: data.books,
    categories: data.categories,
    projects: data.projects,
    notes: data.notes,
    sync: data.sync,
    isLoaded,

    // Books
    addBook,
    updateBook,
    deleteBook,
    getBook,
    filterBooks,

    // Files
    uploadFile,
    downloadFile,
    deleteBookFile,

    // PDF Annotations
    addPDFAnnotation,
    updatePDFAnnotation,
    deletePDFAnnotation,
    getBookPDFAnnotations,

    // Projects
    addProject,
    deleteProject,
    addProjectKnowledge,
    addProjectLesson,
    addProjectFile,
    deleteProjectFile,
    downloadProjectFile,

    // Notes
    addNote,
    updateNote,
    deleteNote,
    toggleNoteComplete,

    // Categories
    addCategory,
    deleteCategory,

    // Utils
    getAllTags,
    getStats,
    exportData,
    importData,
    regenerateSyncCode,
    syncDataToCloud,
    syncDataFromCloud,
    mergeData,
  };
}
