import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';

// ============================== 类型定义 ==============================
interface Chapter {
  title: string;
  index: number;
  paragraphs: string[];
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
  brightness: number;
}

interface Progress {
  chapter: number;
  paragraph: number;
  percent: number;
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
  { name: '宋体', value: '"Noto Serif SC", "Songti SC", "SimSun", serif' },
  { name: '黑体', value: '"Noto Sans SC", "Heiti SC", "SimHei", sans-serif' },
  { name: '楷体', value: '"Kaiti SC", "KaiTi", serif' },
  { name: '圆体', value: '"PingFang SC", "Microsoft YaHei", sans-serif' },
];

const THEMES = [
  { name: '默认白', bg: '#ffffff', text: '#1a1a1a', link: '#0066cc' },
  { name: '羊皮纸', bg: '#f5e6c8', text: '#3d3d3d', link: '#8b4513' },
  { name: '护眼绿', bg: '#c7edcc', text: '#2d5a27', link: '#1e3d1a' },
  { name: '深夜黑', bg: '#1a1a1a', text: '#b8b8b8', link: '#66b3ff' },
  { name: '淡雅灰', bg: '#f2f2f2', text: '#333333', link: '#0066cc' },
  { name: '樱花粉', bg: '#fce4ec', text: '#880e4f', link: '#c2185b' },
  { name: '薄荷青', bg: '#e0f2f1', text: '#004d40', link: '#00695c' },
  { name: ' sepia', bg: '#f4ecd8', text: '#5b4636', link: '#8b4513' },
];

// ============================== 工具函数 ==============================
const cleanContent = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
};

const parseChapters = (text: string): Chapter[] => {
  if (!text) return [];
  const lines = text.split('\n');
  const chapters: Chapter[] = [];
  let currentTitle = '开始';
  let currentParagraphs: string[] = [];
  
  const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+[章节篇部卷集]|[序终][章篇]|\d+[、.]\s*|【.*?】|Chapter\s+\d+)[\s:：]*/i;
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (chapterRegex.test(trimmed) && trimmed.length < 60 && trimmed.length > 1) {
      if (currentParagraphs.length > 0) {
        chapters.push({
          title: currentTitle,
          index: chapters.length,
          paragraphs: [...currentParagraphs],
        });
      }
      currentTitle = trimmed.slice(0, 50);
      currentParagraphs = [];
    } else if (trimmed) {
      currentParagraphs.push(trimmed);
    }
  });
  
  if (currentParagraphs.length > 0 || chapters.length === 0) {
    chapters.push({
      title: currentTitle,
      index: chapters.length,
      paragraphs: currentParagraphs.length > 0 ? currentParagraphs : [text],
    });
  }
  
  return chapters;
};

const storage = {
  loadSettings: (): ReaderSettings => ({
    fontSize: 18,
    fontFamily: FONTS[0].value,
    theme: 0,
    pageMode: 'scroll',
    lineHeight: 1.8,
    letterSpacing: 0.5,
    textAlign: 'justify',
    paragraphSpacing: 0.8,
    autoHideHeader: true,
    brightness: 100,
  }),
  saveSettings: (s: ReaderSettings) => {
    try { localStorage.setItem(`reader-settings-${location.hostname}`, JSON.stringify(s)); } catch {}
  },
  loadProgress: (bookId: string): Progress => {
    try {
      const data = localStorage.getItem(`reader-progress-${bookId}`);
      return data ? JSON.parse(data) : { chapter: 0, paragraph: 0, percent: 0 };
    } catch {
      return { chapter: 0, paragraph: 0, percent: 0 };
    }
  },
  saveProgress: (bookId: string, p: Progress) => {
    try { localStorage.setItem(`reader-progress-${bookId}`, JSON.stringify({ ...p, time: Date.now() })); } catch {}
  },
};

