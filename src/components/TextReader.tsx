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
  content?: string;
  rawBuffer?: ArrayBuffer;
  title: string;
  bookId: string;
  onClose: () => void;
  encoding?: 'auto' | 'utf-8' | 'gbk' | 'gb2312';
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

// ============================== 编码处理工具 ==============================
const decodeBuffer = (buffer: ArrayBuffer, encoding?: string): string => {
  const bytes = new Uint8Array(buffer);
  
  if (encoding && encoding !== 'auto') {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false });
      return decoder.decode(bytes);
    } catch (e) {
      console.warn(`指定编码 ${encoding} 失败，尝试自动检测`);
    }
  }
  
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.slice(2));
  }
  
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(bytes);
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      return text;
    }
  } catch {}
  
  try {
    const gbDecoder = new TextDecoder('gb18030', { fatal: false });
    return gbDecoder.decode(bytes);
  } catch {}
  
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
};

const tryRecoverGbkFromMojibake = (text: string): string => {
  try {
    const gbkSignatures = /[ʵϰгҵģʽһʮ·�����]+/;
    const highByteRatio = (text.match(/[\x80-\xff]/g) || []).length / text.length;
    
    if (gbkSignatures.test(text) || highByteRatio > 0.2) {
      console.log('检测到 GBK 乱码特征，尝试修复...');
      const bytes = new Uint8Array(text.length);
      let valid = true;
      
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code > 255) {
          valid = false;
          break;
        }
        bytes[i] = code;
      }
      
      if (valid) {
        try {
          const decoder = new TextDecoder('gb18030', { fatal: false });
          const decoded = decoder.decode(bytes);
          const stillGarbled = (decoded.match(/[ʵϰгҵģʽһʮ·�]/g) || []).length;
          if (stillGarbled < decoded.length * 0.01) {
            console.log('GBK 修复成功');
            return decoded;
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
  return text;
};

const cleanContent = (text: string): string => {
  if (!text) return '';
  
  let cleaned = text;
  cleaned = tryRecoverGbkFromMojibake(cleaned);
  cleaned = cleaned.replace(/^\uFEFF|^\uFFFE/g, '');
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  cleaned = cleaned.replace(/[ \t]+$/gm, '');
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();
  
  return cleaned;
};

// ============================== 解析函数 ==============================
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

// ============================== 存储工具 ==============================
const storage = {
  loadSettings: (): ReaderSettings => ({
    fontSize: 18,
    fontFamily: FONTS[0].value,
    theme: 0,
    lineHeight: 1.8,
    letterSpacing: 0,
    textAlign: 'justify',
    paragraphSpacing: 1,
    autoHideHeader: true,
  }),
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
export const TextReader: React.FC<TextReaderProps> = ({ 
  content = '', 
  title, 
  bookId, 
  onClose,
  rawBuffer,
  encoding = 'auto'
}) => {
  // 处理内容
  const cleanedContent = useMemo(() => {
    let decodedText: string;
    if (rawBuffer) {
      decodedText = decodeBuffer(rawBuffer, encoding);
    } else {
      decodedText = content;
    }
    return cleanContent(decodedText);
  }, [content, rawBuffer, encoding]);
  
  const items = useMemo(() => parseAndFlatten(cleanedContent), [cleanedContent]);
  
  const [settings, setSettings] = useState<ReaderSettings>(storage.loadSettings());
  const [currentChapter, setCurrentChapter] = useState(0);
  const [showUI, setShowUI] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  // 安全区域高度（刘海屏适配）
  const [safeAreaTop, setSafeAreaTop] = useState(0);
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);
  
  const parentRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentIndexRef = useRef<number>(0);
  const lastSavedIndexRef = useRef<number>(0);
  
  const theme = THEMES[settings.theme] || THEMES[0];

  // 获取安全区域高度
  useEffect(() => {
    const updateSafeArea = () => {
      // 使用 CSS 环境变量获取安全区域
      const style = document.createElement('div');
      style.style.position = 'fixed';
      style.style.paddingTop = 'env(safe-area-inset-top)';
      style.style.paddingBottom = 'env(safe-area-inset-bottom)';
      style.style.paddingLeft = 'env(safe-area-inset-left)';
      style.style.paddingRight = 'env(safe-area-inset-right)';
      document.body.appendChild(style);
      
      const computed = getComputedStyle(style);
      const sat = parseInt(computed.paddingTop) || 0;
      const sab = parseInt(computed.paddingBottom) || 0;
      
      document.body.removeChild(style);
      
      setSafeAreaTop(sat);
      setSafeAreaBottom(sab);
    };

    updateSafeArea();
    window.addEventListener('resize', updateSafeArea);
    return () => window.removeEventListener('resize', updateSafeArea);
  }, []);

  // 虚拟滚动配置
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

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5,
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
    }, 100);
    
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
  
  // UI自动隐藏
  useEffect(() => {
    if (!settings.autoHideHeader || showSettings || showChapters) {
      clearTimeout(uiTimeoutRef.current);
      return;
    }
    
    uiTimeoutRef.current = setTimeout(() => {
      if (!showSettings && !showChapters) setShowUI(false);
    }, 4000);
    
    return () => clearTimeout(uiTimeoutRef.current);
  }, [settings.autoHideHeader, showSettings, showChapters, showUI]);
  
  // 全屏监听
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // 全屏状态变化时重新计算安全区域
      setTimeout(() => {
        const event = new Event('resize');
        window.dispatchEvent(event);
      }, 100);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  
  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettings || showChapters) return;
      
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        parentRef.current?.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' });
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        parentRef.current?.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
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
    } catch (e) {}
  }, []);
  
  // 章节列表
  const chapters = useMemo(() => {
    const chs: { index: number; title: string; itemIndex: number }[] = [];
    items.forEach((item, idx) => {
      if (item.type === 'title') {
        chs.push({ index: item.chapterIndex, title: item.content, itemIndex: idx });
      }
    });
    return chs.length > 0 ? chs : [{ index: 0, title: '全文', itemIndex: 0 }];
  }, [items]);
  
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
      parentRef.current?.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' });
    } else if (x > width * 0.8) {
      parentRef.current?.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
    } else {
      if (!showSettings && !showChapters) setShowUI(v => !v);
    }
  }, [showSettings, showChapters]);
  
  const updateSetting = useCallback(<K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    storage.saveSettings(newSettings);
    requestAnimationFrame(() => virtualizer.measure());
  }, [settings, virtualizer]);
  
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
  
  const currentProgress = useMemo(() => {
    const scrollOffset = virtualizer.scrollOffset || 0;
    const totalSize = virtualizer.getTotalSize();
    const viewportHeight = parentRef.current?.clientHeight || 0;
    if (totalSize === 0 || totalSize <= viewportHeight) return 0;
    return Math.min(100, Math.max(0, Math.round((scrollOffset / (totalSize - viewportHeight)) * 100)));
  }, [virtualizer.scrollOffset, virtualizer.getTotalSize()]);
  
  if (!items.length) return null;
  
  // 计算安全区域：全屏时如果有刘海，留出安全距离；非全屏按正常处理
  const headerOffset = isFullscreen ? Math.max(safeAreaTop, 0) : 0;
  const footerOffset = isFullscreen ? Math.max(safeAreaBottom, 0) : 0;
  
  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col overflow-hidden" 
      style={{ 
        backgroundColor: theme.bg,
        fontFamily: settings.fontFamily,
        WebkitFontSmoothing: 'antialiased',
        // 关键：使用 padding 将内容推离刘海和底部手势条
        paddingTop: headerOffset,
        paddingBottom: footerOffset,
      }}
    >
      {/* 顶部状态栏背景填充（全屏时隐藏状态栏区域用背景色填充） */}
      {isFullscreen && (
        <div 
          className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
          style={{
            height: safeAreaTop > 0 ? safeAreaTop : 0,
            backgroundColor: theme.bg,
          }}
        />
      )}
      
      {/* 加载遮罩 */}
      {!isReady && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: theme.bg }}>
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${theme.accent}40`, borderTopColor: theme.accent }} />
            <span style={{ color: theme.text }}>加载中...</span>
          </div>
        </div>
      )}
      
      {/* 顶部栏 - 全屏时向下偏移避开刘海，非全屏正常显示 */}
      <header 
        className={`absolute left-0 right-0 z-40 transition-all duration-300 ${
          showUI ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
        style={{ 
          top: headerOffset, // 关键：向下偏移避开刘海
          backgroundColor: `${theme.bg}f0`, 
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="h-14 px-4 flex items-center justify-between max-w-3xl mx-auto">
          <button onClick={onClose} className="p-2 -ml-2 rounded-full active:opacity-60" style={{ color: theme.text }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex-1 text-center px-4 overflow-hidden">
            <h1 className="text-[15px] font-semibold truncate" style={{ color: theme.text }}>{title}</h1>
            <p className="text-[11px] opacity-60 truncate" style={{ color: theme.text }}>
              {chapters[currentChapter]?.title || ''}
            </p>
          </div>
          
          <div className="flex items-center gap-1">
            <button onClick={() => setShowChapters(true)} className="p-2.5 rounded-full active:opacity-60" style={{ color: theme.text }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
            <button onClick={toggleFullscreen} className="p-2.5 rounded-full active:opacity-60" style={{ color: theme.text }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {isFullscreen ? (
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                ) : (
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                )}
              </svg>
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2.5 rounded-full active:opacity-60" style={{ color: theme.text }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      
      {/* 阅读区域 - 根据全屏状态调整 padding */}
      <div 
        ref={parentRef}
        className="flex-1 overflow-y-auto relative w-full h-full"
        onClick={handleContainerClick}
        style={{
          // 关键：内容区域顶部留出空间给 header + 安全区域
          paddingTop: showUI ? (56 + headerOffset) : (24 + headerOffset),
          // 关键：底部留出空间给 footer + 安全区域
          paddingBottom: showUI ? (64 + footerOffset) : (40 + footerOffset),
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {renderItem(virtualItem)}
            </div>
          ))}
        </div>
      </div>
      
      {/* 底部栏 - 全屏时向上偏移避开底部手势条 */}
      <footer 
        className={`absolute left-0 right-0 z-40 transition-all duration-300 ${
          showUI ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
        style={{ 
          bottom: footerOffset, // 关键：向上偏移
          backgroundColor: `${theme.bg}f0`, 
          backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <div className="h-16 px-6 flex items-center gap-4 max-w-3xl mx-auto">
          <button 
            onClick={prevChapter}
            disabled={currentChapter === 0}
            className="text-[13px] font-semibold disabled:opacity-30 active:opacity-60"
            style={{ color: theme.text }}
          >
            上一章
          </button>
          
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex justify-between text-[11px] opacity-50" style={{ color: theme.text }}>
              <span>{currentProgress}%</span>
              <span>{currentChapter + 1} / {chapters.length}</span>
            </div>
            <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
              <div 
                className="absolute left-0 top-0 h-full rounded-full transition-all"
                style={{ width: `${currentProgress}%`, backgroundColor: theme.accent }}
              />
              <input 
                type="range" 
                min={0} 
                max={items.length - 1} 
                value={currentIndexRef.current}
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  currentIndexRef.current = idx;
                  virtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
          
          <button 
            onClick={nextChapter}
            disabled={currentChapter >= chapters.length - 1}
            className="text-[13px] font-semibold disabled:opacity-30 active:opacity-60"
            style={{ color: theme.text }}
          >
            下一章
          </button>
        </div>
      </footer>
      
      {/* 目录面板 - 适配安全区域 */}
      {showChapters && (
        <div className="absolute inset-0 z-50 flex">
          <div 
            className="w-[min(320px,85vw)] h-full shadow-2xl flex flex-col"
            style={{ 
              backgroundColor: theme.bg,
              paddingTop: headerOffset, // 适配刘海
            }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: theme.border }}>
              <h2 className="font-bold text-lg" style={{ color: theme.text }}>目录</h2>
              <button onClick={() => setShowChapters(false)} style={{ color: theme.text }} className="p-2">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {chapters.map((ch) => (
                <button
                  key={ch.index}
                  onClick={() => goToChapter(ch.index)}
                  className="w-full text-left px-6 py-4 border-b active:opacity-60"
                  style={{ 
                    borderColor: theme.border,
                    color: currentChapter === ch.index ? theme.accent : theme.text,
                    backgroundColor: currentChapter === ch.index ? `${theme.accent}10` : 'transparent'
                  }}
                >
                  <span className="text-[15px] block truncate">{ch.title}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setShowChapters(false)} />
        </div>
      )}
      
      {/* 设置面板 - 适配安全区域 */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/30" onClick={() => setShowSettings(false)} />
          <div 
            className="w-[min(360px,90vw)] h-full shadow-2xl p-6 overflow-y-auto"
            style={{ 
              backgroundColor: theme.bg,
              paddingTop: 24 + headerOffset, // 适配刘海
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-lg" style={{ color: theme.text }}>阅读设置</h2>
              <button onClick={() => setShowSettings(false)} style={{ color: theme.text }} className="p-2">✕</button>
            </div>
            
            <div className="space-y-6">
              <div>
                <span style={{ color: theme.text }}>字体大小: {settings.fontSize}px</span>
                <input 
                  type="range" min="12" max="32" 
                  value={settings.fontSize}
                  onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                  className="w-full mt-2"
                />
              </div>
              
              <div>
                <span style={{ color: theme.text }}>行间距: {settings.lineHeight}</span>
                <input 
                  type="range" min="1.2" max="2.8" step="0.1"
                  value={settings.lineHeight}
                  onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))}
                  className="w-full mt-2"
                />
              </div>
              
              <div>
                <span style={{ color: theme.text }}>主题</span>
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {THEMES.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => updateSetting('theme', i)}
                      className="aspect-square rounded-lg border-2"
                      style={{ 
                        backgroundColor: t.bg,
                        borderColor: settings.theme === i ? t.accent : 'transparent'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <span style={{ color: theme.text }}>对齐方式</span>
                <div className="flex gap-2 mt-2">
                  {(['left', 'justify', 'center'] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => updateSetting('textAlign', align)}
                      className="flex-1 py-2 rounded text-sm"
                      style={{
                        backgroundColor: settings.textAlign === align ? theme.accent : theme.secondaryBg,
                        color: settings.textAlign === align ? '#fff' : theme.text,
                      }}
                    >
                      {align === 'left' ? '左对齐' : align === 'justify' ? '两端对齐' : '居中'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================== 文件读取辅助函数 ==============================
export const readFile = (file: File): Promise<{ buffer: ArrayBuffer; text: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(buffer);
      let text: string;
      
      try {
        const gbDecoder = new TextDecoder('gb18030', { fatal: false });
        text = gbDecoder.decode(bytes);
        if ((text.match(/[ʵϰгҵģʽһʮ·�]/g) || []).length > text.length * 0.1) {
          throw new Error('可能不是 GBK');
        }
      } catch {
        text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      }
      
      resolve({ buffer, text });
    };
    
    reader.onerror = reject;
  });
};