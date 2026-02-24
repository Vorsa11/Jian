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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';

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

// Parse chapters from text
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

  // Auto-generate chapters if none found
  if (rawChapters.length === 0) {
    for (let i = 0; i < allLines.length; i += 200) {
      rawChapters.push({
        title: `第${Math.floor(i / 200) + 1}部分`,
        startLine: i,
      });
    }
  }

  // Build chapters with lines
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
    const saved = localStorage.getItem(`reader-progress-v2-${bookId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { chapter: parsed.chapter || 0, lineInChapter: parsed.lineInChapter || 0 };
    }
  } catch {}
  return { chapter: 0, lineInChapter: 0 };
}

function saveProgress(bookId: string, chapter: number, lineInChapter: number) {
  try {
    localStorage.setItem(`reader-progress-v2-${bookId}`, JSON.stringify({ chapter, lineInChapter }));
  } catch {}
}

function loadSettings(): ReaderSettings {
  const defaults: ReaderSettings = {
    fontSize: 18,
    fontFamily: FONTS[0].value,
    theme: 0,
    pageMode: 'scroll',
    lineHeight: 1.8,
    letterSpacing: 0.5,
    textAlign: 'left',
    paragraphSpacing: 1,
    autoHideHeader: true,
  };
  try {
    const saved = localStorage.getItem('text-reader-settings');
    if (saved) return { ...defaults, ...JSON.parse(saved) };
  } catch {}
  return defaults;
}

function saveSettings(settings: ReaderSettings) {
  try {
    localStorage.setItem('text-reader-settings', JSON.stringify(settings));
  } catch {}
}

export function TextReader({ content, title, bookId, onClose }: TextReaderProps) {
  if (!content) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">内容为空</p>
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
  const [isTransitioning, setIsTransitioning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const autoReadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const headerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const hasInitialized = useRef(false);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);

  const chapters = useMemo(() => parseChapters(content), [content]);
  const currentTheme = THEMES[settings.theme] || THEMES[0];
  
  const currentChapterData = chapters[currentChapter] || chapters[0];
  const totalLinesInChapter = currentChapterData?.lines.length || 0;
  const totalChapters = chapters.length;
  
  // Calculate global progress
  const totalLinesAll = chapters.reduce((sum, c) => sum + c.lines.length, 0);
  const linesBeforeCurrent = chapters.slice(0, currentChapter).reduce((sum, c) => sum + c.lines.length, 0);
  const globalLineIndex = linesBeforeCurrent + lineInChapter;
  const progressPercent = Math.round((globalLineIndex / Math.max(1, totalLinesAll)) * 100);

  // Lines per page for page mode
  const linesPerPage = 25;
  const totalPages = Math.max(1, Math.ceil(totalLinesInChapter / linesPerPage));
  const currentPage = Math.floor(lineInChapter / linesPerPage);

  // Initialize - load saved progress only once
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

  // Sync scroll position in scroll mode
  useEffect(() => {
    if (settings.pageMode === 'scroll' && containerRef.current && !isAutoReading) {
      const targetChapterEl = chapterRefs.current[currentChapter];
      if (targetChapterEl) {
        const lineHeightPx = settings.fontSize * settings.lineHeight;
        const targetScroll = targetChapterEl.offsetTop + lineInChapter * lineHeightPx;
        if (Math.abs(containerRef.current.scrollTop - targetScroll) > lineHeightPx * 3) {
          containerRef.current.scrollTop = targetScroll;
        }
      }
    }
  }, [lineInChapter, currentChapter, settings.pageMode, settings.fontSize, settings.lineHeight, isAutoReading]);

  // Update time
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  // Save progress
  useEffect(() => {
    saveProgress(bookId, currentChapter, lineInChapter);
  }, [currentChapter, lineInChapter, bookId]);

  // Auto reading
  useEffect(() => {
    if (isAutoReading) {
      autoReadRef.current = setInterval(() => {
        if (settings.pageMode === 'scroll') {
          if (containerRef.current) {
            containerRef.current.scrollTop += 2;
            updateCurrentPositionFromScroll();
          }
        } else {
          // Page mode auto read - advance line by line
          goToLineInChapter(lineInChapter + 1);
        }
      }, autoReadSpeed);
    }
    return () => {
      if (autoReadRef.current) clearInterval(autoReadRef.current);
    };
  }, [isAutoReading, autoReadSpeed, settings.pageMode, lineInChapter, currentChapter]);

  // Save settings
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Auto hide header
  useEffect(() => {
    if (!settings.autoHideHeader || isImmersive) return;

    const show = () => {
      setShowHeader(true);
      if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
      headerTimeoutRef.current = setTimeout(() => setShowHeader(false), 3000);
    };

    show();
    const container = containerRef.current;
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

  // Keyboard navigation
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
  }, [showSettings, showChapters, lineInChapter, currentChapter, chapters.length, settings.pageMode]);

  // Update current position from scroll (for scroll mode)
  const updateCurrentPositionFromScroll = () => {
    if (!containerRef.current || settings.pageMode !== 'scroll') return;
    
    const scrollTop = containerRef.current.scrollTop;
    const lineHeightPx = settings.fontSize * settings.lineHeight;
    
    // Find which chapter we're in
    for (let i = 0; i < chapters.length; i++) {
      const chapterEl = chapterRefs.current[i];
      if (!chapterEl) continue;
      
      const chapterTop = chapterEl.offsetTop;
      const chapterBottom = chapterTop + chapterEl.offsetHeight;
      
      if (scrollTop >= chapterTop - lineHeightPx && scrollTop < chapterBottom) {
        if (currentChapter !== i) {
          setCurrentChapter(i);
        }
        const lineInCh = Math.floor((scrollTop - chapterTop) / lineHeightPx);
        const maxLine = chapters[i].lines.length - 1;
        const clampedLine = Math.max(0, Math.min(lineInCh, maxLine));
        if (lineInChapter !== clampedLine) {
          setLineInChapter(clampedLine);
        }
        break;
      }
    }
  };

  // Scroll handler for scroll mode
  const handleScroll = () => {
    if (settings.pageMode === 'scroll') {
      updateCurrentPositionFromScroll();
    }
  };

  const goToLineInChapter = (line: number) => {
    const maxLine = Math.max(0, currentChapterData.lines.length - 1);
    const clampedLine = Math.max(0, Math.min(line, maxLine));
    setLineInChapter(clampedLine);
    
    if (settings.pageMode === 'scroll' && chapterRefs.current[currentChapter]) {
      const lineHeightPx = settings.fontSize * settings.lineHeight;
      const chapterEl = chapterRefs.current[currentChapter];
      if (chapterEl && containerRef.current) {
        containerRef.current.scrollTop = chapterEl.offsetTop + clampedLine * lineHeightPx;
      }
    }
  };

  const goToNext = () => {
    if (isTransitioning) return;
    
    if (settings.pageMode === 'page') {
      // Page mode: advance by linesPerPage
      const nextLine = lineInChapter + linesPerPage;
      if (nextLine >= totalLinesInChapter && currentChapter < chapters.length - 1) {
        // Go to next chapter
        setIsTransitioning(true);
        setTimeout(() => {
          setCurrentChapter(prev => prev + 1);
          setLineInChapter(0);
          setIsTransitioning(false);
        }, 150);
      } else {
        goToLineInChapter(nextLine);
      }
    } else {
      // Scroll mode: scroll down
      if (containerRef.current) {
        containerRef.current.scrollTop += containerRef.current.clientHeight * 0.85;
      }
    }
  };

  const goToPrev = () => {
    if (isTransitioning) return;
    
    if (settings.pageMode === 'page') {
      // Page mode: go back by linesPerPage
      const prevLine = lineInChapter - linesPerPage;
      if (prevLine < 0 && currentChapter > 0) {
        // Go to previous chapter's end
        setIsTransitioning(true);
        setTimeout(() => {
          const prevCh = chapters[currentChapter - 1];
          setCurrentChapter(currentChapter - 1);
          const lastPageStart = Math.floor((prevCh.lines.length - 1) / linesPerPage) * linesPerPage;
          setLineInChapter(lastPageStart);
          setIsTransitioning(false);
        }, 150);
      } else {
        goToLineInChapter(prevLine);
      }
    } else {
      // Scroll mode: scroll up
      if (containerRef.current) {
        containerRef.current.scrollTop -= containerRef.current.clientHeight * 0.85;
      }
    }
  };

  const goToChapter = (index: number) => {
    if (index < 0 || index >= chapters.length) return;
    
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentChapter(index);
      setLineInChapter(0);
      setShowChapters(false);
      
      // Scroll to chapter in scroll mode
      if (settings.pageMode === 'scroll' && chapterRefs.current[index] && containerRef.current) {
        containerRef.current.scrollTop = chapterRefs.current[index]!.offsetTop;
      }
      setIsTransitioning(false);
    }, 150);
  };

  const toggleImmersive = () => {
    const newImmersive = !isImmersive;
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

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    
    // Only handle horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) goToNext();
      else goToPrev();
    }
  };

  const onContentClick = (e: React.MouseEvent) => {
    if (settings.pageMode === 'scroll' && !isImmersive) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    
    if (x < rect.width * 0.25) goToPrev();
    else if (x > rect.width * 0.75) goToNext();
  };

  const updateSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Render content for page mode (single chapter)
  const renderPageContent = () => {
    const startLine = currentPage * linesPerPage;
    const endLine = Math.min(startLine + linesPerPage, totalLinesInChapter);
    const displayLines = currentChapterData.lines.slice(startLine, endLine);

    return (
      <div 
        className={`transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
        style={{ 
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          lineHeight: settings.lineHeight,
          letterSpacing: `${settings.letterSpacing}px`,
          textAlign: settings.textAlign,
          color: currentTheme.text,
        }}
      >
        {displayLines.map((line, i) => (
          <p 
            key={startLine + i}
            style={{ marginBottom: `${settings.paragraphSpacing}em` }}
            className="break-words"
          >
            {line.trim() || '\u00A0'}
          </p>
        ))}
      </div>
    );
  };

  // Render content for scroll mode (all chapters)
  const renderScrollContent = () => {
    return (
      <div 
        className={`transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
      >
        {chapters.map((chapter, chIndex) => (
          <div 
            key={chIndex}
            ref={el => { chapterRefs.current[chIndex] = el; }}
            className="mb-8"
          >
            {/* Chapter title */}
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
            {/* Chapter content */}
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

  // Immersive mode
  if (isImmersive) {
    return (
      <div 
        className={`fixed inset-0 z-[100] flex flex-col transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
        style={{ backgroundColor: currentTheme.bg }}
      >
        {/* Time - bottom left */}
        <div className="absolute bottom-6 left-6 z-10 text-xs opacity-40" style={{ color: currentTheme.text }}>
          {currentTime}
        </div>
        
        {/* Exit button - top right */}
        <button
          onClick={toggleImmersive}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium opacity-50 hover:opacity-100 transition-all duration-200"
          style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
        >
          出
        </button>

        {/* Chapter selector button - top left */}
        <button
          onClick={() => setShowChapters(true)}
          className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full text-xs font-medium opacity-70 hover:opacity-100 transition-all duration-200 flex items-center gap-1"
          style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
        >
          <List className="h-3 w-3" />
          <span className="max-w-[120px] truncate">{currentChapterData?.title.slice(0, 15) || '无章节'}</span>
        </button>

        {/* Prev/Next chapter buttons */}
        {currentChapter > 0 && (
          <button
            onClick={() => goToChapter(currentChapter - 1)}
            className="absolute top-4 left-1/2 -translate-x-[120%] z-10 px-2 py-1.5 rounded-full text-xs font-medium opacity-50 hover:opacity-100 transition-all duration-200"
            style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
          >
            <ChevronUp className="h-3 w-3" />
          </button>
        )}
        {currentChapter < chapters.length - 1 && (
          <button
            onClick={() => goToChapter(currentChapter + 1)}
            className="absolute top-4 left-1/2 translate-x-[20%] z-10 px-2 py-1.5 rounded-full text-xs font-medium opacity-50 hover:opacity-100 transition-all duration-200"
            style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        )}

        {/* Content */}
        <div 
          ref={containerRef}
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

        {/* Progress - bottom center */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs opacity-40" style={{ color: currentTheme.text }}>
          {progressPercent}%
        </div>

        {/* Chapters Sheet for immersive mode */}
        <Sheet open={showChapters} onOpenChange={setShowChapters}>
          <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto p-0" style={{ backgroundColor: currentTheme.bg }}>
            <SheetHeader className="px-4 py-3 border-b" style={{ borderColor: `${currentTheme.text}12` }}>
              <SheetTitle style={{ color: currentTheme.text }}>目录</SheetTitle>
            </SheetHeader>
            
            <div className="py-1">
              {chapters.map((chapter, index) => (
                <button
                  key={index}
                  onClick={() => goToChapter(index)}
                  className={`w-full text-left px-4 py-3 transition-all duration-200 ${currentChapter === index ? 'bg-primary/15' : 'hover:bg-black/5'}`}
                  style={{ borderBottom: `1px solid ${currentTheme.text}08` }}
                >
                  <p className={`text-sm truncate ${currentChapter === index ? 'font-medium' : ''}`} style={{ color: currentTheme.text }}>
                    {chapter.title}
                  </p>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // Normal mode
  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
      style={{ backgroundColor: currentTheme.bg }}
    >
      {/* Header */}
      <header 
        className={`flex items-center justify-between px-3 py-2 border-b flex-shrink-0 transition-all duration-300 ${
          showHeader ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
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

      {/* Content */}
      <div 
        ref={containerRef}
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

      {/* Footer */}
      <footer 
        className={`px-3 py-2 border-t flex-shrink-0 transition-all duration-300 ${
          showHeader ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
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

      {/* Settings Sheet */}
      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0" style={{ backgroundColor: currentTheme.bg }}>
          <SheetHeader className="px-4 py-3 border-b" style={{ borderColor: `${currentTheme.text}12` }}>
            <SheetTitle style={{ color: currentTheme.text }}>阅读设置</SheetTitle>
          </SheetHeader>
          
          <div className="p-4 space-y-5">
            {/* Font Size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: currentTheme.text }}>字体大小</span>
                <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>{settings.fontSize}px</span>
              </div>
              <Slider value={[settings.fontSize]} onValueChange={(v) => updateSetting('fontSize', v[0])} min={12} max={32} step={1} />
            </div>

            {/* Font Family */}
            <div className="space-y-2">
              <span className="text-sm" style={{ color: currentTheme.text }}>字体</span>
              <div className="grid grid-cols-2 gap-2">
                {FONTS.map((f) => (
                  <Button key={f.name} variant={settings.fontFamily === f.value ? 'default' : 'outline'} size="sm" onClick={() => updateSetting('fontFamily', f.value)} style={{ fontFamily: f.value }} className="text-xs h-9">{f.name}</Button>
                ))}
              </div>
            </div>

            {/* Theme */}
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

            {/* Page Mode */}
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

            {/* Text Align */}
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

            {/* Line Height */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: currentTheme.text }}>行间距</span>
                <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>{settings.lineHeight.toFixed(1)}</span>
              </div>
              <Slider value={[settings.lineHeight]} onValueChange={(v) => updateSetting('lineHeight', v[0])} min={1.2} max={2.5} step={0.1} />
            </div>

            {/* Letter Spacing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: currentTheme.text }}>字间距</span>
                <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>{settings.letterSpacing.toFixed(1)}px</span>
              </div>
              <Slider value={[settings.letterSpacing]} onValueChange={(v) => updateSetting('letterSpacing', v[0])} min={0} max={3} step={0.1} />
            </div>

            {/* Paragraph Spacing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: currentTheme.text }}>段间距</span>
                <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>{settings.paragraphSpacing.toFixed(1)}em</span>
              </div>
              <Slider value={[settings.paragraphSpacing]} onValueChange={(v) => updateSetting('paragraphSpacing', v[0])} min={0} max={2} step={0.1} />
            </div>

            {/* Auto Hide Header */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 opacity-60" style={{ color: currentTheme.text }} />
                <span className="text-sm" style={{ color: currentTheme.text }}>自动隐藏顶栏</span>
              </div>
              <Switch checked={settings.autoHideHeader} onCheckedChange={(v) => updateSetting('autoHideHeader', v)} />
            </div>

            {/* Auto Read Speed */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 opacity-60" style={{ color: currentTheme.text }} />
                <span className="text-sm" style={{ color: currentTheme.text }}>自动阅读速度</span>
              </div>
              <Slider value={[autoReadSpeed]} onValueChange={(v) => setAutoReadSpeed(v[0])} min={50} max={500} step={10} inverted />
              <p className="text-xs opacity-50" style={{ color: currentTheme.text }}>数值越小速度越快</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Chapters Sheet */}
      <Sheet open={showChapters} onOpenChange={setShowChapters}>
        <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto p-0" style={{ backgroundColor: currentTheme.bg }}>
          <SheetHeader className="px-4 py-3 border-b" style={{ borderColor: `${currentTheme.text}12` }}>
            <SheetTitle style={{ color: currentTheme.text }}>目录</SheetTitle>
          </SheetHeader>
          
          <div className="py-1">
            {chapters.map((chapter, index) => (
              <button
                key={index}
                onClick={() => goToChapter(index)}
                className={`w-full text-left px-4 py-3 transition-all duration-200 ${currentChapter === index ? 'bg-primary/15' : 'hover:bg-black/5'}`}
                style={{ borderBottom: `1px solid ${currentTheme.text}08` }}
              >
                <p className={`text-sm truncate ${currentChapter === index ? 'font-medium' : ''}`} style={{ color: currentTheme.text }}>
                  {chapter.title}
                </p>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
