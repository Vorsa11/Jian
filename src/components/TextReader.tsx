import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  Settings,
  BookOpen,
  List,
  Play,
  Pause,
  Clock,
  ScrollText,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Monitor,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

// =============== 新增：清洗函数（仅针对 txt80.com 等来源的污染文本） ===============
function cleanNovelContent(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // 移除常见广告、水印、声明
  const adPatterns = [
    /本书为八零电子书网.*?存储服务/gi,
    /找好书，看好书，与大家分享好书，请加QQ群/gi,
    /八零电子书\s*www\.txt80\.com/gi,
    /小说下载尽在\s*http:\/\/www\.txt80\.com/gi,
    /手机访问\s*m\.txt80\.com/gi,
    /【本作品来自互联网.*?】/gi,
    /内容版权归作者所有/gi,
    /用户上传之内容开始/gi,
    /---------------------------/g,
    /★—+★/g,
    /丨[^\n]*?丨/g,
    /\s*http[s]?:\/\/[^\s]+/gi,
    /QQ群[:：]?\s*\d+/gi,
  ];

  adPatterns.forEach(pattern => {
    text = text.replace(pattern, '');
  });

  // 合并多余空行
  text = text.replace(/\n{3,}/g, '\n\n');

  // 清理每行首尾空格
  text = text
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  // 移除纯符号行（不含中英文且较短）
  text = text
    .split('\n')
    .filter(line => {
      if (line === '') return true;
      return /[a-zA-Z\u4e00-\u9fa5]/.test(line) || line.length > 30;
    })
    .join('\n');

  // 移除开头空白
  text = text.replace(/^\s*\n/, '');

  return text;
}
// ==============================================================================

const FONTS = [
  { name: '系统默认', value: 'system-ui, -apple-system, sans-serif' },
  { name: '宋体', value: '"Noto Serif SC", "SimSun", serif' },
  { name: '黑体', value: '"Noto Sans SC", "SimHei", sans-serif' },
  { name: '楷体', value: '"KaiTi", "STKaiti", serif' },
  { name: '仿宋', value: '"FangSong", "STFangsong", serif' },
  { name: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
];

const THEMES = [
  { name: '默认白', bg: '#ffffff', text: '#1a1a1a' },
  { name: '羊皮纸', bg: '#f5e6c8', text: '#3d3d3d' },
  { name: '护眼绿', bg: '#c7edcc', text: '#2d5a27' },
  { name: '深夜黑', bg: '#1a1a1a', text: '#b8b8b8' },
  { name: '淡蓝色', bg: '#e8f4fc', text: '#1a3a52' },
  { name: '淡粉色', bg: '#fce8f0', text: '#521a3a' },
  { name: '咖啡色', bg: '#3d2914', text: '#d4c4a8' },
  { name: '墨绿色', bg: '#0d2818', text: '#90c695' },
];

const PAGE_MODES = [
  { name: '滚动', value: 'scroll', icon: ScrollText },
  { name: '翻页', value: 'page', icon: BookOpen },
];

const TEXT_ALIGNS = [
  { name: '左对齐', value: 'left', icon: AlignLeft },
  { name: '居中', value: 'center', icon: AlignCenter },
  { name: '两端对齐', value: 'justify', icon: AlignRight },
];

interface TextReaderProps {
  content: string;
  title: string;
  bookId: string;
  onClose: () => void;
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

interface Chapter {
  title: string;
  index: number;
  startLine: number;
  endLine: number;
  lines: string[];
}

/**
 * 解析文本内容为章节结构
 */
function parseChapters(text: string): Chapter[] {
  if (!text) return [{ title: '正文', index: 0, startLine: 0, endLine: 0, lines: [] }];
  
  const allLines = text.split('\n');
  const rawChapters: { title: string; startLine: number }[] = [];
  const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+章|Chapter\s+\d+|\d+\.|【.*?】|.*?章.*?)[\s:：]/i;

  allLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (chapterRegex.test(trimmed) || (trimmed.length < 50 && trimmed.includes('章') && trimmed.length > 2)) {
      rawChapters.push({
        title: trimmed.slice(0, 50) || `第${rawChapters.length + 1}章`,
        startLine: index,
      });
    }
  });

  if (rawChapters.length === 0) {
    for (let i = 0; i < allLines.length; i += 200) {
      rawChapters.push({
        title: `第${Math.floor(i / 200) + 1}部分`,
        startLine: i,
      });
    }
  }

  const chapters: Chapter[] = rawChapters.map((c, i) => {
    const endLine = i < rawChapters.length - 1 ? rawChapters[i + 1].startLine - 1 : allLines.length - 1;
    return {
      title: c.title,
      index: i,
      startLine: c.startLine,
      endLine,
      lines: allLines.slice(c.startLine, endLine + 1),
    };
  });

  return chapters;
}

