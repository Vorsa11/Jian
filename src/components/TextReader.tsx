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
}

interface TextReaderProps {
  content: string;
  title: string;
  bookId: string;
  onClose: () => void;
}

// ============================== 蓝白主题配置 ==============================
const FONTS = [
  { name: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { name: '宋体', value: '"Noto Serif SC", "Source Han Serif SC", "SimSun", serif' },
  { name: '黑体', value: '"Noto Sans SC", "Source Han Sans SC", "SimHei", sans-serif' },
  { name: '楷体', value: '"KaiTi", "Kaiti SC", serif' },
];

const THEMES = [
  { name: '天空蓝', bg: '#f0f7ff', text: '#1e3a5f', accent: '#3b82f6', border: '#dbeafe' },
  { name: '纯净白', bg: '#ffffff', text: '#1e293b', accent: '#3b82f6', border: '#e2e8f0' },
  { name: '深夜蓝', bg: '#0f172a', text: '#e2e8f0', accent: '#60a5fa', border: '#1e293b' },
  { name: '淡蓝灰', bg: '#f8fafc', text: '#334155', accent: '#3b82f6', border: '#e2e8f0' },
];

// ============================== 工具函数 ==============================
const cleanContent = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const parseChapters = (text: string): Chapter[] => {
  if (!text) return [];
  const lines = text.split('\n');
  const chapters: Chapter[] = [];
  let currentTitle = '前言';
  let currentParagraphs: string[] = [];
  
  const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+[章节篇部卷集]|[序终][章篇]|\d+[、.]\s*|【.*?】|Chapter\s+\d+|Prologue|Epilogue)[\s:：]*/i;
  
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (chapterRegex.test(trimmed) && trimmed.length < 80) {
      if (currentParagraphs.length > 0) {
        chapters.push({
          title: currentTitle,
          index: chapters.length,
          paragraphs: [...currentParagraphs],
        });
      }
      currentTitle = trimmed.slice(0, 50) || `第${chapters.length + 1}章`;
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
    paragraphSpacing: 1,
    autoHideHeader: true,
  }),
  saveSettings: (s: ReaderSettings) => {
    try { localStorage.setItem(`reader-settings-${location.hostname}`, JSON.stringify(s)); } catch {}
  },
  loadProgress: (bookId: string) => {
    try {
      return JSON.parse(localStorage.getItem(`reader-progress-${bookId}`) || '{"chapter":0,"paragraph":0}');
    } catch { return { chapter: 0, paragraph: 0 }; }
  },
  saveProgress: (bookId: string, p: { chapter: number; paragraph: number }) => {
    try { localStorage.setItem(`reader-progress-${bookId}`, JSON.stringify({ ...p, time: Date.now() })); } catch {}
  },
};

