import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

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
  textAlign: 'left' | 'justify';
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
  { name: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { name: '宋体', value: '"Noto Serif SC", "Source Han Serif SC", "SimSun", serif' },
  { name: '黑体', value: '"Noto Sans SC", "Source Han Sans SC", "SimHei", sans-serif' },
  { name: '楷体', value: '"KaiTi", "Kaiti SC", serif' },
];

const THEMES = [
  { name: '纯白', bg: '#ffffff', text: '#1f2937', accent: '#3b82f6', border: '#f3f4f6' },
  { name: '乳白', bg: '#fafafa', text: '#374151', accent: '#2563eb', border: '#e5e7eb' },
  { name: '深夜', bg: '#111827', text: '#f3f4f6', accent: '#60a5fa', border: '#1f2937' },
  { name: '护眼', bg: '#f4f6f0', text: '#2d3748', accent: '#48bb78', border: '#e8ebe3' },
];

// ============================== 工具函数 ==============================
const cleanContent = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
};

const parseAndFlatten = (text: string): FlattenedItem[] => {
  const lines = text.split('\n');
  const items: FlattenedItem[] = [];
  let chapterIndex = -1;
  let globalIndex = 0;
  
  const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+[章节篇部卷集]|[序终][章篇]|\d+[、.]\s*|【.*?】|Chapter\s+\d+)/i;
  
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    if (chapterRegex.test(trimmed) && trimmed.length < 80) {
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
    try { localStorage.setItem(`reader-settings-v2`, JSON.stringify(s)); } catch {}
  },
  loadProgress: (bookId: string): number => {
    try {
      const data = JSON.parse(localStorage.getItem(`reader-progress-v2-${bookId}`) || '{}');
      return data.index || 0;
    } catch { return 0; }
  },
  saveProgress: (bookId: string, index: number) => {
    try { localStorage.setItem(`reader-progress-v2-${bookId}`, JSON.stringify({ index, time: Date.now() })); } catch {}
  },
};

