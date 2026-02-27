import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

// ============================== 🔧 类型定义 ==============================
interface Chapter {
  title: string;
  index: number;
  startLine: number;
  endLine: number;
  lines: string[];
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
  lineInChapter: number;
  timestamp: number;
}

interface TextReaderProps {
  content: string;
  title: string;
  bookId: string;
  onClose: () => void;
}

// ============================== 🎨 主题与配置 ==============================
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
  { name: '滚动', value: 'scroll' },
  { name: '翻页', value: 'page' },
];

const TEXT_ALIGNS = [
  { name: '左对齐', value: 'left' },
  { name: '居中', value: 'center' },
  { name: '两端对齐', value: 'justify' },
];

// ============================== 🛠 工具函数 ==============================

/**
 * 清理小说内容，移除广告、多余换行等
 */
function cleanNovelContent(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // 更精确的广告模式匹配，避免误删内容
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
    /丨[^\\n]*?丨/g,
    /\s*http[s]?:\/\/[^\s]+/gi,
    /QQ群[:：]?\s*\d+/gi,
    /.*?提示.*?本.*?小.*?说.*?更.*?新.*?首.*?发.*?地.*?址.*?/gi,
    /.*?最.*?快.*?更.*?新.*?小.*?说.*?网.*?/gi,
    /.*?最.*?新.*?最.*?快.*?小.*?说.*?/gi,
    /.*?电.*?子.*?书.*?下.*?载.*?/gi,
  ];

  adPatterns.forEach((pattern) => {
    text = text.replace(pattern, '');
  });

  // 保留更多原始格式，只清理明显的重复换行
  text = text.replace(/\n{3,}/g, '\n\n');
  
  // 按行分割并过滤明显无效的行
  const lines = text.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed === '') return true; // 保留空行
    
    // 检查是否包含有意义的内容
    const meaningfulPattern = /[a-zA-Z\u4e00-\u9fa5]/; // 中文或英文字符
    if (meaningfulPattern.test(trimmed)) return true;
    
    // 检查是否是过短的非中文/英文行
    if (trimmed.length <= 5) {
      // 如果是纯数字、纯符号或特定模式，则过滤掉
      const nonMeaningfulPattern = /^[0-9\s\.\-\_\=\+\*\#\@\!\~\%\^\&\(\)\[\]\{\}\<\>\|\'\"\,\.\/\?\:;]*$/;
      return !nonMeaningfulPattern.test(trimmed);
    }
    
    return true; // 保留较长的行
  });
  
  text = filteredLines.join('\n');
  
  // 再次清理多余的换行
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * 解析章节结构
 */
function parseChapters(text: string): Chapter[] {
  if (!text) return [{ title: '正文', index: 0, startLine: 0, endLine: 0, lines: [] }];

  const allLines = text.split('\n');
  const rawChapters: { title: string; startLine: number }[] = [];
  
  // 更宽松的章节识别模式
  const chapterRegex = /^(第[一二三四五六七八九十百千万零\d]+[章节篇部]|Chapter\s+\d+|\d+\.|【.*?】|.*?章.*?)[\s:：]/i;

  allLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 100) { // 合理长度限制
      if (chapterRegex.test(trimmed) || 
          (trimmed.includes('章') && trimmed.length > 2 && /[a-zA-Z\u4e00-\u9fa5]/.test(trimmed))) {
        rawChapters.push({
          title: trimmed.slice(0, 50) || `第${rawChapters.length + 1}章`,
          startLine: index,
        });
      }
    }
  });

  // 如果没找到章节，按固定长度分段
  if (rawChapters.length === 0) {
    for (let i = 0; i < allLines.length; i += 500) {
      rawChapters.push({
        title: `第${Math.floor(i / 500) + 1}部分`,
        startLine: i,
      });
    }
  }

  return rawChapters.map((c, i) => {
    const endLine = i < rawChapters.length - 1 ? rawChapters[i + 1].startLine - 1 : allLines.length - 1;
    return {
      title: c.title,
      index: i,
      startLine: c.startLine,
      endLine,
      lines: allLines.slice(c.startLine, endLine + 1),
    };
  });
}

/**
 * 自动检测并解码文本编码（支持UTF-8、GBK、GB18030）
 */
