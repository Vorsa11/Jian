import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

// ============================== 类型声明 ==============================
declare global {
  interface Window {
    __reader_flipPage?: (direction: 'next' | 'prev') => void;
    __reader_goToPagePercent?: (percent: number) => void;
  }
}

interface Chapter {
  title: string;
  index: number;
  startIndex: number;
  endIndex: number;
  paragraphs: string[];
}

interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  theme: number;
  pageMode: 'scroll' | 'page';
  lineHeight: number;
  letterSpacing: number;
  textAlign: 'left' | 'center' | 'justify';
  paragraphSpacing: number;
  autoHideHeader: boolean;
}

interface Progress {
  chapter: number;
  scrollTop: number;
  timestamp: number;
}

interface TextReaderProps {
  content: string;
  title: string;
  bookId: string;
  onClose: () => void;
}

// ============================== 配置 ==============================
const FONTS = [
  { name: '系统默认', value: 'system-ui, -apple-system, sans-serif' },
  { name: '宋体', value: '"Noto Serif SC", "SimSun", serif' },
  { name: '黑体', value: '"Noto Sans SC", "SimHei", sans-serif' },
  { name: '楷体', value: '"KaiTi", "STKaiti", serif' },
  { name: '仿宋', value: '"FangSong", "STFangsong", serif' },
  { name: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
];

const THEMES = [
  { name: '默认白', bg: '#ffffff', text: '#1a1a1a', border: '#e5e5e5' },
  { name: '羊皮纸', bg: '#f5e6c8', text: '#3d3d3d', border: '#e0d0b0' },
  { name: '护眼绿', bg: '#c7edcc', text: '#2d5a27', border: '#b0d9b5' },
  { name: '深夜黑', bg: '#1a1a1a', text: '#b8b8b8', border: '#333333' },
  { name: '淡蓝色', bg: '#e8f4fc', text: '#1a3a52', border: '#d0e4f0' },
  { name: '淡粉色', bg: '#fce8f0', text: '#521a3a', border: '#f0d0e0' },
  { name: '咖啡色', bg: '#3d2914', text: '#d4c4a8', border: '#5a4020' },
  { name: '墨绿色', bg: '#0d2818', text: '#90c695', border: '#1a4a30' },
];

// ============================== 工具函数 ==============================
function cleanNovelContent(rawText: string): string {
  if (!rawText) return '';
  let text = rawText;
  
  const adPatterns = [
    /本书为八零电子书网.*?存储服务/gi,
    /找好书，看好书.*?请加QQ群/gi,
    /八零电子书\s*www\.txt80\.com/gi,
    /小说下载尽在\s*http:\/\/www\.txt80\.com/gi,
    /手机访问\s*m\.txt80\.com/gi,
    /【本作品来自互联网.*?】/gi,
    /内容版权归作者所有/gi,
    /用户上传之内容开始/gi,
    /---------------------------/g,
  ];

  adPatterns.forEach((pattern) => {
    text = text.replace(pattern, '');
  });

  text = text.replace(/\n{4,}/g, '\n\n\n');
  return text.trim();
}

function parseChapters(text: string): Chapter[] {
  if (!text) return [];
  
  const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+[章节篇部]|Chapter\s+\d+|\d+\.|[【].*?[】])\s*[:\s]*([^\n]*)/im;
  
  const rawChapters: { title: string; content: string }[] = [];
  let currentContent: string[] = [];
  let currentTitle = '前言';
  
  const lines = text.split('\n');
  
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (chapterRegex.test(trimmed) && trimmed.length < 50) {
      if (currentContent.length > 0) {
        rawChapters.push({
          title: currentTitle,
          content: currentContent.join('\n'),
        });
      }
      currentTitle = trimmed.slice(0, 50) || `第${rawChapters.length + 1}章`;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  });
  
  if (currentContent.length > 0 || rawChapters.length === 0) {
    rawChapters.push({
      title: currentTitle,
      content: currentContent.join('\n'),
    });
  }
  
  let globalIndex = 0;
  return rawChapters.map((c, i) => {
    const paragraphs = c.content
      .split(/\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const startIndex = globalIndex;
    globalIndex += paragraphs.length;
    
    return {
      title: c.title,
      index: i,
      startIndex,
      endIndex: globalIndex - 1,
      paragraphs,
    };
  });
}

