import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';

// ============================== 类型定义 ==============================
interface FlattenedItem {
  type: 'title' | 'paragraph';
  content: string;
  chapterIndex: number;
  globalIndex: number;
}

interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  theme: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: 'left' | 'justify' | 'center';
  paragraphSpacing: number;
  autoHideHeader: boolean;
}

interface TextReaderProps {
  content: string;
  title: string;
  bookId: string;
  onClose: () => void;
}

// ============================== 配置 ==============================
const FONTS = [
  { name: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif' },
  { name: '宋体', value: '"Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", "Songti SC", serif' },
  { name: '黑体', value: '"Noto Sans SC", "Source Han Sans SC", "SimHei", "STHeiti", "Heiti SC", sans-serif' },
  { name: '楷体', value: '"KaiTi", "Kaiti SC", "STKaiti", "楷体", serif' },
  { name: '仿宋', value: '"FangSong", "FangSong SC", "STFangsong", serif' },
];

const THEMES = [
  { name: '纯白', bg: '#ffffff', text: '#1f2937', accent: '#3b82f6', border: '#f3f4f6', secondaryBg: '#fafafa' },
  { name: '乳白', bg: '#fafafa', text: '#374151', accent: '#2563eb', border: '#e5e7eb', secondaryBg: '#f3f4f6' },
  { name: '深夜', bg: '#0f172a', text: '#e2e8f0', accent: '#60a5fa', border: '#1e293b', secondaryBg: '#1e293b' },
  { name: '护眼', bg: '#f4f1ea', text: '#2d3748', accent: '#48bb78', border: '#e8e4dc', secondaryBg: '#ebe7df' },
  { name: '羊皮纸', bg: '#f5f0e6', text: '#5c4b37', accent: '#8b6914', border: '#e5ddd0', secondaryBg: '#efe8db' },
];

// ============================== 数据清洗工具函数 ==============================
const cleanContent = (text: string): string => {
  if (!text) return '';
  
  let cleaned = text;
  
  // 1. 移除 BOM 头 (UTF-8, UTF-16 LE/BE, UTF-32 LE/BE)
  cleaned = cleaned.replace(/^\uFEFF|^\uFFFE|^\u0000\uFEFF|^\uFEFF\u0000|^\uFFFE\u0000|^\u0000\uFFFE/g, '');
  
  // 2. 替换所有类型的换行符为 \n
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // 3. 移除行尾空格和制表符
  cleaned = cleaned.replace(/[ \t]+$/gm, '');
  
  // 4. 移除控制字符（保留换行符(10)和制表符(9)）
  // 使用数组避免正则表达式范围问题
  const controlChars = [
    '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07', '\x08',
    '\x0b', '\x0c', '\x0e', '\x0f', '\x10', '\x11', '\x12', '\x13', '\x14',
    '\x15', '\x16', '\x17', '\x18', '\x19', '\x1a', '\x1b', '\x1c', '\x1d',
    '\x1e', '\x1f', '\x7f', '\x80', '\x81', '\x82', '\x83', '\x84', '\x85',
    '\x86', '\x87', '\x88', '\x89', '\x8a', '\x8b', '\x8c', '\x8d', '\x8e', '\x8f',
    '\x90', '\x91', '\x92', '\x93', '\x94', '\x95', '\x96', '\x97', '\x98', '\x99',
    '\x9a', '\x9b', '\x9c', '\x9d', '\x9e', '\x9f',
    '\u200b', '\u200c', '\u200d', '\u200e', '\u200f',
    '\u2028', '\u2029', '\ufeff'
  ];
  
  controlChars.forEach(char => {
    cleaned = cleaned.split(char).join('');
  });
  
  // 5. 修复常见乱码字符（使用数组避免对象重复键问题）
  const charReplacements: Array<[string, string]> = [
    ['â€œ', '"'], ['â€', '"'], ['â€™', "'"], ['â€˜', "'"], ['â€¦', '…'],
    ['â€"', '—'], ['â€"', '–'], ['Â ', ' '], ['Â¡', '¡'], ['Â¢', '¢'],
    ['Â£', '£'], ['Â¤', '¤'], ['Â¥', '¥'], ['Â©', '©'], ['Â®', '®'],
    ['Â°', '°'], ['Â·', '·'], ['Â½', '½'], ['Â¼', '¼'], ['Â¾', '¾'],
    ['Ã€', 'À'], ['Ã‚', 'Â'], ['Ãƒ', 'Ã'], ['Ã„', 'Ä'], ['Ã…', 'Å'],
    ['Ã†', 'Æ'], ['Ã‡', 'Ç'], ['Ãˆ', 'È'], ['Ã‰', 'É'], ['ÃŠ', 'Ê'],
    ['Ã‹', 'Ë'], ['ÃŒ', 'Ì'], ['ÃŽ', 'Î'], ['Ã', 'Á'], ['Ã', 'Í'],
    ['Ã', 'Ï'], ['Ã', 'Ð'], ['Ã', 'Ñ'], ['Ã', 'Ò'], ['Ã"', 'Ó'],
    ['Ã"', 'Ô'], ['Ã•', 'Õ'], ['Ã–', 'Ö'], ['Ã—', '×'], ['Ã˜', 'Ø'],
    ['Ã™', 'Ù'], ['Ãš', 'Ú'], ['Ã›', 'Û'], ['Ãœ', 'Ü'], ['Ã', 'Ý'],
    ['Ãž', 'Þ'], ['ÃŸ', 'ß'], ['Ã ', 'à'], ['Ã¡', 'á'], ['Ã¢', 'â'],
    ['Ã£', 'ã'], ['Ã¤', 'ä'], ['Ã¥', 'å'], ['Ã¦', 'æ'], ['Ã§', 'ç'],
    ['Ã¨', 'è'], ['Ã©', 'é'], ['Ãª', 'ê'], ['Ã«', 'ë'], ['Ã¬', 'ì'],
    ['Ã\xad', 'í'], ['Ã®', 'î'], ['Ã¯', 'ï'], ['Ã°', 'ð'], ['Ã±', 'ñ'],
    ['Ã²', 'ò'], ['Ã³', 'ó'], ['Ã´', 'ô'], ['Ãµ', 'õ'], ['Ã¶', 'ö'],
    ['Ã·', '÷'], ['Ã¸', 'ø'], ['Ã¹', 'ù'], ['Ãº', 'ú'], ['Ã»', 'û'],
    ['Ã¼', 'ü'], ['Ã½', 'ý'], ['Ã¾', 'þ'], ['Ã¿', 'ÿ'],
  ];
  
  // 注意：由于某些乱码模式可能重叠，需要谨慎处理顺序
  // 先处理长的，再处理短的；或者使用正则表达式全局替换
  charReplacements.forEach(([bad, good]) => {
    // 使用 split/join 而不是 replace 以避免正则表达式特殊字符问题
    cleaned = cleaned.split(bad).join(good);
  });
  
  // 6. 移除连续多个空行（保留最多 2 个）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // 7. 移除开头的空格和空行
  cleaned = cleaned.trimStart();
  
  // 8. 处理零宽字符和不可见字符（再次确认）
  cleaned = cleaned.replace(/[\u200b-\u200d\u2060\ufeff]/g, '');
  
  // 9. 修复全角空格过度使用
  cleaned = cleaned.replace(/[  ]+/g, '  ');
  
  // 10. 确保结尾干净
  cleaned = cleaned.trim();
  
  return cleaned;
};

// 检查是否可能是乱码（用于调试）
const detectGarbledText = (text: string): boolean => {
  // 检测常见的乱码模式
  const garbledPatterns = [
    /Ã[\x80-\xbf]/,  // UTF-8 被当作 Latin-1 解读的常见模式
    /â€œ|â€|â€˜|â€™|â€¦/,  // 引号乱码
    /Â[\x80-\xbf]/,  // 空格和其他字符乱码
  ];
  
  return garbledPatterns.some(pattern => pattern.test(text));
};

const parseAndFlatten = (text: string): FlattenedItem[] => {
  const lines = text.split('\n');
  const items: FlattenedItem[] = [];
  let chapterIndex = -1;
  let globalIndex = 0;
  
  const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+[章节篇部卷集]|[序终][章篇]|\d+[、.]\s*|【.*?】|Chapter\s+\d+|Prologue|Epilogue|Preface|Introduction)/i;
  
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    if (chapterRegex.test(trimmed) && trimmed.length < 100) {
      chapterIndex++;
      items.push({
        type: 'title',
        content: trimmed,
        chapterIndex,
        globalIndex: globalIndex++,
      });
    } else {
      if (chapterIndex === -1) {
        chapterIndex = 0;
        items.push({
          type: 'title',
          content: '开始',
          chapterIndex: 0,
          globalIndex: globalIndex++,
        });
      }
      items.push({
        type: 'paragraph',
        content: trimmed,
        chapterIndex,
        globalIndex: globalIndex++,
      });
    }
  });
  
  return items.length > 0 ? items : [{ type: 'paragraph', content: text, chapterIndex: 0, globalIndex: 0 }];
};

