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
  isFirstParagraph?: boolean;
}

interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  theme: number;
  pageMode: 'scroll' | 'page';
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
  { name: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { name: '宋体', value: '"Noto Serif SC", "SimSun", serif' },
  { name: '黑体', value: '"Noto Sans SC", "SimHei", sans-serif' },
  { name: '楷体', value: '"KaiTi", "STKaiti", serif' },
];

const THEMES = [
  { name: '纯白', bg: '#ffffff', text: '#2c3e50', accent: '#3b82f6', border: '#e5e7eb' },
  { name: '乳白', bg: '#fafafa', text: '#374151', accent: '#2563eb', border: '#e5e7eb' },
  { name: '深夜', bg: '#0f172a', text: '#e2e8f0', accent: '#60a5fa', border: '#1e293b' },
  { name: '护眼', bg: '#f5f5f0', text: '#2d3748', accent: '#4a5568', border: '#e2e2d8' },
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
  let currentChapter = '';
  let chapterIndex = -1;
  let globalIndex = 0;
  
  const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+[章节篇部卷集]|[序终][章篇]|\d+[、.]\s*|【.*?】|Chapter\s+\d+)/i;
  
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    if (chapterRegex.test(trimmed) && trimmed.length < 80) {
      currentChapter = trimmed;
      chapterIndex++;
      items.push({
        type: 'title',
        content: trimmed,
        chapterIndex,
        globalIndex: globalIndex++,
      });
    } else if (trimmed) {
      if (chapterIndex === -1) {
        chapterIndex = 0;
        currentChapter = '开始';
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
        isFirstParagraph: !items.some(i => i.chapterIndex === chapterIndex && i.type === 'paragraph'),
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
    pageMode: 'scroll',
    lineHeight: 1.8,
    letterSpacing: 0,
    textAlign: 'justify',
    paragraphSpacing: 1,
    autoHideHeader: true,
  }),
  saveSettings: (s: ReaderSettings) => {
    try { localStorage.setItem(`reader-settings`, JSON.stringify(s)); } catch {}
  },
  loadProgress: (bookId: string) => {
    try {
      return JSON.parse(localStorage.getItem(`reader-progress-${bookId}`) || '{"index":0}');
    } catch { return { index: 0 }; }
  },
  saveProgress: (bookId: string, p: { index: number }) => {
    try { localStorage.setItem(`reader-progress-${bookId}`, JSON.stringify({ ...p, time: Date.now() })); } catch {}
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
  
  const parentRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<number>();
  
  const theme = THEMES[settings.theme] || THEMES[0];
  
  // 虚拟滚动配置 - 支持大文件
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => settings.fontSize * settings.lineHeight * 1.5, [settings.fontSize, settings.lineHeight]),
    overscan: 5,
  });
  
  // 恢复进度
  useEffect(() => {
    const saved = storage.loadProgress(bookId);
    if (saved.index < items.length) {
      virtualizer.scrollToIndex(saved.index, { align: 'start', behavior: 'auto' });
    }
  }, [bookId, items.length, virtualizer]);
  
  // 保存进度
  useEffect(() => {
    const [firstVisible] = virtualizer.getVirtualItems();
    if (firstVisible) {
      const item = items[firstVisible.index];
      if (item) {
        setCurrentChapter(item.chapterIndex);
        storage.saveProgress(bookId, { index: firstVisible.index });
      }
    }
  }, [virtualizer.getVirtualItems()[0]?.index, items, bookId]);
  
  // UI自动隐藏
  useEffect(() => {
    if (!settings.autoHideHeader || showSettings || showChapters) return;
    uiTimeoutRef.current = window.setTimeout(() => setShowUI(false), 3000);
    return () => clearTimeout(uiTimeoutRef.current);
  }, [settings.autoHideHeader, showSettings, showChapters, showUI]);
  
  // 全屏切换
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!isFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(!isFullscreen);
    }
  }, [isFullscreen]);
  
  // 章节跳转
  const chapters = useMemo(() => {
    const chs: { index: number; title: string }[] = [];
    items.forEach((item, idx) => {
      if (item.type === 'title') {
        chs.push({ index: idx, title: item.content });
      }
    });
    return chs.length > 0 ? chs : [{ index: 0, title: '全文' }];
  }, [items]);
  
  const goToChapter = useCallback((index: number) => {
    const target = items.findIndex(i => i.chapterIndex === index && i.type === 'title');
    if (target !== -1) {
      virtualizer.scrollToIndex(target, { align: 'start', behavior: 'smooth' });
      setShowChapters(false);
      setShowUI(true);
    }
  }, [items, virtualizer]);
  
  // 点击中央切换UI
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    // 左右30%翻页，中间40%切换UI
    if (x > width * 0.3 && x < width * 0.7) {
      if (!showSettings && !showChapters) {
        setShowUI(v => !v);
        if (!showUI) {
          // 即将显示UI，重置自动隐藏
          clearTimeout(uiTimeoutRef.current);
        }
      }
    } else if (x <= width * 0.3) {
      // 上一页
      const current = virtualizer.scrollElement?.scrollTop || 0;
      virtualizer.scrollElement?.scrollTo({ top: current - window.innerHeight * 0.9, behavior: 'smooth' });
    } else {
      // 下一页
      const current = virtualizer.scrollElement?.scrollTop || 0;
      virtualizer.scrollElement?.scrollTo({ top: current + window.innerHeight * 0.9, behavior: 'smooth' });
    }
  }, [showSettings, showChapters, showUI, virtualizer]);
  
  const updateSetting = useCallback(<K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    storage.saveSettings(newSettings);
    virtualizer.measure();
  }, [settings, virtualizer]);
  
  // 渲染行
  const renderItem = (index: number) => {
    const item = items[index];
    if (!item) return null;
    
    const isTitle = item.type === 'title';
    const baseStyle: React.CSSProperties = {
      fontSize: isTitle ? `${settings.fontSize * 1.2}px` : `${settings.fontSize}px`,
      fontFamily: settings.fontFamily,
      lineHeight: settings.lineHeight,
      letterSpacing: `${settings.letterSpacing}px`,
      textAlign: isTitle ? 'center' : settings.textAlign,
      color: theme.text,
      fontWeight: isTitle ? 'bold' : 'normal',
      marginBottom: isTitle ? '2em' : `${settings.paragraphSpacing}em`,
      marginTop: isTitle ? '2em' : '0',
      padding: '0 24px',
      textIndent: !isTitle && settings.textAlign !== 'center' ? '2em' : '0',
    };
    
    return (
      <div key={index} style={baseStyle} data-index={index}>
        {item.content}
      </div>
    );
  };
  
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: theme.bg }}>
      {/* 顶部栏 - 简约设计 */}
      <header 
        className={`absolute top-0 left-0 right-0 z-30 transition-transform duration-300 ease-out ${
          showUI ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ 
          backgroundColor: `${theme.bg}f8`, 
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="h-14 px-4 flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button 
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-black/5 active:bg-black/10 transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.text }}>
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0 text-center">
              <h1 className="text-[15px] font-semibold truncate" style={{ color: theme.text, letterSpacing: '-0.01em' }}>
                {title}
              </h1>
              <p className="text-xs truncate opacity-50" style={{ color: theme.text }}>
                {chapters[currentChapter]?.title || ''}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowChapters(true)}
              className="p-2 rounded-full hover:bg-black/5 active:bg-black/10 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.text }}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
            <button 
              onClick={toggleFullscreen}
              className="p-2 rounded-full hover:bg-black/5 active:bg-black/10 transition-colors"
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
              className="p-2 rounded-full hover:bg-black/5 active:bg-black/10 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme.text }}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      
      {/* 阅读区域 - 虚拟滚动 */}
      <div 
        ref={parentRef}
        className="flex-1 overflow-auto relative"
        style={{ 
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
        }}
        onClick={handleContentClick}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
            paddingTop: showUI ? '56px' : '0',
            paddingBottom: showUI ? '64px' : '24px',
            transition: 'padding 0.3s ease',
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
        
        {/* 点击区域提示（仅调试，生产环境可移除） */}
        {!showUI && !showSettings && !showChapters && (
          <div className="absolute inset-0 z-20 flex pointer-events-none">
            <div className="w-[30%] h-full" />
            <div className="w-[40%] h-full flex items-center justify-center opacity-0 hover:opacity-10 transition-opacity">
              <div className="w-16 h-16 rounded-full bg-gray-400" />
            </div>
            <div className="w-[30%] h-full" />
          </div>
        )}
      </div>
      
      {/* 底部栏 - 极简进度条 */}
      <footer 
        className={`absolute bottom-0 left-0 right-0 z-30 transition-transform duration-300 ease-out ${
          showUI ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ 
          backgroundColor: `${theme.bg}f8`, 
          backdropFilter: 'blur(20px)',
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <div className="h-16 px-6 flex items-center justify-between max-w-4xl mx-auto gap-6">
          <button 
            onClick={() => {
              const target = items.findIndex(i => i.chapterIndex === currentChapter - 1 && i.type === 'title');
              if (target !== -1) virtualizer.scrollToIndex(target, { align: 'start', behavior: 'smooth' });
            }}
            disabled={currentChapter === 0}
            className="text-sm font-medium disabled:opacity-30 transition-opacity hover:opacity-70"
            style={{ color: theme.text }}
          >
            上一章
          </button>
          
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex justify-between text-xs opacity-40" style={{ color: theme.text }}>
              <span>{Math.round((virtualizer.scrollOffset / Math.max(1, virtualizer.getTotalSize())) * 100)}%</span>
              <span>{currentChapter + 1} / {chapters.length}</span>
            </div>
            <div className="relative h-1 bg-gray-200 rounded-full overflow-hidden cursor-pointer group">
              <div 
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-150"
                style={{ 
                  width: `${(virtualizer.scrollOffset / Math.max(1, virtualizer.getTotalSize())) * 100}%`,
                  backgroundColor: theme.accent,
                  opacity: 0.8,
                }}
              />
              <input 
                type="range" 
                min={0} 
                max={items.length - 1} 
                step={1}
                value={Math.floor((virtualizer.scrollOffset / Math.max(1, virtualizer.getTotalSize())) * items.length)}
                onChange={(e) => {
                  virtualizer.scrollToIndex(parseInt(e.target.value), { align: 'start', behavior: 'smooth' });
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
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
            className="text-sm font-medium disabled:opacity-30 transition-opacity hover:opacity-70"
            style={{ color: theme.text }}
          >
            下一章
          </button>
        </div>
      </footer>
      
      {/* 目录面板 */}
      {showChapters && (
        <div className="absolute inset-0 z-40 flex pointer-events-none">
          <div 
            className="w-80 max-w-[80%] h-full shadow-2xl pointer-events-auto"
            style={{ backgroundColor: theme.bg }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: theme.border }}>
              <h2 className="font-bold text-lg" style={{ color: theme.text }}>目录</h2>
              <button 
                onClick={() => setShowChapters(false)}
                className="p-2 rounded-full hover:bg-black/5"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: theme.text }}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto h-[calc(100%-64px)]">
              {chapters.map((ch, idx) => (
                <button
                  key={idx}
                  onClick={() => goToChapter(idx)}
                  className={`w-full text-left px-6 py-4 border-b transition-colors ${
                    currentChapter === idx ? 'bg-blue-50/50' : 'hover:bg-black/[0.02]'
                  }`}
                  style={{ borderColor: theme.border }}
                >
                  <span 
                    className={`text-sm ${currentChapter === idx ? 'font-semibold' : 'opacity-70'}`}
                    style={{ color: currentChapter === idx ? theme.accent : theme.text }}
                  >
                    {ch.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-black/20 backdrop-blur-sm pointer-events-auto" onClick={() => setShowChapters(false)} />
        </div>
      )}
      
      {/* 设置面板 */}
      {showSettings && (
        <div className="absolute inset-0 z-40 flex justify-end pointer-events-none">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto" onClick={() => setShowSettings(false)} />
          <div 
            className="w-80 max-w-[80%] h-full shadow-2xl pointer-events-auto overflow-y-auto"
            style={{ backgroundColor: theme.bg }}
          >
            <div className="p-4 border-b flex items-center justify-between sticky top-0 z-10" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
              <h2 className="font-bold text-lg" style={{ color: theme.text }}>阅读设置</h2>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-full hover:bg-black/5"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: theme.text }}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-8">
              {/* 字体大小 */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-medium" style={{ color: theme.text }}>
                  <span>字体大小</span>
                  <span style={{ color: theme.accent }}>{settings.fontSize}px</span>
                </div>
                <input 
                  type="range" min="14" max="24" 
                  value={settings.fontSize}
                  onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              
              {/* 行间距 */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-medium" style={{ color: theme.text }}>
                  <span>行间距</span>
                  <span style={{ color: theme.accent }}>{settings.lineHeight}</span>
                </div>
                <input 
                  type="range" min="1.4" max="2.2" step="0.1"
                  value={settings.lineHeight}
                  onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              
              {/* 字体 */}
              <div className="space-y-3">
                <span className="text-sm font-medium" style={{ color: theme.text }}>字体</span>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(f => (
                    <button
                      key={f.name}
                      onClick={() => updateSetting('fontFamily', f.value)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                        settings.fontFamily === f.value 
                          ? 'border-blue-500 bg-blue-50 text-blue-600 font-medium' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={{ fontFamily: f.value }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 主题 */}
              <div className="space-y-3">
                <span className="text-sm font-medium" style={{ color: theme.text }}>主题</span>
                <div className="grid grid-cols-4 gap-3">
                  {THEMES.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => updateSetting('theme', i)}
                      className={`aspect-square rounded-xl border-2 transition-all flex items-center justify-center ${
                        settings.theme === i ? 'border-blue-500 scale-110 shadow-md' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: t.bg }}
                    >
                      <span className="text-lg font-bold" style={{ color: t.text }}>A</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 对齐 */}
              <div className="space-y-3">
                <span className="text-sm font-medium" style={{ color: theme.text }}>对齐方式</span>
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => updateSetting('textAlign', 'left')}
                    className={`flex-1 py-2 text-sm rounded-md transition-all ${
                      settings.textAlign === 'left' ? 'bg-white shadow-sm font-medium' : 'opacity-60'
                    }`}
                    style={{ color: theme.text }}
                  >
                    左对齐
                  </button>
                  <button
                    onClick={() => updateSetting('textAlign', 'justify')}
                    className={`flex-1 py-2 text-sm rounded-md transition-all ${
                      settings.textAlign === 'justify' ? 'bg-white shadow-sm font-medium' : 'opacity-60'
                    }`}
                    style={{ color: theme.text }}
                  >
                    两端对齐
                  </button>
                </div>
              </div>
              
              {/* 自动隐藏 */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium" style={{ color: theme.text }}>自动隐藏工具栏</span>
                <button 
                  onClick={() => updateSetting('autoHideHeader', !settings.autoHideHeader)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.autoHideHeader ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${settings.autoHideHeader ? 'translate-x-6' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};