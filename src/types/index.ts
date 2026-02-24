// ==================== v1.4 Types - Refactored ====================

// 阅读状态
export type ReadingStatus = 'unread' | 'reading' | 'completed';

// 书籍类型
export type BookType = 'book' | 'paper' | 'article' | 'other';

// 支持的文件类型
export type FileType = 'pdf' | 'txt' | 'epub' | 'image' | 'doc' | 'ppt' | 'archive' | 'audio' | 'video' | 'other';

// 批注
export interface Annotation {
  id: string;
  content: string;
  page?: number;
  createdAt: string;
  updatedAt: string;
}

// 分类
export interface Category {
  id: string;
  name: string;
  color: string;
}

// 书籍/文献
export interface Book {
  id: string;
  title: string;
  author: string;
  description?: string;
  type: BookType;
  categoryId: string;
  status: ReadingStatus;
  rating?: number;
  coverUrl?: string;
  tags: string[];
  annotations: Annotation[];
  // 关联文件
  fileId?: string;
  fileType?: FileType;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  totalPages?: number;
  currentPage?: number;
}

// 文件存储
export interface StoredFile {
  id: string;
  name: string;
  type: string; // MIME type
  fileType: FileType;
  size: number;
  data: ArrayBuffer;
  createdAt: string;
}

// PDF批注
export interface PDFAnnotation {
  id: string;
  bookId: string;
  page: number;
  x: number;
  y: number;
  content: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

// 项目
export type ProjectStatus = 'ongoing' | 'completed' | 'archived';

export interface ProjectFile {
  id: string;
  name: string;
  type: string;
  fileType: FileType;
  size: number;
  description?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  endDate?: string;
  tags: string[];
  knowledge: KnowledgeItem[];
  lessons: LessonItem[];
  files: ProjectFile[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: 'technical' | 'process' | 'communication' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface LessonItem {
  id: string;
  title: string;
  content: string;
  type: 'success' | 'failure' | 'warning';
  createdAt: string;
  updatedAt: string;
}

// 笔记类型（合并备忘录和日程）
export type NoteType = 'todo' | 'note' | 'schedule';
export type NotePriority = 'low' | 'medium' | 'high';

export interface Note {
  id: string;
  title: string;
  content: string;
  type: NoteType;
  priority: NotePriority;
  completed: boolean;
  dueDate?: string;
  dueTime?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// 同步状态
export interface SyncState {
  lastSyncAt: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  syncError?: string;
  deviceId: string;
  syncCode?: string; // 用于跨设备同步的代码
}

// 筛选条件
export interface FilterCriteria {
  categoryId?: string;
  status?: ReadingStatus;
  type?: BookType;
  searchQuery?: string;
  tags?: string[];
}

// 预设分类颜色
export const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#f43f5e', '#6b7280',
];

// 默认分类
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-entertainment', name: '娱乐', color: '#f43f5e' },
  { id: 'cat-tech', name: '技术', color: '#3b82f6' },
  { id: 'cat-academic', name: '学术', color: '#8b5cf6' },
  { id: 'cat-literature', name: '文学', color: '#10b981' },
  { id: 'cat-business', name: '商业', color: '#f59e0b' },
  { id: 'cat-other', name: '其他', color: '#6b7280' },
];

// 文件类型检测
export function detectFileType(mimeType: string, fileName: string): FileType {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  // PDF
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf';
  
  // Text files
  if (mimeType.startsWith('text/') || ext === 'txt' || ext === 'md' || ext === 'json' || ext === 'xml' || ext === 'csv') return 'txt';
  
  // EPUB
  if (ext === 'epub' || mimeType === 'application/epub+zip') return 'epub';
  
  // Images
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '')) return 'image';
  
  // Documents (Word, etc.)
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext || '') || 
      mimeType.includes('word') || 
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'doc';
  
  // Presentations
  if (['ppt', 'pptx', 'odp'].includes(ext || '') || 
      mimeType.includes('powerpoint') ||
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'ppt';
  
  // Archives
  if (['zip', '7z', 'rar', 'tar', 'gz', 'bz2'].includes(ext || '') || 
      mimeType.includes('zip') || 
      mimeType.includes('compressed') ||
      mimeType === 'application/x-7z-compressed' ||
      mimeType === 'application/x-rar-compressed') return 'archive';
  
  // Audio
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext || '')) return 'audio';
  
  // Video
  if (mimeType.startsWith('video/') || ['mp4', 'avi', 'mkv', 'mov', 'wmv'].includes(ext || '')) return 'video';
  
  return 'other';
}

// 文件类型图标
export function getFileTypeIcon(fileType: FileType): string {
  switch (fileType) {
    case 'pdf': return '📄';
    case 'txt': return '📝';
    case 'epub': return '📚';
    case 'image': return '🖼️';
    case 'doc': return '📃';
    case 'ppt': return '📊';
    case 'archive': return '📦';
    case 'audio': return '🎵';
    case 'video': return '🎬';
    default: return '📎';
  }
}

// 文件类型标签
export function getFileTypeLabel(fileType: FileType): string {
  switch (fileType) {
    case 'pdf': return 'PDF';
    case 'txt': return '文本';
    case 'epub': return 'EPUB';
    case 'image': return '图片';
    case 'doc': return '文档';
    case 'ppt': return '演示';
    case 'archive': return '压缩包';
    case 'audio': return '音频';
    case 'video': return '视频';
    default: return '其他';
  }
}

// 获取所有支持的文件扩展名
export function getSupportedExtensions(): string[] {
  return [
    '.pdf', '.txt', '.md', '.epub',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
    '.doc', '.docx', '.odt', '.rtf',
    '.ppt', '.pptx', '.odp',
    '.zip', '.7z', '.rar', '.tar', '.gz',
    '.mp3', '.wav', '.ogg', '.flac', '.m4a',
    '.mp4', '.avi', '.mkv', '.mov',
  ];
}

// 检查文件是否可阅读（在应用内打开）
export function isReadableFile(fileType: FileType): boolean {
  return ['pdf', 'txt', 'epub', 'image'].includes(fileType);
}