// ============================== 主组件 ==============================
export const TextReader: React.FC<TextReaderProps> = ({ content, title, bookId, onClose }) => {
  const chapters = useMemo(() => parseChapters(cleanContent(content)), [content]);
  const [settings, setSettings] = useState<ReaderSettings>(storage.loadSettings());
  const [currentChapter, setCurrentChapter] = useState(0);
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [isAutoReading, setIsAutoReading] = useState(false);
  const [autoReadSpeed, setAutoReadSpeed] = useState(200);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const [pageTurning, setPageTurning] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const autoReadRef = useRef<number>();
  const hideUITimer = useRef<number>();
  
  const theme = THEMES[settings.theme] || THEMES[0];
  const chapter = chapters[currentChapter] || chapters[0];
  
  // 初始化
  useEffect(() => {
    const saved = storage.loadProgress(bookId);
    if (saved.chapter < chapters.length) {
      setCurrentChapter(saved.chapter);
      setCurrentParagraph(saved.paragraph);
      setTimeout(() => {
        if (settings.pageMode === 'scroll' && scrollRef.current) {
          const p = scrollRef.current.querySelector(`[data-idx="${saved.paragraph}"]`);
          p?.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      }, 100);
    }
  }, [bookId, chapters.length]);
  
  // 保存进度
  useEffect(() => {
    const timer = setTimeout(() => {
      storage.saveProgress(bookId, {
        chapter: currentChapter,
        paragraph: currentParagraph,
        percent: (currentChapter / Math.max(1, chapters.length - 1)) * 100,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [currentChapter, currentParagraph, bookId, chapters.length]);
  
  // 自动阅读
  useEffect(() => {
    if (isAutoReading) {
      autoReadRef.current = window.setInterval(() => {
        if (settings.pageMode === 'scroll') {
          scrollRef.current?.scrollBy({ top: 1, behavior: 'auto' });
        } else {
          nextPage();
        }
      }, autoReadSpeed);
    }
    return () => {
      if (autoReadRef.current) clearInterval(autoReadRef.current);
    };
  }, [isAutoReading, autoReadSpeed, settings.pageMode]);
  
  // UI自动隐藏
  useEffect(() => {
    if (!settings.autoHideHeader || isImmersive || showSettings || showChapters) return;
    if (hideUITimer.current) clearTimeout(hideUITimer.current);
    hideUITimer.current = window.setTimeout(() => setShowUI(false), 3000);
    return () => { if (hideUITimer.current) clearTimeout(hideUITimer.current); };
  }, [settings.autoHideHeader, isImmersive, showSettings, showChapters, showUI]);
  
  // 全屏切换
  const toggleImmersive = useCallback(async () => {
    const next = !isImmersive;
    setIsImmersive(next);
    setShowUI(true);
    try {
      if (next) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  }, [isImmersive]);
  
  // 章节跳转
  const goChapter = useCallback((idx: number) => {
    if (idx < 0 || idx >= chapters.length) return;
    setCurrentChapter(idx);
    setCurrentParagraph(0);
    setShowChapters(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [chapters.length]);
  
  const nextChapter = useCallback(() => {
    if (currentChapter < chapters.length - 1) goChapter(currentChapter + 1);
  }, [currentChapter, chapters.length, goChapter]);
  
  const prevChapter = useCallback(() => {
    if (currentChapter > 0) goChapter(currentChapter - 1);
  }, [currentChapter, goChapter]);
  
  // 翻页控制（优化版，使用 visibility 避免白屏）
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  const calculatePages = useCallback(() => {
    if (settings.pageMode !== 'page' || !pageRef.current) return;
    const containerHeight = pageRef.current.clientHeight;
    const contentHeight = pageRef.current.scrollHeight;
    const pages = Math.max(1, Math.ceil(contentHeight / containerHeight));
    setTotalPages(pages);
    if (currentPage >= pages) setCurrentPage(0);
  }, [settings.pageMode, currentPage]);
  
  useEffect(() => {
    calculatePages();
    window.addEventListener('resize', calculatePages);
    return () => window.removeEventListener('resize', calculatePages);
  }, [calculatePages, chapter]);
  
  const nextPage = useCallback(() => {
    if (pageTurning) return;
    if (currentPage < totalPages - 1) {
      setPageTurning(true);
      setCurrentPage(p => p + 1);
      setTimeout(() => setPageTurning(false), 300);
    } else {
      nextChapter();
      setCurrentPage(0);
    }
  }, [currentPage, totalPages, nextChapter, pageTurning]);
  
  const prevPage = useCallback(() => {
    if (pageTurning) return;
    if (currentPage > 0) {
      setPageTurning(true);
      setCurrentPage(p => p - 1);
      setTimeout(() => setPageTurning(false), 300);
    } else {
      prevChapter();
      setTimeout(() => {
        if (pageRef.current) {
          const pages = Math.ceil(pageRef.current.scrollHeight / pageRef.current.clientHeight);
          setCurrentPage(Math.max(0, pages - 1));
        }
      }, 50);
    }
  }, [currentPage, prevChapter, pageTurning]);
  
  // 触摸处理（移动端优化）
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    setTouchStart({ x: t.clientX, y: t.clientY, time: Date.now() });
  }, []);
  
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const dt = Date.now() - touchStart.time;
    const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300;
    
    if (isTap) {
      const width = window.innerWidth;
      const x = t.clientX;
      if (x < width * 0.3) {
        settings.pageMode === 'page' ? prevPage() : scrollRef.current?.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
      } else if (x > width * 0.7) {
        settings.pageMode === 'page' ? nextPage() : scrollRef.current?.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      } else {
        setShowUI(v => !v);
      }
    } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0) prevPage(); else nextPage();
    }
    setTouchStart(null);
  }, [touchStart, settings.pageMode, nextPage, prevPage]);
  
  // 滚动监听
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollPercent = target.scrollTop / (target.scrollHeight - target.clientHeight);
    const totalParagraphs = chapter.paragraphs.length;
    const currentP = Math.floor(scrollPercent * totalParagraphs);
    setCurrentParagraph(Math.min(currentP, totalParagraphs - 1));
  }, [chapter]);
  
  // 设置更新
  const updateSetting = useCallback(<K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]) => {
    setSettings(s => ({ ...s, [key]: val }));
    storage.saveSettings({ ...settings, [key]: val });
  }, [settings]);
  
  // 渲染内容样式
  const contentStyle: React.CSSProperties = {
    fontSize: `${settings.fontSize}px`,
    fontFamily: settings.fontFamily,
    lineHeight: settings.lineHeight,
    letterSpacing: `${settings.letterSpacing}px`,
    textAlign: settings.textAlign,
    color: theme.text,
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto',
    WebkitTextSizeAdjust: '100%',
  };
  
  if (!chapter) return <div className="flex items-center justify-center h-screen">加载中...</div>;
  
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ backgroundColor: theme.bg }}>
      {/* 顶部栏 */}
      <header 
        className={`flex-none flex items-center justify-between px-4 h-14 border-b border-black/10 transition-transform duration-300 ${showUI ? 'translate-y-0' : '-translate-y-full'}`}
        style={{ backgroundColor: `${theme.bg}ee`, backdropFilter: 'blur(10px)', color: theme.text }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={onClose} className="p-2 -ml-2 active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">{title}</h1>
            <p className="text-xs opacity-60 truncate">{chapter.title}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {isAutoReading && (
            <span className="text-xs px-2 py-1 rounded-full bg-current/20 animate-pulse">
              自动
            </span>
          )}
          <button onClick={() => setShowChapters(true)} className="p-2 active:scale-90 transition-transform">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </button>
          <button onClick={toggleImmersive} className="p-2 active:scale-90 transition-transform">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
          <button onClick={() => setShowSettings(true)} className="p-2 active:scale-90 transition-transform">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>
      
      {/* 阅读区域 */}
      <div className="flex-1 relative overflow-hidden">
        {settings.pageMode === 'scroll' ? (
          <div 
            ref={scrollRef}
            onScroll={onScroll}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="h-full overflow-y-auto overflow-x-hidden"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <style>{`div::-webkit-scrollbar { display: none; }`}</style>
            <div style={contentStyle}>
              {chapter.paragraphs.map((p, i) => (
                <p 
                  key={i} 
                  data-idx={i}
                  style={{ 
                    marginBottom: `${settings.paragraphSpacing}em`,
                    textIndent: settings.textAlign === 'justify' || settings.textAlign === 'left' ? '2em' : '0',
                  }}
                  className="break-words"
                >
                  {p}
                </p>
              ))}
              <div className="h-20 flex items-center justify-center opacity-40 text-sm">
                - 本章完 -
              </div>
            </div>
          </div>
        ) : (
          <div 
            ref={pageRef}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="h-full overflow-hidden relative"
          >
            <div 
              className="h-full overflow-hidden"
              style={{ 
                transform: `translateY(-${currentPage * 100}%)`,
                transition: 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
                willChange: 'transform',
              }}
            >
              <div style={contentStyle}>
                {chapter.paragraphs.map((p, i) => (
                  <p 
                    key={i} 
                    style={{ 
                      marginBottom: `${settings.paragraphSpacing}em`,
                      textIndent: settings.textAlign === 'justify' || settings.textAlign === 'left' ? '2em' : '0',
                    }}
                    className="break-words"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </div>
            
            {/* 页码指示器 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs bg-black/20 backdrop-blur text-white">
              {currentPage + 1} / {totalPages}
            </div>
          </div>
        )}
        
        {/* 沉浸模式遮罩（点击中央呼出菜单） */}
        {isImmersive && !showUI && (
          <div 
            className="absolute inset-0 z-40"
            onClick={() => setShowUI(true)}
          />
        )}
      </div>
      
      {/* 底部控制栏 */}
      <footer 
        className={`flex-none border-t border-black/10 transition-transform duration-300 ${showUI ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ backgroundColor: `${theme.bg}ee`, backdropFilter: 'blur(10px)', color: theme.text }}
      >
        <div className="px-4 py-3 flex items-center gap-4">
          <button 
            onClick={prevChapter}
            disabled={currentChapter === 0}
            className="text-xs disabled:opacity-30 font-medium px-2 py-1"
          >
            上一章
          </button>
          
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex justify-between text-xs opacity-60 px-1">
              <span>{Math.round((currentChapter / Math.max(1, chapters.length - 1)) * 100)}%</span>
              <span>{currentChapter + 1}/{chapters.length}</span>
            </div>
            <input 
              type="range" 
              min={0} 
              max={chapters.length - 1} 
              step={0.1}
              value={currentChapter}
              onChange={(e) => {
                const ch = parseFloat(e.target.value);
                const idx = Math.floor(ch);
                if (idx !== currentChapter) goChapter(idx);
              }}
              className="w-full h-1 bg-current/20 rounded-lg appearance-none cursor-pointer"
              style={{ 
                backgroundImage: `linear-gradient(${theme.text}, ${theme.text})`,
                backgroundSize: `${(currentChapter / Math.max(1, chapters.length - 1)) * 100}% 100%`,
                backgroundRepeat: 'no-repeat',
              }}
            />
          </div>
          
          <button 
            onClick={nextChapter}
            disabled={currentChapter >= chapters.length - 1}
            className="text-xs disabled:opacity-30 font-medium px-2 py-1"
          >
            下一章
          </button>
        </div>
      </footer>
      
      {/* 目录面板 */}
      {showChapters && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowChapters(false)}>
          <div 
            className="absolute left-0 top-0 bottom-0 w-80 max-w-[80vw] overflow-hidden flex flex-col animate-in slide-in-from-left duration-300"
            style={{ backgroundColor: theme.bg, color: theme.text }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-black/10 flex items-center justify-between">
              <h2 className="font-bold text-lg">目录</h2>
              <button onClick={() => setShowChapters(false)} className="p-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {chapters.map((ch, idx) => (
                <button
                  key={idx}
                  onClick={() => goChapter(idx)}
                  className={`w-full text-left px-4 py-3 border-b border-black/5 transition-colors ${
                    currentChapter === idx ? 'bg-current/10 border-l-4 border-l-current' : 'border-l-4 border-l-transparent'
                  }`}
                >
                  <span className={`text-sm ${currentChapter === idx ? 'font-semibold' : 'opacity-80'}`}>
                    {ch.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* 设置面板 */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div 
            className="absolute right-0 top-0 bottom-0 w-80 max-w-[80vw] overflow-y-auto animate-in slide-in-from-right duration-300"
            style={{ backgroundColor: theme.bg, color: theme.text }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-black/10 flex items-center justify-between sticky top-0 bg-inherit z-10">
              <h2 className="font-bold text-lg">阅读设置</h2>
              <button onClick={() => setShowSettings(false)} className="p-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div className="p-4 space-y-6">
              {/* 模式切换 */}
              <div className="flex rounded-lg bg-black/5 p-1">
                <button
                  onClick={() => updateSetting('pageMode', 'scroll')}
                  className={`flex-1 py-2 text-sm rounded-md transition-all ${settings.pageMode === 'scroll' ? 'bg-white shadow-sm font-medium' : 'opacity-60'}`}
                >
                  滚动模式
                </button>
                <button
                  onClick={() => updateSetting('pageMode', 'page')}
                  className={`flex-1 py-2 text-sm rounded-md transition-all ${settings.pageMode === 'page' ? 'bg-white shadow-sm font-medium' : 'opacity-60'}`}
                >
                  翻页模式
                </button>
              </div>
              
              {/* 字体大小 */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>字体大小</span>
                  <span>{settings.fontSize}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-60">A</span>
                  <input 
                    type="range" min="12" max="32" 
                    value={settings.fontSize}
                    onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                    className="flex-1 h-2 bg-current/20 rounded-lg appearance-none"
                    style={{ backgroundImage: `linear-gradient(${theme.text}, ${theme.text})`, backgroundSize: `${((settings.fontSize - 12) / 20) * 100}% 100%`, backgroundRepeat: 'no-repeat' }}
                  />
                  <span className="text-lg opacity-60">A</span>
                </div>
              </div>
              
              {/* 行间距 */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>行间距</span>
                  <span>{settings.lineHeight}</span>
                </div>
                <input 
                  type="range" min="1.2" max="2.5" step="0.1"
                  value={settings.lineHeight}
                  onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))}
                  className="w-full h-2 bg-current/20 rounded-lg appearance-none"
                  style={{ backgroundImage: `linear-gradient(${theme.text}, ${theme.text})`, backgroundSize: `${((settings.lineHeight - 1.2) / 1.3) * 100}% 100%`, backgroundRepeat: 'no-repeat' }}
                />
              </div>
              
              {/* 字体 */}
              <div className="space-y-2">
                <span className="text-sm font-medium">字体</span>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(f => (
                    <button
                      key={f.name}
                      onClick={() => updateSetting('fontFamily', f.value)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                        settings.fontFamily === f.value 
                          ? 'border-current bg-current/10 font-medium' 
                          : 'border-transparent bg-black/5'
                      }`}
                      style={{ fontFamily: f.value }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 主题 */}
              <div className="space-y-2">
                <span className="text-sm font-medium">背景主题</span>
                <div className="grid grid-cols-4 gap-3">
                  {THEMES.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => updateSetting('theme', i)}
                      className={`aspect-square rounded-xl border-2 transition-all flex items-center justify-center ${
                        settings.theme === i ? 'border-current scale-110 shadow-lg' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: t.bg }}
                    >
                      <span className="text-xs font-medium" style={{ color: t.text }}>Aa</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 对齐 */}
              <div className="space-y-2">
                <span className="text-sm font-medium">文字对齐</span>
                <div className="flex rounded-lg bg-black/5 p-1">
                  {[
                    { name: '左对齐', value: 'left' as const },
                    { name: '两端对齐', value: 'justify' as const }
                  ].map(a => (
                    <button
                      key={a.value}
                      onClick={() => updateSetting('textAlign', a.value)}
                      className={`flex-1 py-2 text-sm rounded-md transition-all ${settings.textAlign === a.value ? 'bg-white shadow-sm font-medium' : 'opacity-60'}`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 自动阅读 */}
              <div className="pt-4 border-t border-black/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">自动阅读</span>
                  <button 
                    onClick={() => setIsAutoReading(!isAutoReading)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isAutoReading ? 'bg-current' : 'bg-black/20'}`}
                    style={{ backgroundColor: isAutoReading ? theme.text : undefined }}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isAutoReading ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
                
                {isAutoReading && (
                  <div className="space-y-2">
                    <span className="text-xs opacity-60">速度</span>
                    <input 
                      type="range" min="50" max="500" 
                      value={autoReadSpeed}
                      onChange={(e) => setAutoReadSpeed(parseInt(e.target.value))}
                      className="w-full h-2 bg-current/20 rounded-lg appearance-none"
                      style={{ direction: 'rtl' }}
                    />
                    <div className="flex justify-between text-xs opacity-60">
                      <span>快</span>
                      <span>慢</span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* 自动隐藏 */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-medium">自动隐藏工具栏</span>
                <button 
                  onClick={() => updateSetting('autoHideHeader', !settings.autoHideHeader)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.autoHideHeader ? 'bg-current' : 'bg-black/20'}`}
                  style={{ backgroundColor: settings.autoHideHeader ? theme.text : undefined }}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.autoHideHeader ? 'translate-x-6' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};