function loadSettings(): ReaderSettings {
  const defaults: ReaderSettings = {
    fontSize: 18,
    fontFamily: FONTS[0].value,
    theme: 0,
    pageMode: 'scroll',
    lineHeight: 1.8,
    letterSpacing: 0.5,
    textAlign: 'justify',
    paragraphSpacing: 1.2,
    autoHideHeader: true,
  };

  try {
    const saved = localStorage.getItem('text-reader-settings-v3');
    if (saved) return { ...defaults, ...JSON.parse(saved) };
  } catch (e) {}
  return defaults;
}

function saveSettings(settings: ReaderSettings) {
  try {
    localStorage.setItem('text-reader-settings-v3', JSON.stringify(settings));
  } catch (e) {}
}

function getSavedProgress(bookId: string): Progress {
  try {
    const saved = localStorage.getItem(`reader-progress-v7-${bookId}`);
    if (saved) return { ...JSON.parse(saved), timestamp: Date.now() };
  } catch (e) {}
  return { chapter: 0, scrollTop: 0, timestamp: Date.now() };
}

function saveProgress(bookId: string, progress: Omit<Progress, 'timestamp'>) {
  try {
    localStorage.setItem(`reader-progress-v7-${bookId}`, JSON.stringify({
      ...progress,
      timestamp: Date.now(),
    }));
  } catch (e) {}
}

// ============================== 滚动模式组件 ==============================
interface ScrollModeProps {
  chapter: Chapter;
  settings: ReaderSettings;
  currentTheme: typeof THEMES[0];
  onProgressChange: (progress: number) => void;
  onScroll: (scrollTop: number) => void;
  initialScrollTop: number;
}