function getSavedProgress(bookId: string): { chapter: number; lineInChapter: number } {
  try {
    const saved = localStorage.getItem(`reader-progress-v5-${bookId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { chapter: parsed.chapter || 0, lineInChapter: parsed.lineInChapter || 0 };
    }
  } catch {}
  return { chapter: 0, lineInChapter: 0 };
}

function saveProgress(bookId: string, chapter: number, lineInChapter: number) {
  try {
    localStorage.setItem(`reader-progress-v5-${bookId}`, JSON.stringify({ chapter, lineInChapter }));
  } catch {}
}

/**
 * 🔧 修复点 1: 强制使用默认主题（theme=0），除非用户明确更改过
 * 防止 localStorage 残留深色主题导致“一打开就是黑底”
 */
function loadSettings(): ReaderSettings {
  const defaults: ReaderSettings = {
    fontSize: 18,
    fontFamily: FONTS[0].value,
    theme: 0, // 默认白底
    pageMode: 'scroll',
    lineHeight: 1.75,
    letterSpacing: 0.3,
    textAlign: 'left',
    paragraphSpacing: 1.2,
    autoHideHeader: true,
  };
  try {
    const saved = localStorage.getItem('text-reader-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      // 如果用户从未改过主题，强制用 0（避免旧数据污染）
      if (parsed.theme === undefined || parsed.theme === null) {
        parsed.theme = 0;
      }
      return { ...defaults, ...parsed };
    }
  } catch {}
  return defaults;
}

function saveSettings(settings: ReaderSettings) {
  try {
    localStorage.setItem('text-reader-settings', JSON.stringify(settings));
  } catch {}
}

const extractLinesFromContent = (content: string, start: number, end: number): string[] => {
  let startPos = 0;
  if (start > 0) {
    let searchPos = start;
    while (searchPos > 0 && content.charAt(searchPos - 1) !== '\n') {
      searchPos--;
    }
    startPos = searchPos;
  }

  let endPos = content.length;
  if (end < content.length) {
    let searchPos = end;
    while (searchPos < content.length && content.charAt(searchPos) !== '\n') {
      searchPos++;
    }
    endPos = searchPos + 1;
  }

  const segment = content.substring(startPos, endPos);
  const lines = segment.split('\n');
  const skipLines = start - startPos;
  return lines.slice(skipLines, skipLines + (end - start)).filter(line => line !== undefined);
};

export function TextReader({ content, title, bookId, onClose }: TextReaderProps) {
  // =============== 新增：清洗传入的 content ===============
  const cleanedContent = useMemo(() => cleanNovelContent(content), [content]);
  // =====================================================

  // 🔧 修复点 2: 增强空内容检测（包括纯空白字符）
  const isContentEmpty = !cleanedContent || cleanedContent.trim().length === 0;

  if (isContentEmpty) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="text-center p-6 max-w-md">
          <p className="text-muted-foreground mb-4">
            {cleanedContent ? '文件内容为空或仅包含空白字符' : '未加载到内容'}
          </p>
          <Button onClick={onClose} className="mt-4">返回</Button>
        </div>
      </div>
    );
  }

  const [settings, setSettings] = useState<ReaderSettings>(loadSettings());
  const [currentChapter, setCurrentChapter] = useState(0);
  const [lineInChapter, setLineInChapter] = useState(0);
  const [isAutoReading, setIsAutoReading] = useState(false);
  const [autoReadSpeed, setAutoReadSpeed] = useState(200);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const [currentTime, setCurrentTime] = useState('');

  const normalContainerRef = useRef<HTMLDivElement>(null);
  const immersiveContainerRef = useRef<HTMLDivElement>(null);
  const autoReadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const headerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const hasInitialized = useRef(false);
  const savedScrollPosition = useRef(0);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isScrolling = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 使用 cleanedContent 替代原 content
  const chapters = useMemo(() => parseChapters(cleanedContent), [cleanedContent]);
  const currentTheme = THEMES[settings.theme] || THEMES[0];
  
  const currentChapterData = chapters[currentChapter] || chapters[0];
  const totalLinesInChapter = currentChapterData?.lines.length || 0;
  const totalChapters = chapters.length;
  
  const totalLinesAll = chapters.reduce((sum, c) => sum + c.lines.length, 0);
  const linesBeforeCurrent = chapters.slice(0, currentChapter).reduce((sum, c) => sum + c.lines.length, 0);
  const globalLineIndex = linesBeforeCurrent + lineInChapter;
  const progressPercent = Math.round((globalLineIndex / Math.max(1, totalLinesAll)) * 100);

  const linesPerPage = 25;
  const totalPages = Math.max(1, Math.ceil(totalLinesInChapter / linesPerPage));
  const currentPage = Math.floor(lineInChapter / linesPerPage);
  const currentPageKey = `${currentChapter}-${currentPage}`;

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const saved = getSavedProgress(bookId);
    if (saved.chapter >= 0 && saved.chapter < chapters.length) {
      setCurrentChapter(saved.chapter);
      const chapter = chapters[saved.chapter];
      const maxLine = Math.max(0, chapter.lines.length - 1);
      setLineInChapter(Math.min(saved.lineInChapter, maxLine));
    }
  }, [bookId, chapters.length]);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    saveProgress(bookId, currentChapter, lineInChapter);
  }, [currentChapter, lineInChapter, bookId]);

  useEffect(() => {
    if (isAutoReading) {
      autoReadRef.current = setInterval(() => {
        if (settings.pageMode === 'scroll') {
          const activeContainer = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
          if (activeContainer) {
            activeContainer.scrollTop += 2;
          }
        } else {
          goToNext();
        }
      }, autoReadSpeed);
    }
    return () => {
      if (autoReadRef.current) clearInterval(autoReadRef.current);
    };
  }, [isAutoReading, autoReadSpeed, settings.pageMode, lineInChapter, isImmersive]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!settings.autoHideHeader || isImmersive) return;

    const show = () => {
      setShowHeader(true);
      if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
      headerTimeoutRef.current = setTimeout(() => setShowHeader(false), 3000);
    };

    show();
    const container = normalContainerRef.current;
    if (container) {
      container.addEventListener('scroll', show);
      container.addEventListener('touchstart', show);
    }

    return () => {
      if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
      if (container) {
        container.removeEventListener('scroll', show);
        container.removeEventListener('touchstart', show);
      }
    };
  }, [settings.autoHideHeader, isImmersive]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showSettings || showChapters) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          goToNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goToPrev();
          break;
        case 'Home':
          e.preventDefault();
          goToChapter(0);
          break;
        case 'End':
          e.preventDefault();
          goToChapter(chapters.length - 1);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showSettings, showChapters, lineInChapter, currentChapter, chapters.length, settings.pageMode, isImmersive]);

  const handleScroll = () => {
    if (settings.pageMode !== 'scroll') return;
    
    isScrolling.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    
    const activeContainer = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
    if (!activeContainer) return;
    
    const scrollTop = activeContainer.scrollTop;
    const containerHeight = activeContainer.clientHeight;
    const scrollCenter = scrollTop + containerHeight / 3;
    
    for (let i = 0; i < chapters.length; i++) {
      const chapterEl = chapterRefs.current[i];
      if (!chapterEl) continue;
      
      const chapterTop = chapterEl.offsetTop;
      const chapterBottom = chapterTop + chapterEl.offsetHeight;
      
      if (scrollCenter >= chapterTop && scrollCenter < chapterBottom) {
        if (currentChapter !== i) {
          setCurrentChapter(i);
        }
        break;
      }
    }
    
    scrollTimeout.current = setTimeout(() => {
      isScrolling.current = false;
    }, 150);
  };

  const goToNext = () => {
    if (settings.pageMode === 'page') {
      const nextLine = lineInChapter + linesPerPage;
      if (nextLine >= totalLinesInChapter && currentChapter < chapters.length - 1) {
        setCurrentChapter(prev => prev + 1);
        setLineInChapter(0);
      } else if (nextLine < totalLinesInChapter) {
        setLineInChapter(nextLine);
      }
    } else {
      const activeContainer = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
      if (activeContainer) {
        activeContainer.scrollBy({ top: activeContainer.clientHeight * 0.9, behavior: 'smooth' });
      }
    }
  };

  const goToPrev = () => {
    if (settings.pageMode === 'page') {
      const prevLine = lineInChapter - linesPerPage;
      if (prevLine < 0 && currentChapter > 0) {
        setCurrentChapter(currentChapter - 1);
        setLineInChapter(0);
      } else if (prevLine >= 0) {
        setLineInChapter(prevLine);
      }
    } else {
      const activeContainer = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
      if (activeContainer) {
        activeContainer.scrollBy({ top: -activeContainer.clientHeight * 0.9, behavior: 'smooth' });
      }
    }
  };

  const goToChapter = (index: number) => {
    if (index < 0 || index >= chapters.length) return;
  
    setCurrentChapter(index);
    setLineInChapter(0);
    setShowChapters(false);
  
    requestAnimationFrame(() => {
      const activeContainer = isImmersive 
        ? immersiveContainerRef.current 
        : normalContainerRef.current;
    
      if (!activeContainer) return;

      if (settings.pageMode === 'page') {
        activeContainer.scrollTop = 0;
      } else if (settings.pageMode === 'scroll') {
        const chapterEl = chapterRefs.current[index];
        if (chapterEl) {
          activeContainer.scrollTo({
            top: chapterEl.offsetTop,
            behavior: 'smooth'
          });
        }
      }
    });
  };

  const toggleImmersive = () => {
    const newImmersive = !isImmersive;
    const currentContainer = newImmersive ? normalContainerRef.current : immersiveContainerRef.current;
    
    if (currentContainer) {
      savedScrollPosition.current = currentContainer.scrollTop;
    }
    
    setIsImmersive(newImmersive);
    
    if (newImmersive) {
      setShowHeader(false);
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      setShowHeader(true);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  useEffect(() => {
    const targetContainer = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
    if (targetContainer && savedScrollPosition.current > 0) {
      requestAnimationFrame(() => {
        targetContainer.scrollTop = savedScrollPosition.current;
      });
    }
  }, [isImmersive]);

  useEffect(() => {
    if (settings.pageMode !== 'page') return;

    const container = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
    if (!container) return;

    const rafId = requestAnimationFrame(() => {
      container.scrollTop = 0;
    });

    return () => cancelAnimationFrame(rafId);
  }, [currentPageKey, settings.pageMode, isImmersive]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) goToNext();
      else goToPrev();
    }
  };

  const onContentClick = (e: React.MouseEvent) => {
    if (settings.pageMode === 'scroll' && !isImmersive) return;
    
    const activeContainer = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
    const rect = activeContainer?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    
    if (x < rect.width * 0.25) goToPrev();
    else if (x > rect.width * 0.75) goToNext();
  };

  const updateSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const renderPageContent = () => {
    const chapter = chapters[currentChapter];
    if (!chapter) return null;

    const startGlobalLine = chapter.startLine + (currentPage * linesPerPage);
    const endGlobalLine = Math.min(
      chapter.startLine + ((currentPage + 1) * linesPerPage),
      chapter.endLine + 1
    );

    const displayLines = extractLinesFromContent(cleanedContent, startGlobalLine, endGlobalLine); // 使用 cleanedContent

    return (
      <div style={{ 
        fontSize: `${settings.fontSize}px`,
        fontFamily: settings.fontFamily,
        lineHeight: settings.lineHeight,
        letterSpacing: `${settings.letterSpacing}px`,
        textAlign: settings.textAlign,
        color: currentTheme.text,
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}>
        {displayLines.map((line, i) => (
          <p 
            key={startGlobalLine + i}
            style={{ marginBottom: `${settings.paragraphSpacing}em` }}
            className="break-words"
          >
            {line.trim() || '\u00A0'}
          </p>
        ))}
      </div>
    );
  };

  const renderScrollContent = () => {
    return (
      <div>
        {chapters.map((chapter, chIndex) => (
          <div 
            key={chIndex}
            ref={el => { chapterRefs.current[chIndex] = el; }}
            className="mb-8"
          >
            <div 
              className="text-center py-4 mb-4 border-b-2 border-dashed"
              style={{ 
                borderColor: `${currentTheme.text}20`,
                color: currentTheme.text,
                fontSize: `${settings.fontSize * 1.2}px`,
                fontWeight: 'bold',
              }}
            >
              {chapter.title}
            </div>
            <div style={{ 
              fontSize: `${settings.fontSize}px`,
              fontFamily: settings.fontFamily,
              lineHeight: settings.lineHeight,
              letterSpacing: `${settings.letterSpacing}px`,
              textAlign: settings.textAlign,
              color: currentTheme.text,
            }}>
              {chapter.lines.map((line, lineIdx) => (
                <p 
                  key={lineIdx}
                  style={{ marginBottom: `${settings.paragraphSpacing}em` }}
                  className="break-words"
                >
                  {line.trim() || '\u00A0'}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const ChapterList = ({ onSelect }: { onSelect: (index: number) => void }) => (
    <div className="py-2">
      {chapters.map((chapter, index) => (
        <button
          key={index}
          onClick={() => onSelect(index)}
          className={`w-full text-left px-5 py-3.5 transition-all duration-200 ${
            currentChapter === index 
              ? 'bg-primary/20 border-l-4 border-primary' 
              : 'hover:bg-black/5 border-l-4 border-transparent'
          }`}
          style={{ borderBottom: `1px solid ${currentTheme.text}10` }}
        >
          <p 
            className={`text-sm ${currentChapter === index ? 'font-semibold' : ''}`} 
            style={{ color: currentTheme.text }}
          >
            {chapter.title}
          </p>
        </button>
      ))}
    </div>
  );

  if (isImmersive) {
    return (
      <div 
        className="fixed inset-0 z-[100] flex flex-col"
        style={{ backgroundColor: currentTheme.bg }}
      >
        <div className="absolute bottom-6 left-6 z-10 text-xs opacity-50" style={{ color: currentTheme.text }}>
          {currentTime}
        </div>
        
        <button
          onClick={() => setShowChapters(true)}
          className="absolute top-4 left-4 z-10 h-9 px-4 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2"
          style={{ backgroundColor: `${currentTheme.text}30`, color: currentTheme.text }}
        >
          <List className="h-4 w-4" />
          <span className="max-w-[140px] truncate">{currentChapterData?.title.slice(0, 15) || '无章节'}</span>
        </button>

        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <button
            onClick={() => currentChapter > 0 && goToChapter(currentChapter - 1)}
            disabled={currentChapter === 0}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
              currentChapter === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'
            }`}
            style={{ backgroundColor: `${currentTheme.text}25`, color: currentTheme.text }}
            title="上一章"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          
          <button
            onClick={() => currentChapter < chapters.length - 1 && goToChapter(currentChapter + 1)}
            disabled={currentChapter >= chapters.length - 1}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
              currentChapter >= chapters.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'
            }`}
            style={{ backgroundColor: `${currentTheme.text}25`, color: currentTheme.text }}
            title="下一章"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
          
          <button
            onClick={toggleImmersive}
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 hover:scale-110 ml-1"
            style={{ backgroundColor: `${currentTheme.text}30`, color: currentTheme.text }}
            title="退出沉浸"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div 
          ref={immersiveContainerRef}
          className="flex-1 overflow-auto px-6 py-16"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={onContentClick}
          onScroll={handleScroll}
        >
          <div className="max-w-2xl mx-auto">
            {settings.pageMode === 'page' ? renderPageContent() : renderScrollContent()}
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs opacity-50" style={{ color: currentTheme.text }}>
          {progressPercent}%
        </div>

        {showChapters && (
          <div 
            className="fixed inset-0 z-[200] flex"
            onClick={() => setShowChapters(false)}
          >
            <div className="absolute inset-0 bg-black/50" />
            <div 
              className="relative w-full max-w-md h-full overflow-y-auto animate-in slide-in-from-left duration-200"
              style={{ backgroundColor: currentTheme.bg }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 py-4 border-b flex items-center justify-between" style={{ borderColor: `${currentTheme.text}15` }}>
                <h2 style={{ color: currentTheme.text, fontSize: '1.1rem', fontWeight: 600 }}>目录</h2>
                <button 
                  onClick={() => setShowChapters(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ChapterList onSelect={goToChapter} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: currentTheme.bg }}
    >
      <header 
        className={`flex items-center justify-between px-3 py-2 border-b flex-shrink-0 transition-all duration-300 ${
          showHeader ? 'opacity-100' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
        style={{ borderColor: `${currentTheme.text}12` }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 flex-shrink-0">
            <ChevronLeft className="h-5 w-5" style={{ color: currentTheme.text }} />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" style={{ color: currentTheme.text }}>{title}</p>
            <p className="text-xs opacity-50 truncate" style={{ color: currentTheme.text }}>
              {currentChapterData?.title || '无章节'} · {progressPercent}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={toggleImmersive} className="h-8 px-2.5 text-xs">
            <span style={{ color: currentTheme.text }}>沉</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowChapters(true)} className="h-8 w-8">
            <List className="h-4 w-4" style={{ color: currentTheme.text }} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className="h-8 w-8">
            <Settings className="h-4 w-4" style={{ color: currentTheme.text }} />
          </Button>
        </div>
      </header>

      <div 
        ref={normalContainerRef}
        className="flex-1 overflow-auto relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onContentClick}
        onScroll={handleScroll}
      >
        <div className="max-w-2xl mx-auto px-4 py-4">
          {settings.pageMode === 'page' ? renderPageContent() : renderScrollContent()}
        </div>
      </div>

      <footer 
        className={`px-3 py-2 border-t flex-shrink-0 transition-all duration-300 ${
          showHeader ? 'opacity-100' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
        style={{ borderColor: `${currentTheme.text}12` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsAutoReading(!isAutoReading)} className="h-8 gap-1.5">
              {isAutoReading ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="text-xs" style={{ color: currentTheme.text }}>{isAutoReading ? '停止' : '自动'}</span>
            </Button>
            <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>
              {settings.pageMode === 'page' ? `${currentPage + 1} / ${totalPages}页` : `${currentChapter + 1}/${totalChapters}章`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>{progressPercent}%</span>
          </div>
        </div>
      </footer>

      {showSettings && (
        <div 
          className="fixed inset-0 z-[200] flex justify-end"
          onClick={() => setShowSettings(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div 
            className="relative w-full max-w-md h-full overflow-y-auto animate-in slide-in-from-right duration-200"
            style={{ backgroundColor: currentTheme.bg }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: `${currentTheme.text}12` }}>
              <h2 style={{ color: currentTheme.text, fontWeight: 600 }}>阅读设置</h2>
              <button 
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-4 space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: currentTheme.text }}>字体大小</span>
                  <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>{settings.fontSize}px</span>
                </div>
                <Slider value={[settings.fontSize]} onValueChange={(v) => updateSetting('fontSize', v[0])} min={12} max={32} step={1} />
              </div>

              <div className="space-y-2">
                <span className="text-sm" style={{ color: currentTheme.text }}>字体</span>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map((f) => (
                    <Button key={f.name} variant={settings.fontFamily === f.value ? 'default' : 'outline'} size="sm" onClick={() => updateSetting('fontFamily', f.value)} style={{ fontFamily: f.value }} className="text-xs h-9">{f.name}</Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm" style={{ color: currentTheme.text }}>背景主题</span>
                <div className="grid grid-cols-4 gap-2">
                  {THEMES.map((t, i) => (
                    <button key={i} onClick={() => updateSetting('theme', i)} className={`aspect-square rounded-lg border-2 transition-all ${settings.theme === i ? 'border-primary' : 'border-transparent'}`} style={{ backgroundColor: t.bg }}>
                      <span style={{ color: t.text, fontSize: '10px' }}>{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm" style={{ color: currentTheme.text }}>翻页方式</span>
                <div className="flex gap-2">
                  {PAGE_MODES.map((m) => (
                    <Button key={m.value} variant={settings.pageMode === m.value ? 'default' : 'outline'} className="flex-1 gap-2 h-9" onClick={() => updateSetting('pageMode', m.value as 'scroll' | 'page')}>
                      <m.icon className="h-4 w-4" />{m.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm" style={{ color: currentTheme.text }}>文字对齐</span>
                <div className="flex gap-2">
                  {TEXT_ALIGNS.map((a) => (
                    <Button key={a.value} variant={settings.textAlign === a.value ? 'default' : 'outline'} className="flex-1 gap-2 h-9" onClick={() => updateSetting('textAlign', a.value as 'left' | 'center' | 'justify')}>
                      <a.icon className="h-4 w-4" />{a.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: currentTheme.text }}>行间距</span>
                  <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>{settings.lineHeight.toFixed(1)}</span>
                </div>
                <Slider value={[settings.lineHeight]} onValueChange={(v) => updateSetting('lineHeight', v[0])} min={1.2} max={2.5} step={0.1} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: currentTheme.text }}>字间距</span>
                  <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>{settings.letterSpacing.toFixed(1)}px</span>
                </div>
                <Slider value={[settings.letterSpacing]} onValueChange={(v) => updateSetting('letterSpacing', v[0])} min={0} max={3} step={0.1} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: currentTheme.text }}>段间距</span>
                  <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>{settings.paragraphSpacing.toFixed(1)}em</span>
                </div>
                <Slider value={[settings.paragraphSpacing]} onValueChange={(v) => updateSetting('paragraphSpacing', v[0])} min={0} max={2} step={0.1} />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 opacity-60" style={{ color: currentTheme.text }} />
                  <span className="text-sm" style={{ color: currentTheme.text }}>自动隐藏顶栏</span>
                </div>
                <Switch checked={settings.autoHideHeader} onCheckedChange={(v) => updateSetting('autoHideHeader', v)} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 opacity-60" style={{ color: currentTheme.text }} />
                  <span className="text-sm" style={{ color: currentTheme.text }}>自动阅读速度</span>
                </div>
                <Slider value={[autoReadSpeed]} onValueChange={(v) => setAutoReadSpeed(v[0])} min={50} max={500} step={10} inverted />
                <p className="text-xs opacity-50" style={{ color: currentTheme.text }}>数值越小速度越快</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showChapters && (
        <div 
          className="fixed inset-0 z-[200] flex"
          onClick={() => setShowChapters(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div 
            className="relative w-full max-w-md h-full overflow-y-auto animate-in slide-in-from-left duration-200"
            style={{ backgroundColor: currentTheme.bg }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: `${currentTheme.text}12` }}>
              <h2 style={{ color: currentTheme.text, fontWeight: 600 }}>目录</h2>
              <button 
                onClick={() => setShowChapters(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ChapterList onSelect={goToChapter} />
          </div>
        </div>
      )}
    </div>
  );
}