// ============================== 主组件 ==============================
export const TextReader: React.FC<TextReaderProps> = ({ content, title, bookId, onClose }) => {
  const items = useMemo(() => parseAndFlatten(cleanContent(content)), [content]);
  const [settings, setSettings] = useState<ReaderSettings>(storage.loadSettings());
  const [currentChapter, setCurrentChapter] = useState(0);
  const [showUI, setShowUI] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  const parentRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<number>();
  const lastSaveTime = useRef<number>(0);
  
  const theme = THEMES[settings.theme] || THEMES[0];
  
  // 虚拟滚动配置
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => {
      // 更精确的预估：标题占2行，正文按字体大小估算
      return settings.fontSize * settings.lineHeight * 1.8;
    }, [settings.fontSize, settings.lineHeight]),
    overscan: 8, // 增加预渲染范围，减少白屏
  });
  
  // 恢复进度 - 关键修复：确保虚拟滚动准备好后再跳转
  useEffect(() => {
    if (!isReady || items.length === 0) return;
    
    const savedIndex = storage.loadProgress(bookId);
    if (savedIndex > 0 && savedIndex < items.length) {
      // 使用 setTimeout 确保 DOM 已准备好
      const timer = setTimeout(() => {
        virtualizer.scrollToIndex(savedIndex, { align: 'start', behavior: 'auto' });
        // 更新当前章节
        const item = items[savedIndex];
        if (item) setCurrentChapter(item.chapterIndex);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isReady, items, bookId, virtualizer]);
  
  // 标记准备好（组件挂载后）
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);
  
  // 实时保存进度（节流）
  useEffect(() => {
    const [firstVisible] = virtualizer.getVirtualItems();
    if (!firstVisible) return;
    
    const now = Date.now();
    if (now - lastSaveTime.current < 500) return; // 500ms节流
    
    const item = items[firstVisible.index];
    if (item) {
      setCurrentChapter(item.chapterIndex);
      storage.saveProgress(bookId, firstVisible.index);
      lastSaveTime.current = now;
    }
  }, [virtualizer.getVirtualItems()[0]?.index, items, bookId]);
  
  // UI自动隐藏
  useEffect(() => {
    if (!settings.autoHideHeader || showSettings || showChapters) return;
    
    clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = window.setTimeout(() => {
      setShowUI(false);
    }, 4000);
    
    return () => clearTimeout(uiTimeoutRef.current);
  }, [settings.autoHideHeader, showSettings, showChapters, showUI]);
  
  // 全屏监听
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.log('Fullscreen error:', e);
    }
  }, []);
  
  // 章节列表
  const chapters = useMemo(() => {
    const chs: { index: number; title: string }[] = [];
    items.forEach((item, idx) => {
      if (item.type === 'title') {
        chs.push({ index: idx, title: item.content });
      }
    });
    return chs.length > 0 ? chs : [{ index: 0, title: '全文' }];
  }, [items]);
  
  const goToChapter = useCallback((chapterIdx: number) => {
    const target = items.findIndex(i => i.chapterIndex === chapterIdx && i.type === 'title');
    if (target !== -1) {
      virtualizer.scrollToIndex(target, { align: 'start', behavior: 'smooth' });
      setShowChapters(false);
      setShowUI(true);
    }
  }, [items, virtualizer]);
  
  // 点击内容区域
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // 如果点击的是设置面板或目录面板内部，不处理
    if ((e.target as HTMLElement).closest('.settings-panel') || 
        (e.target as HTMLElement).closest('.chapters-panel')) return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    // 左30%：上一屏，右30%：下一屏，中间40%：切换UI
    if (x < width * 0.3) {
      // 上一屏
      const scrollEl = parentRef.current;
      if (scrollEl) scrollEl.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' });
    } else if (x > width * 0.7) {
      // 下一屏
      const scrollEl = parentRef.current;
      if (scrollEl) scrollEl.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
    } else {
      // 中间：切换UI
      if (!showSettings && !showChapters) {
        setShowUI(v => !v);
      }
    }
  }, [showSettings, showChapters]);
  
  const updateSetting = useCallback(<K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    storage.saveSettings(newSettings);
    // 重新测量
    setTimeout(() => virtualizer.measure(), 0);
  }, [settings, virtualizer]);
  
  // 渲染行
  const renderItem = useCallback((index: number) => {
    const item = items[index];
    if (!item) return null;
    
    const isTitle = item.type === 'title';
    
    return (
      <div 
        key={index} 
        className={`px-6 ${isTitle ? 'pt-8 pb-4' : 'py-0'}`}
        style={{
          fontSize: isTitle ? `${settings.fontSize * 1.3}px` : `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          lineHeight: isTitle ? 1.4 : settings.lineHeight,
          letterSpacing: `${settings.letterSpacing}px`,
          textAlign: isTitle ? 'center' : settings.textAlign,
          color: isTitle ? theme.accent : theme.text,
          fontWeight: isTitle ? '700' : '400',
          marginBottom: isTitle ? '1.5em' : `${settings.paragraphSpacing}em`,
          textIndent: !isTitle && settings.textAlign !== 'center' ? '2em' : '0',
        }}
      >
        {item.content}
      </div>
    );
  }, [items, settings, theme]);
  
  // 计算当前总进度
  const currentProgress = useMemo(() => {
    const [firstVisible] = virtualizer.getVirtualItems();
    if (!firstVisible || items.length === 0) return 0;
    return Math.min(100, Math.round((firstVisible.index / items.length) * 100));
  }, [virtualizer.getVirtualItems()[0]?.index, items.length]);
  
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white" style={{ backgroundColor: theme.bg }}>
      {/* 顶部栏 - 玻璃拟态优化 */}
      <header 
        className={`absolute top-0 left-0 right-0 z-40 transition-all duration-500 ease-out ${
          showUI ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
        style={{ 
          backgroundColor: `${theme.bg}ee`, 
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="h-14 px-4 flex items-center justify-between max-w-3xl mx-auto">
          <button 
            onClick={onClose}
            className="p-2 -ml-2 rounded-full active:bg-black/5 transition-colors"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.text }}>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex-1 text-center px-4">
            <h1 className="text-[15px] font-semibold truncate" style={{ color: theme.text }}>
              {title}
            </h1>
            <p className="text-[11px] truncate opacity-50 font-medium tracking-wide" style={{ color: theme.text }}>
              {chapters[currentChapter]?.title || ''}
            </p>
          </div>
          
          <div className="flex items-center gap-0.5">
            <button 
              onClick={() => setShowChapters(true)}
              className="p-2.5 rounded-full active:bg-black/5 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.text }}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
            <button 
              onClick={toggleFullscreen}
              className="p-2.5 rounded-full active:bg-black/5 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.text }}>
                {isFullscreen ? (
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                ) : (
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                )}
              </svg>
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2.5 rounded-full active:bg-black/5 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.text }}>
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
        className="flex-1 overflow-auto relative w-full h-full"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          overflowY: 'scroll',
        }}
        onClick={handleContainerClick}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
            paddingTop: showUI ? '56px' : '0',
            paddingBottom: showUI ? '64px' : '0',
            transition: 'padding 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(virtualItem.index)}
            </div>
          ))}
        </div>
      </div>
      
      {/* 底部栏 - 优化交互 */}
      <footer 
        className={`absolute bottom-0 left-0 right-0 z-40 transition-all duration-500 ease-out ${
          showUI ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
        style={{ 
          backgroundColor: `${theme.bg}ee`, 
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <div className="h-16 px-6 flex items-center gap-4 max-w-3xl mx-auto">
          <button 
            onClick={() => {
              const target = items.findIndex(i => i.chapterIndex === currentChapter - 1 && i.type === 'title');
              if (target !== -1) virtualizer.scrollToIndex(target, { align: 'start', behavior: 'smooth' });
            }}
            disabled={currentChapter === 0}
            className="text-[13px] font-semibold disabled:opacity-30 active:opacity-60 transition-opacity whitespace-nowrap"
            style={{ color: theme.text }}
          >
            上一章
          </button>
          
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <div className="flex justify-between text-[11px] font-medium opacity-40" style={{ color: theme.text }}>
              <span>{currentProgress}%</span>
              <span>{currentChapter + 1} / {chapters.length}</span>
            </div>
            <div className="relative h-1.5 bg-gray-200/50 rounded-full overflow-hidden cursor-pointer group touch-none">
              <div 
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-150 ease-out group-hover:opacity-100"
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
                value={virtualizer.getVirtualItems()[0]?.index || 0}
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  virtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          <button 
            onClick={() => {
              const target = items.findIndex(i => i.chapterIndex === currentChapter + 1 && i.type === 'title');
              if (target !== -1) virtualizer.scrollToIndex(target, { align: 'start', behavior: 'smooth' });
            }}
            disabled={currentChapter >= chapters.length - 1}
            className="text-[13px] font-semibold disabled:opacity-30 active:opacity-60 transition-opacity whitespace-nowrap"
            style={{ color: theme.text }}
          >
            下一章
          </button>
        </div>
      </footer>
      
      {/* 目录面板 - 修复层级 */}
      {showChapters && (
        <>
          <div 
            className="absolute inset-0 z-50 bg-black/20 backdrop-blur-[2px] transition-opacity" 
            onClick={() => setShowChapters(false)}
          />
          <div 
            className="absolute left-0 top-0 bottom-0 w-[min(320px,85vw)] z-50 shadow-2xl transform transition-transform duration-300 ease-out chapters-panel"
            style={{ 
              backgroundColor: theme.bg,
              transform: showChapters ? 'translateX(0)' : 'translateX(-100%)',
            }}
          >
            <div className="p-4 border-b flex items-center justify-between sticky top-0 z-10" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
              <h2 className="font-bold text-lg" style={{ color: theme.text }}>目录</h2>
              <button 
                onClick={() => setShowChapters(false)}
                className="p-2 rounded-full hover:bg-black/5 active:bg-black/10 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: theme.text }}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto h-[calc(100%-64px)] pb-safe">
              {chapters.map((ch, idx) => (
                <button
                  key={idx}
                  onClick={() => goToChapter(idx)}
                  className={`w-full text-left px-6 py-4 border-b transition-all active:scale-[0.98] ${
                    currentChapter === idx ? 'bg-blue-50/30' : 'hover:bg-black/[0.02]'
                  }`}
                  style={{ borderColor: theme.border }}
                >
                  <span 
                    className={`text-[15px] block truncate ${currentChapter === idx ? 'font-semibold' : 'opacity-70'}`}
                    style={{ color: currentChapter === idx ? theme.accent : theme.text }}
                  >
                    {ch.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      
      {/* 设置面板 - 修复层级和点击 */}
      {showSettings && (
        <>
          <div 
            className="absolute inset-0 z-50 bg-black/20 backdrop-blur-[2px] transition-opacity" 
            onClick={() => setShowSettings(false)}
          />
          <div 
            className="absolute right-0 top-0 bottom-0 w-[min(360px,90vw)] z-50 shadow-2xl overflow-hidden settings-panel"
            style={{ backgroundColor: theme.bg }}
          >
            <div className="p-4 border-b flex items-center justify-between sticky top-0 z-10" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
              <h2 className="font-bold text-lg" style={{ color: theme.text }}>阅读设置</h2>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-full hover:bg-black/5 active:bg-black/10 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: theme.text }}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-8 overflow-y-auto h-[calc(100%-64px)] pb-20">
              {/* 字体大小 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[15px] font-medium" style={{ color: theme.text }}>字体大小</span>
                  <span className="text-[13px] font-bold px-2 py-1 rounded-md" style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}>
                    {settings.fontSize}px
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs opacity-50">A</span>
                  <input 
                    type="range" 
                    min="14" 
                    max="24" 
                    value={settings.fontSize}
                    onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    style={{ accentColor: theme.accent }}
                  />
                  <span className="text-lg opacity-50">A</span>
                </div>
              </div>
              
              {/* 行间距 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[15px] font-medium" style={{ color: theme.text }}>行间距</span>
                  <span className="text-[13px] opacity-60">{settings.lineHeight}</span>
                </div>
                <input 
                  type="range" 
                  min="1.4" 
                  max="2.4" 
                  step="0.1"
                  value={settings.lineHeight}
                  onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: theme.accent }}
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
                          ? 'border-blue-500 bg-blue-50/30 text-blue-600 font-medium' 
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                      style={{ 
                        fontFamily: f.value,
                        color: settings.fontFamily === f.value ? theme.accent : theme.text,
                        borderColor: settings.fontFamily === f.value ? theme.accent : undefined,
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
                <div className="grid grid-cols-4 gap-3">
                  {THEMES.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => updateSetting('theme', i)}
                      className={`aspect-square rounded-2xl border-2 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 ${
                        settings.theme === i ? 'border-blue-500 scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ 
                        backgroundColor: t.bg,
                        borderColor: settings.theme === i ? t.accent : undefined,
                      }}
                    >
                      <span className="text-xl font-bold" style={{ color: t.accent }}>Aa</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 对齐 */}
              <div className="space-y-3">
                <span className="text-[15px] font-medium block" style={{ color: theme.text }}>文字对齐</span>
                <div className="flex bg-gray-100/50 rounded-xl p-1">
                  <button
                    onClick={() => updateSetting('textAlign', 'left')}
                    className={`flex-1 py-2.5 text-[13px] rounded-lg transition-all font-medium ${
                      settings.textAlign === 'left' ? 'bg-white shadow-sm' : 'opacity-50'
                    }`}
                    style={{ color: theme.text }}
                  >
                    左对齐
                  </button>
                  <button
                    onClick={() => updateSetting('textAlign', 'justify')}
                    className={`flex-1 py-2.5 text-[13px] rounded-lg transition-all font-medium ${
                      settings.textAlign === 'justify' ? 'bg-white shadow-sm' : 'opacity-50'
                    }`}
                    style={{ color: theme.text }}
                  >
                    两端对齐
                  </button>
                </div>
              </div>
              
              {/* 段间距 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[15px] font-medium" style={{ color: theme.text }}>段间距</span>
                  <span className="text-[13px] opacity-60">{settings.paragraphSpacing}em</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2" 
                  step="0.1"
                  value={settings.paragraphSpacing}
                  onChange={(e) => updateSetting('paragraphSpacing', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: theme.accent }}
                />
              </div>
              
              {/* 自动隐藏 */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50">
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
        </>
      )}
    </div>
  );
};