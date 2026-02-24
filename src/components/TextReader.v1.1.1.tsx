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
}

// Parse chapters from text
function parseChapters(text: string): Chapter[] {
  if (!text) return [{ title: '正文', index: 0, startLine: 0, endLine: 0 }];
  
  const lines = text.split('\n');
  const rawChapters: { title: string; startLine: number }[] = [];
  const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+章|Chapter\s+\d+|\d+\.|【.*?】|.*?章.*?)[\s:：]/i;

  lines.forEach((line, index) => {
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
    for (let i = 0; i < lines.length; i += 200) {
      rawChapters.push({
        title: `第${Math.floor(i / 200) + 1}部分`,
        startLine: i,
      });
    }
  }

  // Build chapters with endLine
  const chapters: Chapter[] = rawChapters.map((c, i) => ({
    title: c.title,
    index: i,
    startLine: c.startLine,
    endLine: i < rawChapters.length - 1 ? rawChapters[i + 1].startLine - 1 : lines.length - 1,
  }));

  return chapters;
}

function getSavedProgress(bookId: string): { line: number; chapter: number } {
  try {
    const saved = localStorage.getItem(`reader-progress-${bookId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { line: parsed.line || 0, chapter: parsed.chapter || 0 };
    }
  } catch {}
  return { line: 0, chapter: 0 };
}

function saveProgress(bookId: string, lineIndex: number, chapterIndex: number) {
  try {
    localStorage.setItem(`reader-progress-${bookId}`, JSON.stringify({ line: lineIndex, chapter: chapterIndex }));
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
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [isAutoReading, setIsAutoReading] = useState(false);
  const [autoReadSpeed, setAutoReadSpeed] = useState(200);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const [currentTime, setCurrentTime] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const autoReadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const headerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const hasInitialized = useRef(false);

  const lines = useMemo(() => content.split('\n'), [content]);
  const chapters = useMemo(() => parseChapters(content), [content]);
  const currentTheme = THEMES[settings.theme] || THEMES[0];
  const totalLines = lines.length;

  // Lines per page for page mode
  const linesPerPage = 25;
  const totalPages = Math.max(1, Math.ceil(totalLines / linesPerPage));
  const currentPage = Math.floor(currentLine / linesPerPage);
  const progressPercent = Math.round((currentLine / Math.max(1, totalLines - 1)) * 100);

  // Find chapter index from line - FIXED
  const findChapterIndex = (lineIndex: number): number => {
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (lineIndex >= chapters[i].startLine) {
        return i;
      }
    }
    return 0;
  };

  // Initialize - load saved progress only once
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const saved = getSavedProgress(bookId);
    if (saved.line > 0 && saved.line < totalLines) {
      setCurrentLine(saved.line);
      const chapterIdx = findChapterIndex(saved.line);
      setCurrentChapter(chapterIdx);
    } else if (saved.chapter > 0 && saved.chapter < chapters.length) {
      setCurrentChapter(saved.chapter);
      setCurrentLine(chapters[saved.chapter].startLine);
    }
  }, [bookId, totalLines, chapters.length]);

  // Sync scroll position when currentLine changes in scroll mode
  useEffect(() => {
    if (settings.pageMode === 'scroll' && containerRef.current && !isAutoReading) {
      const lineHeightPx = settings.fontSize * settings.lineHeight;
      const targetScroll = currentLine * lineHeightPx;
      if (Math.abs(containerRef.current.scrollTop - targetScroll) > lineHeightPx * 2) {
        containerRef.current.scrollTop = targetScroll;
      }
    }
  }, [currentLine, settings.pageMode, settings.fontSize, settings.lineHeight, isAutoReading]);

  // Update chapter when currentLine changes
  useEffect(() => {
    const newChapter = findChapterIndex(currentLine);
    if (newChapter !== currentChapter) {
      setCurrentChapter(newChapter);
    }
  }, [currentLine, currentChapter, chapters]);

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
    saveProgress(bookId, currentLine, currentChapter);
  }, [currentLine, currentChapter, bookId]);

  // Auto reading
  useEffect(() => {
    if (isAutoReading) {
      autoReadRef.current = setInterval(() => {
        if (settings.pageMode === 'scroll') {
          if (containerRef.current) {
            containerRef.current.scrollTop += 2;
            const lineHeightPx = settings.fontSize * settings.lineHeight;
            const newLine = Math.floor(containerRef.current.scrollTop / lineHeightPx);
            if (newLine !== currentLine && newLine < totalLines) {
              setCurrentLine(newLine);
            }
          }
        } else {
          // Page mode auto read - advance line by line
          setCurrentLine(prev => {
            const nextLine = prev + 1;
            if (nextLine >= totalLines) {
              setIsAutoReading(false);
              return prev;
            }
            return nextLine;
          });
        }
      }, autoReadSpeed);
    }
    return () => {
      if (autoReadRef.current) clearInterval(autoReadRef.current);
    };
  }, [isAutoReading, autoReadSpeed, settings.pageMode, currentLine, totalLines, settings.fontSize, settings.lineHeight]);

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
          goToLine(0);
          break;
        case 'End':
          e.preventDefault();
          goToLine(totalLines - 1);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showSettings, showChapters, currentLine, totalLines, settings.pageMode, currentChapter, chapters]);

  // Scroll handler for scroll mode - FIXED chapter tracking
  const handleScroll = () => {
    if (!containerRef.current || settings.pageMode !== 'scroll') return;
    const lineHeightPx = settings.fontSize * settings.lineHeight;
    const newLine = Math.floor(containerRef.current.scrollTop / lineHeightPx);
    if (newLine >= 0 && newLine < totalLines && newLine !== currentLine) {
      setCurrentLine(newLine);
    }
  };

  const goToLine = (lineIndex: number) => {
    const clampedLine = Math.max(0, Math.min(lineIndex, totalLines - 1));
    setCurrentLine(clampedLine);
    
    if (containerRef.current) {
      if (settings.pageMode === 'scroll') {
        const lineHeightPx = settings.fontSize * settings.lineHeight;
        containerRef.current.scrollTop = clampedLine * lineHeightPx;
      } else {
        containerRef.current.scrollTop = 0;
      }
    }
  };

  // FIXED: goToNext - properly advance to next page/chapter
  const goToNext = () => {
    if (settings.pageMode === 'page') {
      // Page mode: advance by linesPerPage
      const currentChapterEnd = chapters[currentChapter]?.endLine ?? totalLines - 1;
      const nextLine = Math.min(currentLine + linesPerPage, totalLines - 1);
      
      // If we're at the end of current chapter, go to next chapter
      if (currentLine >= currentChapterEnd && currentChapter < chapters.length - 1) {
        const nextChapter = chapters[currentChapter + 1];
        goToLine(nextChapter.startLine);
      } else {
        goToLine(nextLine);
      }
    } else {
      // Scroll mode: scroll down by viewport height
      if (containerRef.current) {
        containerRef.current.scrollTop += containerRef.current.clientHeight * 0.9;
      }
    }
  };

  // FIXED: goToPrev - properly go back
  const goToPrev = () => {
    if (settings.pageMode === 'page') {
      const currentChapterStart = chapters[currentChapter]?.startLine ?? 0;
      const prevLine = Math.max(currentLine - linesPerPage, 0);
      
      // If we're at the start of current chapter, go to previous chapter's start
      if (currentLine <= currentChapterStart && currentChapter > 0) {
        const prevChapter = chapters[currentChapter - 1];
        goToLine(prevChapter.startLine);
      } else {
        goToLine(prevLine);
      }
    } else {
      // Scroll mode: scroll up by viewport height
      if (containerRef.current) {
        containerRef.current.scrollTop -= containerRef.current.clientHeight * 0.9;
      }
    }
  };

  // FIXED: goToChapter - properly jump to chapter
  const goToChapter = (index: number) => {
    const chapter = chapters[index];
    if (!chapter) return;
    setCurrentChapter(index);
    goToLine(chapter.startLine);
    setShowChapters(false);
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

  const renderContent = () => {
    const startLine = settings.pageMode === 'page' 
      ? currentPage * linesPerPage 
      : 0;
    const endLine = settings.pageMode === 'page'
      ? Math.min(startLine + linesPerPage, totalLines)
      : totalLines;
    const displayLines = settings.pageMode === 'page'
      ? lines.slice(startLine, endLine)
      : lines;

    return (
      <div style={{ 
        fontSize: `${settings.fontSize}px`,
        fontFamily: settings.fontFamily,
        lineHeight: settings.lineHeight,
        letterSpacing: `${settings.letterSpacing}px`,
        textAlign: settings.textAlign,
        color: currentTheme.text,
      }}>
        {displayLines.map((line, i) => {
          const actualIndex = settings.pageMode === 'page' ? startLine + i : i;
          return (
            <p 
              key={actualIndex}
              style={{ marginBottom: `${settings.paragraphSpacing}em` }}
              className="break-words"
            >
              {line.trim() || '\u00A0'}
            </p>
          );
        })}
      </div>
    );
  };

  // FIXED: Immersive mode chapter button handler
  const handleImmersiveChapterClick = () => {
    setShowChapters(true);
  };

  // Immersive mode
  if (isImmersive) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col" style={{ backgroundColor: currentTheme.bg }}>
        {/* Time - bottom left */}
        <div className="absolute bottom-6 left-6 z-10 text-xs opacity-40" style={{ color: currentTheme.text }}>
          {currentTime}
        </div>
        
        {/* Exit button - top right */}
        <button
          onClick={toggleImmersive}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium opacity-40 hover:opacity-100 transition-all"
          style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
        >
          出
        </button>

        {/* FIXED: Chapter button - top left, opens chapter sheet */}
        <button
          onClick={handleImmersiveChapterClick}
          className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full text-xs font-medium opacity-60 hover:opacity-100 transition-all"
          style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
        >
          {chapters[currentChapter]?.title.slice(0, 15) || '无章节'}
        </button>

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
            {renderContent()}
          </div>
        </div>

        {/* Progress - bottom center */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs opacity-40" style={{ color: currentTheme.text }}>
          {progressPercent}%
        </div>

        {/* FIXED: Chapters Sheet for immersive mode */}
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
                  className={`w-full text-left px-4 py-3 transition-all ${currentChapter === index ? 'bg-primary/10' : 'hover:bg-black/5'}`}
                  style={{ borderBottom: `1px solid ${currentTheme.text}08` }}
                >
                  <p className="text-sm font-medium truncate" style={{ color: currentTheme.text }}>{chapter.title}</p>
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
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: currentTheme.bg }}>
      {/* Header */}
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
              {chapters[currentChapter]?.title || '无章节'} · {progressPercent}%
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
          {renderContent()}
        </div>
      </div>

      {/* Footer */}
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
              {currentPage + 1} / {totalPages}页
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
                  <button key={i} onClick={() => updateSetting('theme', i)} className={`aspect-square rounded-lg border-2 ${settings.theme === i ? 'border-primary' : 'border-transparent'}`} style={{ backgroundColor: t.bg }}>
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
                className={`w-full text-left px-4 py-3 transition-all ${currentChapter === index ? 'bg-primary/10' : 'hover:bg-black/5'}`}
                style={{ borderBottom: `1px solid ${currentTheme.text}08` }}
              >
                <p className="text-sm font-medium truncate" style={{ color: currentTheme.text }}>{chapter.title}</p>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