function detectAndDecode(buffer: ArrayBuffer): string {
  const encodings = ['utf-8', 'gbk', 'gb18030'] as const;
  const decoder = new TextDecoder();

  // 尝试使用BOM检测UTF-8
  const uint8Array = new Uint8Array(buffer);
  if (uint8Array.length >= 3 && uint8Array[0] === 0xef && uint8Array[1] === 0xbb && uint8Array[2] === 0xbf) {
    return decoder.decode(buffer);
  }

  // 尝试多种编码
  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true });
      return decoder.decode(buffer);
    } catch (e) {
      continue;
    }
  }

  // 最终降级方案
  return decoder.decode(buffer);
}

/**
 * 加载本地设置
 */
function loadSettings(): ReaderSettings {
  const defaults: ReaderSettings = {
    fontSize: 18,
    fontFamily: FONTS[0].value,
    theme: 0,
    pageMode: 'scroll',
    lineHeight: 1.75,
    letterSpacing: 0.3,
    textAlign: 'left',
    paragraphSpacing: 1.2,
    autoHideHeader: true,
  };

  try {
    const saved = localStorage.getItem('text-reader-settings-v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.theme == null) parsed.theme = 0;
      return { ...defaults, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load settings', e);
  }
  return defaults;
}

/**
 * 保存设置到localStorage
 */
function saveSettings(settings: ReaderSettings) {
  try {
    localStorage.setItem('text-reader-settings-v2', JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

/**
 * 获取书籍阅读进度
 */
function getSavedProgress(bookId: string): Progress {
  try {
    const saved = localStorage.getItem(`reader-progress-v6-${bookId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        chapter: typeof parsed.chapter === 'number' ? Math.max(0, parsed.chapter) : 0,
        lineInChapter: typeof parsed.lineInChapter === 'number' ? Math.max(0, parsed.lineInChapter) : 0,
        timestamp: Date.now(),
      };
    }
  } catch (e) {
    console.warn(`Failed to read progress for ${bookId}`, e);
  }
  return { chapter: 0, lineInChapter: 0, timestamp: Date.now() };
}

/**
 * 保存阅读进度
 */
function saveProgress(bookId: string, progress: Omit<Progress, 'timestamp'>) {
  try {
    const data = { ...progress, timestamp: Date.now() };
    localStorage.setItem(`reader-progress-v6-${bookId}`, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save progress for ${bookId}`, e);
  }
}

// ============================== 📖 虚拟滚动组件 ==============================
interface VirtualScrollProps {
  chapters: Chapter[];
  settings: ReaderSettings;
  currentTheme: { bg: string; text: string };
  onLineInChapterChange?: (lineIndex: number) => void;
}

const VirtualScrollContent: React.FC<VirtualScrollProps> = ({ 
  chapters, 
  settings, 
  currentTheme,
  onLineInChapterChange 
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  // 计算总行数
  const totalLines = useMemo(() => {
    return chapters.reduce((sum, c) => sum + c.lines.length, 0);
  }, [chapters]);

  // 计算行高的稳定函数
  const getItemHeight = useCallback((index: number): number => {
    const baseHeight = Math.max(30, settings.fontSize * settings.lineHeight + settings.paragraphSpacing * 16);
    
    let accumulated = 0;
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (index < accumulated + chapter.lines.length) {
        const lineIndex = index - accumulated;
        const line = chapter.lines[lineIndex] || '';
        if (line.length > 50) {
          return baseHeight * 1.2;
        }
        return baseHeight;
      }
      accumulated += chapter.lines.length;
    }
    return baseHeight;
  }, [settings.fontSize, settings.lineHeight, settings.paragraphSpacing, chapters]);

  // 虚拟滚动器
  const virtualizer = useVirtualizer({
    count: totalLines,
    getScrollElement: () => parentRef.current,
    estimateSize: getItemHeight,
    overscan: 10,
  });

  // 渲染行
  const renderRow = useCallback((index: number) => {
    let accumulated = 0;
    let chapterIndex = 0;
    let lineIndex = 0;
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (index < accumulated + chapter.lines.length) {
        chapterIndex = i;
        lineIndex = index - accumulated;
        break;
      }
      accumulated += chapter.lines.length;
    }
    
    const chapter = chapters[chapterIndex];
    if (!chapter) return null;
    
    const line = chapter.lines[lineIndex] || '';

    return (
      <p
        key={`${chapterIndex}-${lineIndex}`}
        style={{
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          lineHeight: settings.lineHeight,
          letterSpacing: `${settings.letterSpacing}px`,
          textAlign: settings.textAlign,
          color: currentTheme.text,
          marginBottom: `${settings.paragraphSpacing}em`,
          padding: '0 1rem',
        }}
        className="break-words"
      >
        {line.trim() || '\u00A0'}
      </p>
    );
  }, [chapters, settings, currentTheme]);

  if (totalLines === 0) {
    return <div className="flex items-center justify-center h-full text-gray-400">暂无内容</div>;
  }

  return (
    <div
      ref={parentRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        position: 'relative',
        contain: 'strict',
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
            data-index={virtualItem.index}
            ref={(node) => virtualizer.measureElement(node)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
              boxSizing: 'border-box',
            }}
          >
            {renderRow(virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================== 📖 主组件 ==============================
export function TextReader({ content: rawContent, title, bookId, onClose }: TextReaderProps) {
  // ============================== 🔐 自动编码转换层 ==============================
  const decodedContent = useMemo(() => {
    try {
      const encoder = new TextEncoder();
      const buffer = encoder.encode(rawContent);
      return detectAndDecode(buffer.buffer);
    } catch (e) {
      console.warn('Encoding detection failed, using raw content', e);
      return rawContent;
    }
  }, [rawContent]);

  const cleanedContent = useMemo(() => cleanNovelContent(decodedContent), [decodedContent]);
  const isContentEmpty = !cleanedContent || cleanedContent.length === 0;

  if (isContentEmpty) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="text-center p-6 max-w-md">
          <p className="text-muted-foreground mb-4">文件内容为空或无法解析</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  // ============================== ⚙️ 状态管理 ==============================
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
  const autoReadRef = useRef<number | null>(null);
  const headerTimeoutRef = useRef<number | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const hasInitialized = useRef(false);
  
  const currentTheme = useMemo(() => THEMES[settings.theme] || THEMES[0], [settings.theme]);
  
  const chapters = useMemo(() => parseChapters(cleanedContent), [cleanedContent]);

  // 确保 currentChapterData 始终有效
  const currentChapterData = useMemo(() => {
    if (chapters.length === 0) return null;
    return chapters[currentChapter] || chapters[0];
  }, [chapters, currentChapter]);

  const totalLinesInChapter = currentChapterData?.lines?.length || 0;
  const totalChapters = chapters.length;

  const totalLinesAll = useMemo(() => 
    chapters.reduce((sum, c) => sum + (c.lines?.length || 0), 0),
  [chapters]);

  const linesBeforeCurrent = useMemo(() => 
    chapters.slice(0, currentChapter).reduce((sum, c) => sum + (c.lines?.length || 0), 0),
  [chapters, currentChapter]);

  const globalLineIndex = linesBeforeCurrent + lineInChapter;
  const progressPercent = useMemo(() => 
    Math.round((globalLineIndex / Math.max(1, totalLinesAll)) * 100),
  [globalLineIndex, totalLinesAll]);

  // ============================== 📌 初始化与进度恢复 ==============================
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const saved = getSavedProgress(bookId);
    if (saved.chapter >= 0 && saved.chapter < chapters.length) {
      setCurrentChapter(saved.chapter);
      const chapter = chapters[saved.chapter];
      const maxLine = Math.max(0, (chapter?.lines?.length || 1) - 1);
      setLineInChapter(Math.min(saved.lineInChapter, maxLine));
    } else if (chapters.length > 0) {
      setCurrentChapter(0);
      setLineInChapter(0);
    }
  }, [bookId, chapters]);

  // 定时保存进度（防高频写入）
  useEffect(() => {
    const save = () => saveProgress(bookId, { chapter: currentChapter, lineInChapter });
    const id = setTimeout(save, 500);
    return () => clearTimeout(id);
  }, [currentChapter, lineInChapter, bookId]);

  // 页面卸载前强制保存
  useEffect(() => {
    const handleUnload = () => saveProgress(bookId, { chapter: currentChapter, lineInChapter });
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [bookId, currentChapter, lineInChapter]);

  // ============================== 🕒 时间更新 ==============================
  useEffect(() => {
    const update = () => setCurrentTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  // ============================== 📼 自动阅读 ==============================
  useEffect(() => {
    if (isAutoReading) {
      autoReadRef.current = window.setInterval(() => {
        if (settings.pageMode === 'scroll') {
          const activeContainer = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
          if (activeContainer) activeContainer.scrollTop += 2;
        } else {
          goToNext();
        }
      }, autoReadSpeed);
    }
    return () => {
      if (autoReadRef.current) clearInterval(autoReadRef.current);
    };
  }, [isAutoReading, autoReadSpeed, settings.pageMode, isImmersive, lineInChapter, currentChapter, chapters]);

  // ============================== ⚙️ 设置持久化 ==============================
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // ============================== 👁️ 自动隐藏顶栏 ==============================
  useEffect(() => {
    if (!settings.autoHideHeader || isImmersive) return;

    const show = () => {
      setShowHeader(true);
      if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
      headerTimeoutRef.current = window.setTimeout(() => setShowHeader(false), 3000);
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

  // ============================== ⌨️ 键盘控制 ==============================
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
  }, [showSettings, showChapters, chapters.length, settings.pageMode, isImmersive, lineInChapter, currentChapter]);

  // ============================== 🚪 导航控制 ==============================
  const goToNext = useCallback(() => {
    if (settings.pageMode === 'page') {
      const linesPerPage = 25;
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
  }, [settings.pageMode, lineInChapter, totalLinesInChapter, currentChapter, chapters.length, isImmersive]);

  const goToPrev = useCallback(() => {
    if (settings.pageMode === 'page') {
      const linesPerPage = 25;
      const prevLine = lineInChapter - linesPerPage;
      if (prevLine < 0 && currentChapter > 0) {
        const prevChapter = chapters[currentChapter - 1];
        const prevChapterLines = prevChapter?.lines?.length || 0;
        setCurrentChapter(currentChapter - 1);
        setLineInChapter(Math.max(0, prevChapterLines - linesPerPage));
      } else if (prevLine >= 0) {
        setLineInChapter(prevLine);
      }
    } else {
      const activeContainer = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
      if (activeContainer) {
        activeContainer.scrollBy({ top: -activeContainer.clientHeight * 0.9, behavior: 'smooth' });
      }
    }
  }, [settings.pageMode, lineInChapter, currentChapter, chapters, isImmersive]);

  const goToChapter = useCallback((index: number) => {
    if (index < 0 || index >= chapters.length) return;
    setCurrentChapter(index);
    setLineInChapter(0);
    setShowChapters(false);
    
    // 滚动到顶部
    const container = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
    if (container) container.scrollTop = 0;
  }, [chapters.length, isImmersive]);

  const toggleImmersive = useCallback(() => {
    const newImmersive = !isImmersive;
    setIsImmersive(newImmersive);
    if (newImmersive) {
      setShowHeader(false);
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => console.warn('Fullscreen failed:', err));
      }
    } else {
      setShowHeader(true);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.warn('Exit fullscreen failed:', err));
      }
    }
  }, [isImmersive]);

  // ============================== 🖱️ 触控交互 ==============================
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) goToNext();
      else goToPrev();
    }
  }, [goToNext, goToPrev]);

  const onContentClick = useCallback((e: React.MouseEvent) => {
    if (settings.pageMode === 'scroll' && !isImmersive) return;
    const activeContainer = isImmersive ? immersiveContainerRef.current : normalContainerRef.current;
    const rect = activeContainer?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.25) goToPrev();
    else if (x > rect.width * 0.75) goToNext();
  }, [settings.pageMode, isImmersive, goToNext, goToPrev]);

  const updateSetting = useCallback(<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // ============================== 🖼️ 渲染逻辑 ==============================
  const renderContent = () => {
    if (!currentChapterData || !currentChapterData.lines) {
      return <div className="flex items-center justify-center h-full">加载中...</div>;
    }

    if (settings.pageMode === 'page') {
      const startLine = lineInChapter;
      const endLine = Math.min(lineInChapter + 25, currentChapterData.lines.length);
      const visibleLines = currentChapterData.lines.slice(startLine, endLine);
      
      if (visibleLines.length === 0) {
        return <div className="flex items-center justify-center h-full">本章无内容</div>;
      }

      return (
        <div className="max-w-2xl mx-auto">
          {visibleLines.map((line, idx) => (
            <p
              key={`${currentChapter}-${startLine + idx}`}
              style={{
                fontSize: `${settings.fontSize}px`,
                fontFamily: settings.fontFamily,
                lineHeight: settings.lineHeight,
                letterSpacing: `${settings.letterSpacing}px`,
                textAlign: settings.textAlign,
                color: currentTheme.text,
                marginBottom: `${settings.paragraphSpacing}em`,
                padding: '0 1rem',
              }}
              className="break-words"
            >
              {line?.trim() || '\u00A0'}
            </p>
          ))}
        </div>
      );
    }

    // 滚动模式使用虚拟滚动
    return (
      <VirtualScrollContent 
        chapters={chapters} 
        settings={settings} 
        currentTheme={currentTheme}
      />
    );
  };

  const ChapterList = useCallback(({ onSelect }: { onSelect: (index: number) => void }) => (
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
  ), [chapters, currentChapter, currentTheme.text]);

  // ============================== 🍃 沉浸模式 ==============================
  if (isImmersive) {
    return (
      <div 
        className="fixed inset-0 z-[100] flex flex-col" 
        style={{ backgroundColor: currentTheme.bg }}
        key={`immersive-${currentChapter}`} // 强制重新挂载避免迟钝
      >
        {/* Header & Controls */}
        <div className="absolute bottom-6 left-6 z-10 text-xs opacity-50" style={{ color: currentTheme.text }}>
          {currentTime}
        </div>
        <button
          onClick={() => setShowChapters(true)}
          className="absolute top-4 left-4 z-10 h-9 px-4 rounded-full text-sm font-medium transition-all hover:scale-105"
          style={{ backgroundColor: `${currentTheme.text}30`, color: currentTheme.text }}
        >
          <span className="max-w-[140px] truncate block">
            {currentChapterData?.title ? currentChapterData.title.slice(0, 15) : '无章节'}
          </span>
        </button>
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <button
            onClick={() => currentChapter > 0 && goToChapter(currentChapter - 1)}
            disabled={currentChapter === 0}
            className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ backgroundColor: `${currentTheme.text}25`, color: currentTheme.text }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => currentChapter < chapters.length - 1 && goToChapter(currentChapter + 1)}
            disabled={currentChapter >= chapters.length - 1}
            className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ backgroundColor: `${currentTheme.text}25`, color: currentTheme.text }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={toggleImmersive}
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium hover:scale-110 ml-1"
            style={{ backgroundColor: `${currentTheme.text}30`, color: currentTheme.text }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div
          ref={immersiveContainerRef}
          className="flex-1 overflow-auto px-6 py-16"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={onContentClick}
        >
          {settings.pageMode === 'page' ? (
            <div className="max-w-2xl mx-auto">
              {currentChapterData?.lines?.slice(lineInChapter, lineInChapter + 25).map((line, idx) => (
                <p
                  key={`imm-${currentChapter}-${lineInChapter + idx}`}
                  style={{
                    fontSize: `${settings.fontSize}px`,
                    fontFamily: settings.fontFamily,
                    lineHeight: settings.lineHeight,
                    letterSpacing: `${settings.letterSpacing}px`,
                    textAlign: settings.textAlign,
                    color: currentTheme.text,
                    marginBottom: `${settings.paragraphSpacing}em`,
                    padding: '0 1rem',
                  }}
                  className="break-words"
                >
                  {line?.trim() || '\u00A0'}
                </p>
              ))}
            </div>
          ) : (
            <VirtualScrollContent 
              chapters={chapters} 
              settings={settings} 
              currentTheme={currentTheme}
            />
          )}
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs opacity-50" style={{ color: currentTheme.text }}>
          {progressPercent}%
        </div>

        {/* Chapters Modal */}
        {showChapters && (
          <div className="fixed inset-0 z-[200] flex" onClick={() => setShowChapters(false)}>
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
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <ChapterList onSelect={goToChapter} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================== 🖼️ 默认模式 ==============================
  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col" 
      style={{ backgroundColor: currentTheme.bg }}
      key={`normal-${currentChapter}`}
    >
      <header
        className={`flex items-center justify-between px-3 py-2 border-b flex-shrink-0 transition-all duration-300 ${
          showHeader ? 'opacity-100' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
        style={{ borderColor: `${currentTheme.text}12` }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={onClose}
            className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-black/5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" style={{ color: currentTheme.text }}>
              {title}
            </p>
            <p className="text-xs opacity-50 truncate" style={{ color: currentTheme.text }}>
              {currentChapterData?.title || '无章节'} · {progressPercent}%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={toggleImmersive}
            className="h-8 px-2.5 text-xs hover:bg-black/5 rounded-md transition-colors"
            style={{ color: currentTheme.text }}
          >
            沉
          </button>
          <button
            onClick={() => setShowChapters(true)}
            className="h-8 w-8 flex items-center justify-center hover:bg-black/5 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="h-8 w-8 flex items-center justify-center hover:bg-black/5 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V23a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </header>

      <div
        ref={normalContainerRef}
        className="flex-1 overflow-auto relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onContentClick}
      >
        <div className="max-w-2xl mx-auto px-4 py-4">
          {renderContent()}
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
            <button
              onClick={() => setIsAutoReading(!isAutoReading)}
              className="h-8 gap-1.5 flex items-center justify-center hover:bg-black/5 rounded-md px-2"
            >
              {isAutoReading ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              )}
              <span className="text-xs" style={{ color: currentTheme.text }}>
                {isAutoReading ? '停止' : '自动'}
              </span>
            </button>
            <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>
              {settings.pageMode === 'page'
                ? `${Math.floor(lineInChapter / 25) + 1}/${Math.ceil(totalLinesInChapter / 25)}页`
                : `${currentChapter + 1}/${totalChapters}章`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>
              {progressPercent}%
            </span>
          </div>
        </div>
      </footer>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 z-[200] flex justify-end" onClick={() => setShowSettings(false)}>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: currentTheme.text }}>
                    字体大小
                  </span>
                  <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>
                    {settings.fontSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="32"
                  step="1"
                  value={settings.fontSize}
                  onChange={e => updateSetting('fontSize', Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-2">
                <span className="text-sm" style={{ color: currentTheme.text }}>
                  字体
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(f => (
                    <button
                      key={f.name}
                      onClick={() => updateSetting('fontFamily', f.value)}
                      className={`text-xs h-9 rounded-md border transition-colors ${
                        settings.fontFamily === f.value ? 'border-primary bg-primary/10' : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={{ fontFamily: f.value }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-sm" style={{ color: currentTheme.text }}>
                  背景主题
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {THEMES.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => updateSetting('theme', i)}
                      className={`aspect-square rounded-lg border-2 transition-all ${
                        settings.theme === i ? 'border-primary' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: t.bg }}
                    >
                      <span style={{ color: t.text, fontSize: '10px' }}>{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-sm" style={{ color: currentTheme.text }}>
                  翻页方式
                </span>
                <div className="flex gap-2">
                  {PAGE_MODES.map(m => (
                    <button
                      key={m.value}
                      onClick={() => updateSetting('pageMode', m.value as 'scroll' | 'page')}
                      className={`flex-1 gap-2 h-9 rounded-md border transition-colors ${
                        settings.pageMode === m.value
                          ? 'border-primary bg-primary/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-sm" style={{ color: currentTheme.text }}>
                  文字对齐
                </span>
                <div className="flex gap-2">
                  {TEXT_ALIGNS.map(a => (
                    <button
                      key={a.value}
                      onClick={() => updateSetting('textAlign', a.value as 'left' | 'center' | 'justify')}
                      className={`flex-1 gap-2 h-9 rounded-md border transition-colors ${
                        settings.textAlign === a.value
                          ? 'border-primary bg-primary/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: currentTheme.text }}>
                    行间距
                  </span>
                  <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>
                    {settings.lineHeight.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="1.2"
                  max="2.5"
                  step="0.1"
                  value={settings.lineHeight}
                  onChange={e => updateSetting('lineHeight', Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: currentTheme.text }}>
                    字间距
                  </span>
                  <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>
                    {settings.letterSpacing.toFixed(1)}px
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={settings.letterSpacing}
                  onChange={e => updateSetting('letterSpacing', Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: currentTheme.text }}>
                    段间距
                  </span>
                  <span className="text-xs opacity-50" style={{ color: currentTheme.text }}>
                    {settings.paragraphSpacing.toFixed(1)}em
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.paragraphSpacing}
                  onChange={e => updateSetting('paragraphSpacing', Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.5 1.65 1.65 0 0 0 1.5 1 1.65 1.65 0 0 0 1-1.5 1.65 1.65 0 0 0-1.5-1 1.65 1.65 0 0 0-1 1.5 1.65 1.65 0 0 0 1.5 1 1.65 1.65 0 0 0 1-1.5 1.65 1.65 0 0 0-1.5-1z"></path>
                  </svg>
                  <span className="text-sm" style={{ color: currentTheme.text }}>
                    自动隐藏顶栏
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoHideHeader}
                  onChange={e => updateSetting('autoHideHeader', e.target.checked)}
                  className="accent-primary"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span className="text-sm" style={{ color: currentTheme.text }}>
                    自动阅读速度
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="10"
                  value={autoReadSpeed}
                  onChange={e => setAutoReadSpeed(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs opacity-50" style={{ color: currentTheme.text }}>
                  数值越小速度越快
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chapters Panel */}
      {showChapters && (
        <div className="fixed inset-0 z-[200] flex" onClick={() => setShowChapters(false)}>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <ChapterList onSelect={goToChapter} />
          </div>
        </div>
      )}
    </div>
  );
}