// ============================== 主组件 ==============================
export const TextReader: React.FC<TextReaderProps> = ({ content, title, bookId, onClose }) => {
  const chapters = useMemo(() => parseChapters(cleanContent(content)), [content]);
  const [settings, setSettings] = useState<ReaderSettings>(storage.loadSettings());
  const [currentChapter, setCurrentChapter] = useState(0);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  
  // 滚动模式状态
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  
  // 翻页模式状态
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  
  const theme = THEMES[settings.theme] || THEMES[0];
  const chapter = chapters[currentChapter] || chapters[0];
  
  // 初始化进度
  useEffect(() => {
    const saved = storage.loadProgress(bookId);
    if (saved.chapter < chapters.length) {
      setCurrentChapter(saved.chapter);
      // 延迟滚动到指定位置
      setTimeout(() => {
        if (settings.pageMode === 'scroll' && scrollContainerRef.current && chapters[saved.chapter]) {
          const ratio = saved.paragraph / Math.max(1, chapters[saved.chapter].paragraphs.length);
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight * ratio;
        }
      }, 100);
    }
  }, [bookId, chapters, settings.pageMode]);
  
  // 保存进度
  useEffect(() => {
    const timer = setTimeout(() => {
      storage.saveProgress(bookId, { 
        chapter: currentChapter, 
        paragraph: Math.floor(scrollProgress * chapter.paragraphs.length) 
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [currentChapter, scrollProgress, bookId, chapter]);
  
  // UI自动隐藏
  useEffect(() => {
    if (!settings.autoHideHeader || isImmersive || showSettings || showChapters) return;
    const timer = setTimeout(() => setShowUI(false), 3000);
    return () => clearTimeout(timer);
  }, [settings.autoHideHeader, isImmersive, showSettings, showChapters, showUI, currentChapter]);
  
  // 翻页模式：计算总页数（修复显示不全问题）
  useEffect(() => {
    if (settings.pageMode !== 'page') return;
    
    const calculatePages = () => {
      if (!pageContainerRef.current || !pageContentRef.current) return;
      
      const containerHeight = pageContainerRef.current.clientHeight;
      const contentHeight = pageContentRef.current.scrollHeight;
      
      if (containerHeight > 0 && contentHeight > 0) {
        const pages = Math.max(1, Math.ceil(contentHeight / containerHeight));
        setTotalPages(pages);
        if (currentPage >= pages) setCurrentPage(0);
      }
    };
    
    // 延迟计算确保渲染完成
    const timer = setTimeout(calculatePages, 100);
    window.addEventListener('resize', calculatePages);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculatePages);
    };
  }, [settings.pageMode, chapter, currentPage, settings.fontSize, settings.lineHeight]);
  
  // 章节切换
  const goChapter = useCallback((idx: number) => {
    if (idx < 0 || idx >= chapters.length) return;
    setCurrentChapter(idx);
    setCurrentPage(0);
    setShowChapters(false);
    // 重置滚动位置
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    if (pageContainerRef.current) pageContainerRef.current.scrollTop = 0;
  }, [chapters.length]);
  
  const nextChapter = useCallback(() => {
    if (currentChapter < chapters.length - 1) goChapter(currentChapter + 1);
  }, [currentChapter, chapters.length, goChapter]);
  
  const prevChapter = useCallback(() => {
    if (currentChapter > 0) goChapter(currentChapter - 1);
  }, [currentChapter, goChapter]);
  
  // 翻页控制（修复版）
  const nextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(p => p + 1);
    } else {
      nextChapter();
    }
  }, [currentPage, totalPages, nextChapter]);
  
  const prevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(p => p - 1);
    } else {
      prevChapter();
      // 跳转到上一章最后一页
      setTimeout(() => {
        if (pageContentRef.current && pageContainerRef.current) {
          const pages = Math.ceil(pageContentRef.current.scrollHeight / pageContainerRef.current.clientHeight);
          setCurrentPage(Math.max(0, pages - 1));
        }
      }, 50);
    }
  }, [currentPage, prevChapter]);
  
  // 滚动监听（修复：计算当前章节和进度）
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = target;
    const progress = scrollTop / (scrollHeight - clientHeight);
    setScrollProgress(isNaN(progress) ? 0 : progress);
    
    // 检测是否滚动到底部，自动加载下一章
    if (progress > 0.95 && currentChapter < chapters.length - 1) {
      // 可以在这里添加自动加载逻辑，或保持手动切换
    }
  }, [currentChapter, chapters.length]);
  
  // 触摸/点击处理（修复：确保能呼出菜单）
  const handleContainerClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // 如果点击的是按钮，不处理
    if ((e.target as HTMLElement).closest('button')) return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const x = clientX - rect.left;
    const width = rect.width;
    const height = rect.height;
    const y = clientY - rect.top;
    
    // 边缘区域用于翻页（左右30%），中间40%用于切换菜单
    const leftZone = width * 0.3;
    const rightZone = width * 0.7;
    
    // 只有在非UI显示状态下，点击中央才切换UI
    if (x > leftZone && x < rightZone && y > height * 0.2 && y < height * 0.8) {
      if (!showSettings && !showChapters) {
        setShowUI(v => !v);
      }
    } else if (x <= leftZone) {
      // 左侧：上一页/上一章
      settings.pageMode === 'page' ? prevPage() : 
        scrollContainerRef.current?.scrollBy({ top: -window.innerHeight * 0.9, behavior: 'smooth' });
    } else if (x >= rightZone) {
      // 右侧：下一页/下一章
      settings.pageMode === 'page' ? nextPage() : 
        scrollContainerRef.current?.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' });
    }
  }, [settings.pageMode, showSettings, showChapters, nextPage, prevPage]);
  
  // 设置更新
  const updateSetting = useCallback(<K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    storage.saveSettings(newSettings);
    // 重置页码计算
    if (key === 'fontSize' || key === 'lineHeight') {
      setCurrentPage(0);
    }
  }, [settings]);
  
  // 切换沉浸模式（非全屏，仅隐藏UI）
  const toggleImmersive = useCallback(() => {
    setIsImmersive(v => !v);
    setShowUI(true); // 切换时先显示UI，方便用户操作
  }, []);
  
  // 文本样式
  const textStyle: React.CSSProperties = {
    fontSize: `${settings.fontSize}px`,
    fontFamily: settings.fontFamily,
    lineHeight: settings.lineHeight,
    letterSpacing: `${settings.letterSpacing}px`,
    textAlign: settings.textAlign,
    color: theme.text,
  };
  
  if (!chapter) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f0f7ff] overflow-hidden" style={{ backgroundColor: theme.bg }}>
      {/* 顶部栏 - 蓝白风格 */}
      <header 
        className={`flex-none h-14 border-b flex items-center justify-between px-4 transition-all duration-300 z-20 ${
          showUI && !isImmersive ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
        style={{ 
          backgroundColor: `${theme.bg}f0`, 
          borderColor: theme.border,
          color: theme.text,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button 
            onClick={onClose} 
            className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-95 transition-all"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold truncate tracking-tight">{title}</h1>
            <p className="text-xs opacity-60 truncate font-medium" style={{ color: theme.accent }}>
              {chapter.title} · {currentChapter + 1}/{chapters.length}章
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setShowChapters(true)}
            className="p-2 rounded-full hover:bg-black/5 active:scale-95 transition-all"
            title="目录"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </button>
          <button 
            onClick={toggleImmersive}
            className="px-3 py-1.5 text-sm font-bold rounded-full hover:bg-black/5 active:scale-95 transition-all"
            style={{ color: theme.accent }}
          >
            沉
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full hover:bg-black/5 active:scale-95 transition-all"
            title="设置"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>
      
      {/* 阅读区域 - 修复：确保能点击呼出菜单 */}
      <div 
        className="flex-1 relative overflow-hidden"
        onClick={handleContainerClick}
      >
        {/* 滚动模式 - 修复：单章节内可滚动到底，通过底部按钮或自动加载切换章节 */}
        {settings.pageMode === 'scroll' ? (
          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto overflow-x-hidden"
            style={{ 
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <style>{`
              .reader-scroll::-webkit-scrollbar { display: none; }
              .reader-scroll { scrollbar-width: none; -ms-overflow-style: none; }
            `}</style>
            <div className="reader-scroll h-full overflow-y-auto">
              <div className="max-w-3xl mx-auto px-5 py-6 pb-20">
                <h2 className="text-xl font-bold mb-6 text-center" style={{ color: theme.accent }}>
                  {chapter.title}
                </h2>
                <div style={textStyle}>
                  {chapter.paragraphs.map((p, i) => (
                    <p 
                      key={i} 
                      className="mb-4 break-words"
                      style={{ 
                        textIndent: settings.textAlign !== 'center' ? '2em' : '0',
                        marginBottom: `${settings.paragraphSpacing}em`,
                      }}
                    >
                      {p}
                    </p>
                  ))}
                </div>
                
                {/* 章节底部导航 */}
                <div className="mt-12 flex items-center justify-between pt-8 border-t" style={{ borderColor: theme.border }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); prevChapter(); }}
                    disabled={currentChapter === 0}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-30 transition-all active:scale-95"
                    style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}
                  >
                    ← 上一章
                  </button>
                  <span className="text-sm opacity-50">本章结束</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); nextChapter(); }}
                    disabled={currentChapter >= chapters.length - 1}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-30 transition-all active:scale-95"
                    style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}
                  >
                    下一章 →
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 翻页模式 - 修复：使用绝对定位确保每页显示完整 */
          <div 
            ref={pageContainerRef}
            className="h-full overflow-hidden relative"
          >
            <div 
              ref={pageContentRef}
              className="absolute inset-0 w-full"
              style={{
                transform: `translateY(-${currentPage * 100}%)`,
                transition: 'transform 0.35s cubic-bezier(0.4, 0.0, 0.2, 1)',
                willChange: 'transform',
              }}
            >
              <div className="h-full overflow-hidden">
                <div className="max-w-3xl mx-auto px-6 py-8 h-full overflow-y-hidden">
                  {currentPage === 0 && (
                    <h2 className="text-xl font-bold mb-6 text-center" style={{ color: theme.accent }}>
                      {chapter.title}
                    </h2>
                  )}
                  <div style={textStyle} className="h-full">
                    {chapter.paragraphs.map((p, i) => (
                      <p 
                        key={i} 
                        className="mb-4 break-words"
                        style={{ 
                          textIndent: settings.textAlign !== 'center' ? '2em' : '0',
                          marginBottom: `${settings.paragraphSpacing}em`,
                        }}
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            {/* 翻页模式页码 */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-xs font-bold bg-white/90 shadow-lg border" style={{ borderColor: theme.border, color: theme.accent }}>
              {currentPage + 1} / {totalPages}
            </div>
          </div>
        )}
        
        {/* 中央点击区域提示（仅当UI隐藏时显示） */}
        {!showUI && !showSettings && !showChapters && (
          <div className="absolute inset-0 z-10" onClick={() => setShowUI(true)} />
        )}
      </div>
      
      {/* 底部栏 - 蓝白风格 */}
      <footer 
        className={`flex-none border-t transition-all duration-300 z-20 ${
          showUI && !isImmersive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
        style={{ 
          backgroundColor: `${theme.bg}f0`, 
          borderColor: theme.border,
          color: theme.text,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div className="px-4 py-3 flex items-center gap-4 max-w-3xl mx-auto">
          <button 
            onClick={prevChapter}
            disabled={currentChapter === 0}
            className="text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-30 transition-all active:scale-95"
            style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}
          >
            上一章
          </button>
          
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex justify-between text-xs font-medium opacity-70 px-1">
              <span>{Math.round((currentChapter / Math.max(1, chapters.length - 1)) * 100)}%</span>
              <span>{currentChapter + 1}/{chapters.length}</span>
            </div>
            <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-300"
                style={{ 
                  width: `${((currentChapter + (settings.pageMode === 'page' ? currentPage / Math.max(1, totalPages) : scrollProgress)) / chapters.length) * 100}%`,
                  backgroundColor: theme.accent,
                }}
              />
              {/* 可点击的进度条 */}
              <input 
                type="range" 
                min={0} 
                max={chapters.length - 1} 
                step={0.1}
                value={currentChapter}
                onChange={(e) => {
                  const ch = parseInt(e.target.value);
                  if (ch !== currentChapter) goChapter(ch);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          <button 
            onClick={nextChapter}
            disabled={currentChapter >= chapters.length - 1}
            className="text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-30 transition-all active:scale-95"
            style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}
          >
            下一章
          </button>
        </div>
      </footer>
      
      {/* 目录面板 */}
      {showChapters && (
        <div className="absolute inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowChapters(false)} />
          <div 
            className="relative w-80 max-w-[85vw] h-full shadow-2xl transform transition-transform duration-300 animate-in slide-in-from-left"
            style={{ backgroundColor: theme.bg }}
          >
            <div className="p-4 border-b flex items-center justify-between sticky top-0 z-10" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
              <h2 className="font-bold text-lg" style={{ color: theme.accent }}>目录</h2>
              <button onClick={() => setShowChapters(false)} className="p-2 rounded-full hover:bg-black/5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto h-[calc(100%-60px)] pb-safe">
              {chapters.map((ch, idx) => (
                <button
                  key={idx}
                  onClick={() => goChapter(idx)}
                  className={`w-full text-left px-5 py-3.5 border-b transition-all active:scale-[0.98] ${
                    currentChapter === idx 
                      ? 'bg-blue-50 border-l-4' 
                      : 'border-l-4 border-transparent hover:bg-black/[0.02]'
                  }`}
                  style={{ 
                    borderColor: theme.border,
                    borderLeftColor: currentChapter === idx ? theme.accent : 'transparent',
                    color: currentChapter === idx ? theme.accent : theme.text,
                  }}
                >
                  <span className={`text-sm ${currentChapter === idx ? 'font-bold' : 'opacity-80'}`}>
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
        <div className="absolute inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div 
            className="relative w-80 max-w-[85vw] h-full shadow-2xl overflow-y-auto"
            style={{ backgroundColor: theme.bg }}
          >
            <div className="p-4 border-b sticky top-0 z-10 flex items-center justify-between" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
              <h2 className="font-bold text-lg" style={{ color: theme.accent }}>阅读设置</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-black/5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div className="p-5 space-y-6 pb-20">
              {/* 模式切换 */}
              <div className="flex rounded-xl p-1.5" style={{ backgroundColor: `${theme.accent}10` }}>
                <button
                  onClick={() => updateSetting('pageMode', 'scroll')}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                    settings.pageMode === 'scroll' 
                      ? 'bg-white shadow-sm text-blue-600' 
                      : 'opacity-60'
                  }`}
                >
                  滚动模式
                </button>
                <button
                  onClick={() => updateSetting('pageMode', 'page')}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                    settings.pageMode === 'page' 
                      ? 'bg-white shadow-sm text-blue-600' 
                      : 'opacity-60'
                  }`}
                >
                  翻页模式
                </button>
              </div>
              
              {/* 字体大小 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold">字体大小</span>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}>
                    {settings.fontSize}px
                  </span>
                </div>
                <input 
                  type="range" min="14" max="28" 
                  value={settings.fontSize}
                  onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ backgroundColor: `${theme.accent}20` }}
                />
              </div>
              
              {/* 行间距 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold">行间距</span>
                  <span className="text-xs opacity-60">{settings.lineHeight}</span>
                </div>
                <input 
                  type="range" min="1.4" max="2.2" step="0.1"
                  value={settings.lineHeight}
                  onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ backgroundColor: `${theme.accent}20` }}
                />
              </div>
              
              {/* 字体 */}
              <div className="space-y-3">
                <span className="text-sm font-bold">字体</span>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(f => (
                    <button
                      key={f.name}
                      onClick={() => updateSetting('fontFamily', f.value)}
                      className={`px-3 py-2.5 text-sm rounded-lg border-2 transition-all active:scale-95 ${
                        settings.fontFamily === f.value 
                          ? 'border-blue-500 bg-blue-50 text-blue-600 font-bold' 
                          : 'border-transparent bg-gray-100'
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
                <span className="text-sm font-bold">主题颜色</span>
                <div className="grid grid-cols-4 gap-3">
                  {THEMES.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => updateSetting('theme', i)}
                      className={`aspect-square rounded-xl border-2 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 ${
                        settings.theme === i ? 'border-blue-500 scale-110 shadow-lg' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: t.bg }}
                    >
                      <span className="text-lg font-bold" style={{ color: t.accent }}>A</span>
                      <span className="text-[10px]" style={{ color: t.text }}>{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 对齐 */}
              <div className="space-y-3">
                <span className="text-sm font-bold">文字对齐</span>
                <div className="flex rounded-xl p-1.5" style={{ backgroundColor: `${theme.accent}10` }}>
                  <button
                    onClick={() => updateSetting('textAlign', 'left')}
                    className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                      settings.textAlign === 'left' ? 'bg-white shadow-sm font-bold' : 'opacity-60'
                    }`}
                  >
                    左对齐
                  </button>
                  <button
                    onClick={() => updateSetting('textAlign', 'justify')}
                    className={`flex-1 py-2 text-sm rounded-lg transition-all ${
                      settings.textAlign === 'justify' ? 'bg-white shadow-sm font-bold' : 'opacity-60'
                    }`}
                  >
                    两端对齐
                  </button>
                </div>
              </div>
              
              {/* 自动隐藏 */}
              <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: `${theme.accent}10` }}>
                <span className="text-sm font-bold">自动隐藏工具栏</span>
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