const storage = {
  loadSettings: (): ReaderSettings => {
    try {
      const saved = localStorage.getItem(`reader-settings-v4`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...parsed, textAlign: parsed.textAlign || 'justify' };
      }
    } catch {}
    return {
      fontSize: 18,
      fontFamily: FONTS[0].value,
      theme: 0,
      lineHeight: 1.8,
      letterSpacing: 0,
      textAlign: 'justify',
      paragraphSpacing: 1,
      autoHideHeader: true,
    };
  },
  saveSettings: (s: ReaderSettings) => {
    try { localStorage.setItem(`reader-settings-v4`, JSON.stringify(s)); } catch {}
  },
  loadProgress: (bookId: string): number => {
    try {
      const data = JSON.parse(localStorage.getItem(`reader-progress-v4-${bookId}`) || '{}');
      return typeof data.index === 'number' ? data.index : 0;
    } catch { return 0; }
  },
  saveProgress: (bookId: string, index: number) => {
    try { 
      localStorage.setItem(`reader-progress-v4-${bookId}`, JSON.stringify({ index, time: Date.now() })); 
    } catch {}
  },
};

// ============================== 主组件 ==============================
export const TextReader: React.FC<TextReaderProps> = ({ content, title, bookId, onClose }) => {
  // 数据清洗，检测乱码
  const cleanedContent = useMemo(() => {
    const cleaned = cleanContent(content);
    if (detectGarbledText(cleaned)) {
      console.warn('检测到可能的乱码文本，已尝试修复');
    }
    return cleaned;
  }, [content]);
  
  const items = useMemo(() => parseAndFlatten(cleanedContent), [cleanedContent]);
  
  const [settings, setSettings] = useState<ReaderSettings>(storage.loadSettings());
  const [currentChapter, setCurrentChapter] = useState(0);
  const [showUI, setShowUI] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  const parentRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentIndexRef = useRef<number>(0);
  const lastSavedIndexRef = useRef<number>(0);
  
  const theme = THEMES[settings.theme] || THEMES[0];
  
  // 动态计算预估高度
  const estimateSize = useCallback((index: number): number => {
    const item = items[index];
    if (!item) return settings.fontSize * settings.lineHeight;
    
    const baseHeight = settings.fontSize * settings.lineHeight;
    if (item.type === 'title') {
      return baseHeight * 1.5 + 48;
    }
    
    const charsPerLine = Math.max(20, Math.floor(600 / (settings.fontSize * 0.8)));
    const lines = Math.ceil(item.content.length / charsPerLine);
    return Math.max(baseHeight, lines * baseHeight * settings.lineHeight);
  }, [settings.fontSize, settings.lineHeight, items]);

  // 修复后的虚拟滚动配置
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 3,
    // 修复类型错误：匹配官方要求的函数签名
    measureElement: useCallback((
      element: Element,
      _entry: ResizeObserverEntry | undefined,
      _instance: Virtualizer<HTMLDivElement, Element>
    ) => {
      if (!element) return 0;
      return element.getBoundingClientRect().height;
    }, []),
    getItemKey: useCallback((index: number) => items[index]?.globalIndex ?? index, [items]),
  });
  
  // 恢复进度
  useEffect(() => {
    if (items.length === 0) return;
    
    const savedIndex = storage.loadProgress(bookId);
    currentIndexRef.current = savedIndex;
    lastSavedIndexRef.current = savedIndex;
    
    const timer = setTimeout(() => {
      if (savedIndex > 0 && savedIndex < items.length) {
        virtualizer.scrollToIndex(savedIndex, { align: 'start', behavior: 'auto' });
        const item = items[savedIndex];
        if (item) setCurrentChapter(item.chapterIndex);
      }
      setIsReady(true);
    }, 150);
    
    return () => clearTimeout(timer);
  }, [items, bookId, virtualizer]);
  
  // 实时保存进度
  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length === 0) return;
    
    const firstVisible = virtualItems[0];
    if (!firstVisible) return;
    
    const index = firstVisible.index;
    currentIndexRef.current = index;
    const item = items[index];
    if (item) {
      setCurrentChapter(item.chapterIndex);
      if (Math.abs(index - lastSavedIndexRef.current) > 10 || item.chapterIndex !== currentChapter) {
        storage.saveProgress(bookId, index);
        lastSavedIndexRef.current = index;
      }
    }
  }, [virtualizer.getVirtualItems(), items, bookId, currentChapter]);
  
  // 页面关闭前强制保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      storage.saveProgress(bookId, currentIndexRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [bookId]);
  
  // UI自动隐藏
  useEffect(() => {
    if (!settings.autoHideHeader || showSettings || showChapters) {
      clearTimeout(uiTimeoutRef.current);
      return;
    }
    
    uiTimeoutRef.current = setTimeout(() => {
      if (!showSettings && !showChapters) {
        setShowUI(false);
      }
    }, 4000);
    
    return () => clearTimeout(uiTimeoutRef.current);
  }, [settings.autoHideHeader, showSettings, showChapters, showUI]);
  
  // 全屏监听
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  
  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettings || showChapters) return;
      
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        const scrollEl = parentRef.current;
        if (scrollEl) scrollEl.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' });
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        const scrollEl = parentRef.current;
        if (scrollEl) scrollEl.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
      } else if (e.key === 'Escape') {
        if (isFullscreen) document.exitFullscreen();
        else if (showSettings) setShowSettings(false);
        else if (showChapters) setShowChapters(false);
        else setShowUI(v => !v);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, showChapters, isFullscreen]);
  
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) { console.warn('Fullscreen error:', e); }
  }, []);
  
  // 章节列表
  const chapters = useMemo(() => {
    const chs: { index: number; title: string; itemIndex: number }[] = [];
    items.forEach((item, idx) => {
      if (item.type === 'title') {
        chs.push({ 
          index: item.chapterIndex, 
          title: item.content,
          itemIndex: idx 
        });
      }
    });
    return chs.length > 0 ? chs : [{ index: 0, title: '全文', itemIndex: 0 }];
  }, [items]);
  
  // 章节跳转
  const goToChapter = useCallback((chapterIdx: number) => {
    const targetItem = items.find(i => i.chapterIndex === chapterIdx && i.type === 'title');
    if (targetItem) {
      const itemIndex = items.findIndex(i => i.globalIndex === targetItem.globalIndex);
      if (itemIndex !== -1) {
        virtualizer.scrollToIndex(itemIndex, { align: 'start', behavior: 'smooth' });
        setCurrentChapter(chapterIdx);
        setShowChapters(false);
        setShowUI(true);
        currentIndexRef.current = itemIndex;
        storage.saveProgress(bookId, itemIndex);
        lastSavedIndexRef.current = itemIndex;
      }
    }
  }, [items, virtualizer, bookId]);
  
  const prevChapter = useCallback(() => {
    if (currentChapter > 0) goToChapter(currentChapter - 1);
  }, [currentChapter, goToChapter]);
  
  const nextChapter = useCallback(() => {
    if (currentChapter < chapters.length - 1) goToChapter(currentChapter + 1);
  }, [currentChapter, chapters.length, goToChapter]);
  
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel') || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    if (x < width * 0.2) {
      const scrollEl = parentRef.current;
      if (scrollEl) scrollEl.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' });
    } else if (x > width * 0.8) {
      const scrollEl = parentRef.current;
      if (scrollEl) scrollEl.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
    } else {
      if (!showSettings && !showChapters) {
        setShowUI(v => !v);
      }
    }
  }, [showSettings, showChapters]);
  
  const updateSetting = useCallback(<K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    storage.saveSettings(newSettings);
    requestAnimationFrame(() => {
      virtualizer.measure();
    });
  }, [settings, virtualizer]);
  
  // 渲染行
  const renderItem = useCallback((virtualItem: VirtualItem) => {
    const item = items[virtualItem.index];
    if (!item) return null;
    
    const isTitle = item.type === 'title';
    
    return (
      <div 
        key={virtualItem.key} 
        ref={virtualizer.measureElement}
        data-index={virtualItem.index}
        className={`px-6 ${isTitle ? 'pt-12 pb-8' : 'py-0'}`}
        style={{
          fontSize: isTitle ? `${settings.fontSize * 1.3}px` : `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          lineHeight: isTitle ? 1.4 : settings.lineHeight,
          letterSpacing: `${settings.letterSpacing}px`,
          textAlign: isTitle ? 'center' : settings.textAlign,
          color: isTitle ? theme.accent : theme.text,
          fontWeight: isTitle ? '700' : '400',
          marginBottom: isTitle ? '2rem' : `${settings.paragraphSpacing}em`,
          textIndent: !isTitle && settings.textAlign !== 'center' ? '2em' : '0',
          willChange: 'transform',
          contain: 'layout style paint',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          whiteSpace: 'pre-wrap',
          minHeight: '1em',
        }}
      >
        {item.content}
      </div>
    );
  }, [items, settings, theme, virtualizer]);
  
  // 计算当前总进度
  const currentProgress = useMemo(() => {
    const scrollOffset = virtualizer.scrollOffset || 0;
    const totalSize = virtualizer.getTotalSize();
    const viewportHeight = parentRef.current?.clientHeight || 0;
    if (totalSize === 0 || totalSize <= viewportHeight) return 0;
    return Math.min(100, Math.max(0, Math.round((scrollOffset / (totalSize - viewportHeight)) * 100)));
  }, [virtualizer.scrollOffset, virtualizer.getTotalSize()]);
  
  if (!items.length) return null;
  
  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col overflow-hidden" 
      style={{ 
        backgroundColor: theme.bg,
        fontFamily: settings.fontFamily,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      {/* 加载遮罩 */}
      {!isReady && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: theme.bg }}>
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${theme.accent}40`, borderTopColor: theme.accent }} />
            <span style={{ color: theme.text, fontSize: '14px' }}>加载中...</span>
          </div>
        </div>
      )}
      
      {/* 顶部栏 */}
      <header 
        className={`absolute top-0 left-0 right-0 z-40 transition-all duration-300 ease-out ${
          showUI ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
        style={{ 
          backgroundColor: `${theme.bg}f0`, 
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
          borderBottom: `1px solid ${theme.border}`,
          boxShadow: `0 1px 3px ${theme.border}40`,
        }}
      >
        <div className="h-14 px-4 flex items-center justify-between max-w-3xl mx-auto">
          <button 
            onClick={onClose}
            className="p-2 -ml-2 rounded-full transition-all active:scale-95 hover:opacity-70"
            style={{ color: theme.text }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex-1 text-center px-4 overflow-hidden">
            <h1 className="text-[15px] font-semibold truncate tracking-tight" style={{ color: theme.text }}>
              {title}
            </h1>
            <p className="text-[11px] truncate opacity-60 font-medium mt-0.5" style={{ color: theme.text }}>
              {chapters[currentChapter]?.title || ''}
            </p>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowChapters(true)}
              className="p-2.5 rounded-full transition-all active:scale-95 hover:opacity-70"
              style={{ color: theme.text }}
              title="目录"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
            <button 
              onClick={toggleFullscreen}
              className="p-2.5 rounded-full transition-all active:scale-95 hover:opacity-70"
              style={{ color: theme.text }}
              title="全屏"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isFullscreen ? (
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                ) : (
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                )}
              </svg>
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2.5 rounded-full transition-all active:scale-95 hover:opacity-70"
              style={{ color: theme.text }}
              title="设置"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      
      {/* 阅读区域 */}
      <div 
        ref={parentRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative w-full h-full outline-none"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth',
        }}
        onClick={handleContainerClick}
        tabIndex={0}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
            paddingTop: showUI ? '70px' : '24px',
            paddingBottom: showUI ? '100px' : '60px',
            transition: 'padding 0.3s ease',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(virtualItem)}
            </div>
          ))}
        </div>
      </div>
      
      {/* 底部栏 */}
      <footer 
        className={`absolute bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-out ${
          showUI ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
        style={{ 
          backgroundColor: `${theme.bg}f0`, 
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
          borderTop: `1px solid ${theme.border}`,
          boxShadow: `0 -1px 3px ${theme.border}40`,
        }}
      >
        <div className="h-16 px-6 flex items-center gap-4 max-w-3xl mx-auto">
          <button 
            onClick={prevChapter}
            disabled={currentChapter === 0}
            className="text-[13px] font-semibold disabled:opacity-30 active:opacity-60 transition-opacity whitespace-nowrap min-w-[3em] select-none"
            style={{ color: theme.text }}
          >
            上一章
          </button>
          
          <div className="flex-1 flex flex-col gap-2 min-w-0 px-2">
            <div className="flex justify-between text-[11px] font-medium opacity-50 px-1 select-none" style={{ color: theme.text }}>
              <span>{currentProgress}%</span>
              <span>{currentChapter + 1} / {chapters.length}</span>
            </div>
            <div className="relative h-1.5 rounded-full overflow-hidden cursor-pointer touch-none group" style={{ backgroundColor: theme.border }}>
              <div 
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-150"
                style={{ 
                  width: `${currentProgress}%`,
                  backgroundColor: theme.accent,
                  opacity: 0.8,
                }}
              />
              <input 
                type="range" 
                min={0} 
                max={items.length - 1} 
                step={1}
                value={currentIndexRef.current}
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  currentIndexRef.current = idx;
                  virtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          <button 
            onClick={nextChapter}
            disabled={currentChapter >= chapters.length - 1}
            className="text-[13px] font-semibold disabled:opacity-30 active:opacity-60 transition-opacity whitespace-nowrap min-w-[3em] select-none"
            style={{ color: theme.text }}
          >
            下一章
          </button>
        </div>
      </footer>
      
      {/* 目录面板 */}
      {showChapters && (
        <div className="absolute inset-0 z-50 flex animate-in fade-in duration-200">
          <div 
            className="w-[min(320px,85vw)] h-full shadow-2xl panel flex flex-col animate-in slide-in-from-left duration-300"
            style={{ backgroundColor: theme.bg }}
          >
            <div className="p-4 border-b flex items-center justify-between flex-none" style={{ borderColor: theme.border }}>
              <h2 className="font-bold text-lg" style={{ color: theme.text }}>目录</h2>
              <button 
                onClick={() => setShowChapters(false)}
                className="p-2 rounded-full transition-all active:scale-95 hover:opacity-70"
                style={{ color: theme.text }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {chapters.map((ch) => (
                <button
                  key={ch.index}
                  onClick={() => goToChapter(ch.index)}
                  className={`w-full text-left px-6 py-4 border-b transition-all active:scale-[0.98] ${
                    currentChapter === ch.index ? 'bg-blue-500/10' : 'hover:bg-black/[0.02]'
                  }`}
                  style={{ borderColor: theme.border }}
                >
                  <span 
                    className={`text-[15px] block truncate ${currentChapter === ch.index ? 'font-semibold' : 'opacity-80'}`}
                    style={{ color: currentChapter === ch.index ? theme.accent : theme.text }}
                  >
                    {ch.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setShowChapters(false)} />
        </div>
      )}
      
      {/* 设置面板 */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div 
            className="w-[min(360px,90vw)] h-full shadow-2xl overflow-hidden panel flex flex-col animate-in slide-in-from-right duration-300"
            style={{ backgroundColor: theme.bg }}
          >
            <div className="p-4 border-b flex items-center justify-between flex-none" style={{ borderColor: theme.border }}>
              <h2 className="font-bold text-lg" style={{ color: theme.text }}>阅读设置</h2>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-full transition-all active:scale-95 hover:opacity-70"
                style={{ color: theme.text }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-8">
              {/* 字体大小 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[15px] font-medium" style={{ color: theme.text }}>字体大小</span>
                  <span className="text-[13px] font-bold px-2 py-1 rounded-md" style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}>
                    {settings.fontSize}px
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs opacity-50" style={{ color: theme.text }}>A</span>
                  <input 
                    type="range" 
                    min="12" 
                    max="32" 
                    value={settings.fontSize}
                    onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                    className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                    style={{ 
                      backgroundColor: theme.border,
                      accentColor: theme.accent,
                    }}
                  />
                  <span className="text-lg opacity-50" style={{ color: theme.text }}>A</span>
                </div>
              </div>
              
              {/* 行间距 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[15px] font-medium" style={{ color: theme.text }}>行间距</span>
                  <span className="text-[13px] opacity-60" style={{ color: theme.text }}>{settings.lineHeight}</span>
                </div>
                <input 
                  type="range" 
                  min="1.2" 
                  max="2.8" 
                  step="0.1"
                  value={settings.lineHeight}
                  onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ 
                    backgroundColor: theme.border,
                    accentColor: theme.accent,
                  }}
                />
              </div>
              
              {/* 字体 */}
              <div className="space-y-3">
                <span className="text-[15px] font-medium block" style={{ color: theme.text }}>字体</span>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(f => (
                    <button
                      key={f.name}
                      onClick={() => updateSetting('fontFamily', f.value)}
                      className={`px-3 py-3 text-[13px] rounded-xl border-2 transition-all active:scale-95 ${
                        settings.fontFamily === f.value 
                          ? 'font-medium' 
                          : 'border-gray-200 hover:border-gray-300 opacity-80'
                      }`}
                      style={{ 
                        fontFamily: f.value,
                        color: settings.fontFamily === f.value ? theme.accent : theme.text,
                        borderColor: settings.fontFamily === f.value ? theme.accent : 'transparent',
                        backgroundColor: settings.fontFamily === f.value ? `${theme.accent}10` : theme.secondaryBg,
                      }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 主题 */}
              <div className="space-y-3">
                <span className="text-[15px] font-medium block" style={{ color: theme.text }}>主题</span>
                <div className="grid grid-cols-5 gap-3">
                  {THEMES.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => updateSetting('theme', i)}
                      className={`aspect-square rounded-xl border-2 transition-all active:scale-95 flex items-center justify-center ${
                        settings.theme === i ? 'scale-110 shadow-lg' : 'hover:scale-105 opacity-80'
                      }`}
                      style={{ 
                        backgroundColor: t.bg,
                        borderColor: settings.theme === i ? t.accent : 'transparent',
                      }}
                    >
                      <span className="text-lg font-bold" style={{ color: t.accent }}>Aa</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 对齐 */}
              <div className="space-y-3">
                <span className="text-[15px] font-medium block" style={{ color: theme.text }}>文字对齐</span>
                <div className="flex rounded-xl p-1 gap-1" style={{ backgroundColor: theme.secondaryBg }}>
                  {(['left', 'justify', 'center'] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => updateSetting('textAlign', align)}
                      className={`flex-1 py-2 text-[13px] rounded-lg transition-all font-medium ${
                        settings.textAlign === align ? 'shadow-sm' : 'opacity-50'
                      }`}
                      style={{ 
                        color: theme.text,
                        backgroundColor: settings.textAlign === align ? theme.bg : 'transparent',
                      }}
                    >
                      {align === 'left' ? '左对齐' : align === 'justify' ? '两端对齐' : '居中'}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 段间距 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[15px] font-medium" style={{ color: theme.text }}>段间距</span>
                  <span className="text-[13px] opacity-60" style={{ color: theme.text }}>{settings.paragraphSpacing}em</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="3" 
                  step="0.1"
                  value={settings.paragraphSpacing}
                  onChange={(e) => updateSetting('paragraphSpacing', parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ 
                    backgroundColor: theme.border,
                    accentColor: theme.accent,
                  }}
                />
              </div>
              
              {/* 字间距 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[15px] font-medium" style={{ color: theme.text }}>字间距</span>
                  <span className="text-[13px] opacity-60" style={{ color: theme.text }}>{settings.letterSpacing}px</span>
                </div>
                <input 
                  type="range" 
                  min="-0.5" 
                  max="2" 
                  step="0.1"
                  value={settings.letterSpacing}
                  onChange={(e) => updateSetting('letterSpacing', parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ 
                    backgroundColor: theme.border,
                    accentColor: theme.accent,
                  }}
                />
              </div>
              
              {/* 自动隐藏 */}
              <div className="flex items-center justify-between p-4 rounded-2xl" style={{ backgroundColor: theme.secondaryBg }}>
                <span className="text-[15px] font-medium" style={{ color: theme.text }}>自动隐藏工具栏</span>
                <button 
                  onClick={() => updateSetting('autoHideHeader', !settings.autoHideHeader)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${settings.autoHideHeader ? '' : 'bg-gray-300'}`}
                  style={{ backgroundColor: settings.autoHideHeader ? theme.accent : undefined }}
                >
                  <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${settings.autoHideHeader ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};