const ScrollModeReader: React.FC<ScrollModeProps> = ({
  chapter,
  settings,
  currentTheme,
  onProgressChange,
  onScroll,
  initialScrollTop,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const virtualizer = useVirtualizer({
    count: chapter.paragraphs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => settings.fontSize * settings.lineHeight * 2, [settings.fontSize, settings.lineHeight]),
    overscan: 3,
    measureElement: useCallback((el: HTMLElement) => el.getBoundingClientRect().height, []),
  });

  useEffect(() => {
    if (parentRef.current && initialScrollTop > 0 && !mounted) {
      parentRef.current.scrollTop = initialScrollTop;
      setMounted(true);
    }
  }, [initialScrollTop, mounted]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      const progress = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      onProgressChange(Math.min(100, Math.max(0, progress)));
      onScroll(scrollTop);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    
    return () => el.removeEventListener('scroll', handleScroll);
  }, [onProgressChange, onScroll]);

  useEffect(() => {
    virtualizer.measure();
  }, [settings.fontSize, settings.lineHeight, settings.fontFamily, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="w-full h-full overflow-y-auto overflow-x-hidden relative"
      style={{ scrollBehavior: 'smooth' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const paragraph = chapter.paragraphs[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                padding: `0 1.5rem`,
              }}
            >
              <p
                style={{
                  fontSize: `${settings.fontSize}px`,
                  fontFamily: settings.fontFamily,
                  lineHeight: settings.lineHeight,
                  letterSpacing: `${settings.letterSpacing}px`,
                  textAlign: settings.textAlign,
                  color: currentTheme.text,
                  marginBottom: `${settings.paragraphSpacing}em`,
                  textIndent: settings.textAlign === 'justify' || settings.textAlign === 'left' ? '2em' : '0',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {paragraph}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================== 翻页模式组件 ==============================
interface PageModeProps {
  chapter: Chapter;
  settings: ReaderSettings;
  currentTheme: typeof THEMES[0];
  onProgressChange: (progress: number) => void;
  onPageChange: (pageIndex: number, totalPages: number) => void;
  initialPage?: number;
}

const PageModeReader: React.FC<PageModeProps> = ({
  chapter,
  settings,
  currentTheme,
  onProgressChange,
  onPageChange,
  initialPage = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const pageHeightRef = useRef(0);

  useEffect(() => {
    const updateMetrics = () => {
      if (containerRef.current) {
        const height = containerRef.current.clientHeight;
        pageHeightRef.current = height;
        const estimatedHeight = chapter.paragraphs.length * settings.fontSize * settings.lineHeight * 1.5;
        const pages = Math.max(1, Math.ceil(estimatedHeight / height));
        setTotalPages(pages);
        onPageChange(currentPage, pages);
        onProgressChange((currentPage / Math.max(1, pages - 1)) * 100);
      }
    };

    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, [chapter.paragraphs.length, settings.fontSize, settings.lineHeight, currentPage, onPageChange, onProgressChange]);

  useEffect(() => {
    window.__reader_goToPagePercent = (percent: number) => {
      const targetPage = Math.floor(percent * (totalPages - 1));
      setCurrentPage(Math.max(0, Math.min(targetPage, totalPages - 1)));
    };
    return () => { delete window.__reader_goToPagePercent; };
  }, [totalPages]);

  const flipPage = useCallback((direction: 'next' | 'prev') => {
    setCurrentPage(prev => {
      const newPage = direction === 'next' 
        ? Math.min(prev + 1, totalPages - 1)
        : Math.max(prev - 1, 0);
      return newPage;
    });
  }, [totalPages]);

  useEffect(() => {
    window.__reader_flipPage = flipPage;
    return () => { delete window.__reader_flipPage; };
  }, [flipPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        flipPage('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        flipPage('prev');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flipPage]);

  const contentTransform = `translateY(-${currentPage * 100}%)`;

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full overflow-hidden relative"
      style={{ perspective: '1000px' }}
    >
      <div
        style={{
          transform: contentTransform,
          transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
          height: '100%',
          width: '100%',
        }}
      >
        <div className="h-full w-full overflow-hidden px-6 py-8">
          {chapter.paragraphs.map((para, idx) => (
            <p
              key={idx}
              style={{
                fontSize: `${settings.fontSize}px`,
                fontFamily: settings.fontFamily,
                lineHeight: settings.lineHeight,
                letterSpacing: `${settings.letterSpacing}px`,
                textAlign: settings.textAlign,
                color: currentTheme.text,
                marginBottom: `${settings.paragraphSpacing}em`,
                textIndent: settings.textAlign === 'justify' || settings.textAlign === 'left' ? '2em' : '0',
                wordBreak: 'break-word',
              }}
            >
              {para}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================== 主组件 ==============================
export function TextReader({ content: rawContent, title, bookId, onClose }: TextReaderProps) {
  const cleanedContent = useMemo(() => cleanNovelContent(rawContent), [rawContent]);
  const chapters = useMemo(() => parseChapters(cleanedContent), [cleanedContent]);
  
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings());
  const [currentChapter, setCurrentChapter] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  
  const scrollRef = useRef(0);
  const pageRef = useRef(0);
  const headerTimerRef = useRef<number | undefined>(undefined);
  const touchStartRef = useRef({ x: 0, y: 0 });

  const currentTheme = THEMES[settings.theme] || THEMES[0];
  const currentChapterData = chapters[currentChapter] || chapters[0];

  useEffect(() => {
    if (chapters.length === 0) return;
    const saved = getSavedProgress(bookId);
    if (saved.chapter >= 0 && saved.chapter < chapters.length) {
      setCurrentChapter(saved.chapter);
      scrollRef.current = saved.scrollTop || 0;
    }
  }, [bookId, chapters]);

  useEffect(() => {
    const update = () => {
      setCurrentTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!settings.autoHideHeader || isImmersive || showSettings || showChapters) return;
    
    const showHeaderTimer = () => {
      setShowHeader(true);
      if (headerTimerRef.current) clearTimeout(headerTimerRef.current);
      headerTimerRef.current = window.setTimeout(() => {
        if (!showSettings && !showChapters) setShowHeader(false);
      }, 3000);
    };

    showHeaderTimer();
    window.addEventListener('click', showHeaderTimer);
    window.addEventListener('touchstart', showHeaderTimer);
    
    return () => {
      if (headerTimerRef.current) clearTimeout(headerTimerRef.current);
      window.removeEventListener('click', showHeaderTimer);
      window.removeEventListener('touchstart', showHeaderTimer);
    };
  }, [settings.autoHideHeader, isImmersive, showSettings, showChapters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveProgress(bookId, {
        chapter: currentChapter,
        scrollTop: scrollRef.current,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [currentChapter, bookId]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const goToChapter = useCallback((index: number) => {
    if (index < 0 || index >= chapters.length) return;
    setCurrentChapter(index);
    scrollRef.current = 0;
    pageRef.current = 0;
    setShowChapters(false);
    setProgressPercent(0);
  }, [chapters.length]);

  const prevChapter = useCallback(() => {
    if (currentChapter > 0) goToChapter(currentChapter - 1);
  }, [currentChapter, goToChapter]);

  const nextChapter = useCallback(() => {
    if (currentChapter < chapters.length - 1) goToChapter(currentChapter + 1);
  }, [currentChapter, chapters.length, goToChapter]);

  const flipPage = useCallback((direction: 'next' | 'prev') => {
    if (window.__reader_flipPage) {
      window.__reader_flipPage(direction);
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = touchStartRef.current.x - e.changedTouches[0].clientX;
    const dy = touchStartRef.current.y - e.changedTouches[0].clientY;
    
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (settings.pageMode === 'page') {
        flipPage(dx > 0 ? 'next' : 'prev');
      } else {
        const container = document.querySelector('.reader-scroll-container');
        if (container) {
          container.scrollBy({ top: dx > 0 ? 300 : -300, behavior: 'smooth' });
        }
      }
    }
  }, [settings.pageMode, flipPage]);

  const onContentClick = useCallback((e: React.MouseEvent) => {
    if (showSettings || showChapters) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    if (x < width * 0.25) {
      if (settings.pageMode === 'page') {
        flipPage('prev');
      } else {
        const container = document.querySelector('.reader-scroll-container');
        if (container) container.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
      }
    } else if (x > width * 0.75) {
      if (settings.pageMode === 'page') {
        flipPage('next');
      } else {
        const container = document.querySelector('.reader-scroll-container');
        if (container) container.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      }
    } else {
      setShowHeader(prev => !prev);
    }
  }, [settings.pageMode, showSettings, showChapters, flipPage]);

  const onProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    
    if (settings.pageMode === 'page') {
      if (window.__reader_goToPagePercent) {
        window.__reader_goToPagePercent(percent);
      }
    } else {
      const container = document.querySelector('.reader-scroll-container');
      if (container) {
        const maxScroll = container.scrollHeight - container.clientHeight;
        container.scrollTop = maxScroll * percent;
      }
    }
  }, [settings.pageMode]);

  const updateSetting = useCallback(<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  if (!currentChapterData) {
    return <div className="fixed inset-0 flex items-center justify-center bg-white">加载中...</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: currentTheme.bg }}>
      {/* 时间显示 - 修复未使用变量 */}
      <div className="fixed top-2 right-4 z-50 text-xs opacity-50 pointer-events-none" style={{ color: currentTheme.text }}>
        {currentTime}
      </div>

      {/* 顶部栏 */}
      <header
        className={`flex-none flex items-center justify-between px-4 py-3 border-b transition-transform duration-300 ${
          showHeader || showSettings || showChapters ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ 
          backgroundColor: currentTheme.bg, 
          borderColor: currentTheme.border,
          color: currentTheme.text 
        }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-medium truncate">{title}</h1>
            <p className="text-xs opacity-60 truncate">{currentChapterData.title}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsImmersive(!isImmersive)}
            className="p-2 hover:bg-black/5 rounded-full transition-colors"
            title="沉浸模式"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
          <button 
            onClick={() => setShowChapters(true)}
            className="p-2 hover:bg-black/5 rounded-full transition-colors"
            title="目录"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-black/5 rounded-full transition-colors"
            title="设置"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* 内容区域 */}
      <div 
        className="flex-1 relative overflow-hidden"
        onClick={onContentClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {settings.pageMode === 'scroll' ? (
          <div className="reader-scroll-container h-full">
            <ScrollModeReader
              chapter={currentChapterData}
              settings={settings}
              currentTheme={currentTheme}
              onProgressChange={setProgressPercent}
              onScroll={(top) => { scrollRef.current = top; }}
              initialScrollTop={scrollRef.current}
            />
          </div>
        ) : (
          <PageModeReader
            chapter={currentChapterData}
            settings={settings}
            currentTheme={currentTheme}
            onProgressChange={setProgressPercent}
            onPageChange={(page, _total) => { pageRef.current = page; }}
            initialPage={pageRef.current}
          />
        )}
        
        {/* 沉浸模式覆盖层 */}
        {isImmersive && (
          <div className="absolute top-4 right-4 flex gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); prevChapter(); }}
              disabled={currentChapter === 0}
              className="w-10 h-10 rounded-full bg-black/20 backdrop-blur flex items-center justify-center disabled:opacity-30"
              style={{ color: currentTheme.text }}
            >
              ←
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); nextChapter(); }}
              disabled={currentChapter >= chapters.length - 1}
              className="w-10 h-10 rounded-full bg-black/20 backdrop-blur flex items-center justify-center disabled:opacity-30"
              style={{ color: currentTheme.text }}
            >
              →
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsImmersive(false); }}
              className="w-10 h-10 rounded-full bg-black/20 backdrop-blur flex items-center justify-center"
              style={{ color: currentTheme.text }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 底部进度栏 */}
      <footer 
        className={`flex-none transition-transform duration-300 ${showHeader || showSettings || showChapters ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ backgroundColor: currentTheme.bg, borderTop: `1px solid ${currentTheme.border}` }}
      >
        <div className="px-4 py-2 flex items-center gap-4">
          <span className="text-xs opacity-60 w-12 text-center" style={{ color: currentTheme.text }}>
            {Math.round(progressPercent)}%
          </span>
          <div 
            className="flex-1 h-1.5 bg-black/10 rounded-full cursor-pointer relative overflow-hidden"
            onClick={onProgressClick}
          >
            <div 
              className="absolute left-0 top-0 h-full bg-current opacity-60 transition-all"
              style={{ width: `${progressPercent}%`, color: currentTheme.text }}
            />
          </div>
          <div className="flex items-center gap-2 text-xs opacity-60" style={{ color: currentTheme.text }}>
            <button 
              onClick={prevChapter}
              disabled={currentChapter === 0}
              className="disabled:opacity-30 hover:opacity-100 transition-opacity"
            >
              上一章
            </button>
            <span>{currentChapter + 1}/{chapters.length}</span>
            <button 
              onClick={nextChapter}
              disabled={currentChapter >= chapters.length - 1}
              className="disabled:opacity-30 hover:opacity-100 transition-opacity"
            >
              下一章
            </button>
          </div>
        </div>
      </footer>

      {/* 设置面板 */}
      {showSettings && (
        <div 
          className="absolute inset-0 z-50 flex justify-end bg-black/30"
          onClick={() => setShowSettings(false)}
        >
          <div 
            className="w-80 h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right"
            style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b" style={{ borderColor: currentTheme.border }}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">阅读设置</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>字体大小</span>
                  <span>{settings.fontSize}px</span>
                </div>
                <input 
                  type="range" min="12" max="32" 
                  value={settings.fontSize}
                  onChange={e => updateSetting('fontSize', Number(e.target.value))}
                  className="w-full accent-current"
                  style={{ accentColor: currentTheme.text }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>行间距</span>
                  <span>{settings.lineHeight}</span>
                </div>
                <input 
                  type="range" min="1.2" max="2.5" step="0.1"
                  value={settings.lineHeight}
                  onChange={e => updateSetting('lineHeight', Number(e.target.value))}
                  className="w-full accent-current"
                  style={{ accentColor: currentTheme.text }}
                />
              </div>

              <div className="space-y-2">
                <span className="text-sm">字体</span>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(font => (
                    <button
                      key={font.name}
                      onClick={() => updateSetting('fontFamily', font.value)}
                      className={`px-3 py-2 text-sm rounded border transition-colors ${
                        settings.fontFamily === font.value ? 'border-current bg-current/10' : 'border-transparent bg-black/5'
                      }`}
                      style={{ fontFamily: font.value }}
                    >
                      {font.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm">背景主题</span>
                <div className="grid grid-cols-4 gap-2">
                  {THEMES.map((theme, idx) => (
                    <button
                      key={idx}
                      onClick={() => updateSetting('theme', idx)}
                      className={`h-10 rounded-lg border-2 transition-all ${
                        settings.theme === idx ? 'border-current scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: theme.bg }}
                      title={theme.name}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm">阅读模式</span>
                <div className="flex rounded-lg bg-black/5 p-1">
                  {[
                    { name: '滚动', value: 'scroll' },
                    { name: '翻页', value: 'page' }
                  ].map(mode => (
                    <button
                      key={mode.value}
                      onClick={() => updateSetting('pageMode', mode.value as 'scroll' | 'page')}
                      className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                        settings.pageMode === mode.value ? 'bg-white shadow-sm' : 'opacity-60'
                      }`}
                    >
                      {mode.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm">文字对齐</span>
                <div className="flex rounded-lg bg-black/5 p-1">
                  {[
                    { name: '左对齐', value: 'left' },
                    { name: '两端对齐', value: 'justify' }
                  ].map(align => (
                    <button
                      key={align.value}
                      onClick={() => updateSetting('textAlign', align.value as 'left' | 'justify')}
                      className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                        settings.textAlign === align.value ? 'bg-white shadow-sm' : 'opacity-60'
                      }`}
                    >
                      {align.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm">自动隐藏工具栏</span>
                <input 
                  type="checkbox" 
                  checked={settings.autoHideHeader}
                  onChange={e => updateSetting('autoHideHeader', e.target.checked)}
                  className="w-5 h-5 accent-current"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 目录面板 */}
      {showChapters && (
        <div 
          className="absolute inset-0 z-50 flex bg-black/30"
          onClick={() => setShowChapters(false)}
        >
          <div 
            className="w-80 h-full overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-left"
            style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: currentTheme.border }}>
              <h2 className="font-semibold">目录 ({chapters.length}章)</h2>
              <button onClick={() => setShowChapters(false)} className="p-2 hover:bg-black/5 rounded-full">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {chapters.map((chapter, idx) => (
                <button
                  key={idx}
                  onClick={() => goToChapter(idx)}
                  className={`w-full text-left px-4 py-3 border-b transition-colors ${
                    currentChapter === idx ? 'bg-current/10 border-l-4 border-l-current' : 'border-l-4 border-l-transparent hover:bg-black/5'
                  }`}
                  style={{ borderColor: currentTheme.border }}
                >
                  <p className={`text-sm truncate ${currentChapter === idx ? 'font-medium' : 'opacity-80'}`}>
                    {chapter.title}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}