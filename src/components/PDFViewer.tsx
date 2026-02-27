import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  MessageSquare,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileDown,
  Maximize2,
  Minimize2,
  LayoutGrid,
  ScrollText,
  ArrowLeft,
  MoreVertical,
  Highlighter,
  Pencil,
  Trash2,
  PanelLeft,
  PanelRight,
  Check,
  ScanLine,
  GripHorizontal,
  Type,
  StickyNote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// 修复 Worker 配置（去除空格）
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFAnnotation {
  id: string;
  page: number;
  type: 'note' | 'highlight';
  content: string;
  color: string;
  x?: number;
  y?: number;
  rects?: Array<{ left: number; top: number; width: number; height: number }>;
  quote?: string;
  createdAt: string;
  updatedAt: string;
  bookId?: string;
}

interface Book {
  id: string;
  title: string;
  author?: string;
}

interface PDFViewerProps {
  fileUrl: string;
  book: Book;
  annotations: PDFAnnotation[];
  onAddAnnotation: (annotation: Omit<PDFAnnotation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateAnnotation: (id: string, content: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onDownloadFile?: (includeAnnotations: boolean) => void;
  onClose?: () => void;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 快捷批注按钮组件
const FloatingActionButton = ({
  isOpen,
  onToggle,
  onHighlight,
  onNote,
  activeTool,
  isMobile
}: {
  isOpen: boolean;
  onToggle: () => void;
  onHighlight: () => void;
  onNote: () => void;
  activeTool: 'select' | 'note' | 'highlight';
  isMobile: boolean;
}) => {
  if (!isMobile) return null;
  
  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-3 pointer-events-none">
      <div 
        className={cn(
          "flex flex-col gap-3 transition-all duration-300 pointer-events-auto",
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <Button
          variant={activeTool === 'highlight' ? 'default' : 'secondary'}
          size="lg"
          className="rounded-full shadow-xl h-14 w-14 border-2 border-background transition-transform hover:scale-110"
          onClick={onHighlight}
        >
          <Highlighter className="h-6 w-6" />
        </Button>
        <Button
          variant={activeTool === 'note' ? 'default' : 'secondary'}
          size="lg"
          className="rounded-full shadow-xl h-14 w-14 border-2 border-background transition-transform hover:scale-110"
          onClick={onNote}
        >
          <StickyNote className="h-6 w-6" />
        </Button>
      </div>
      <Button
        variant="default"
        size="lg"
        className={cn(
          "rounded-full shadow-2xl h-16 w-16 border-4 border-background transition-all duration-300 pointer-events-auto",
          isOpen && "rotate-45 bg-destructive hover:bg-destructive"
        )}
        onClick={onToggle}
      >
        <Plus className="h-8 w-8" />
      </Button>
    </div>
  );
};

export function PDFViewer({
  fileUrl,
  book,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onDownloadFile,
  onClose,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [viewMode, setViewMode] = useState<'single' | 'scroll' | 'thumbnails'>('single');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'thumbnails' | 'annotations'>('thumbnails');
  
  const [activeTool, setActiveTool] = useState<'select' | 'note' | 'highlight'>('select');
  const [selectedAnnotation, setSelectedAnnotation] = useState<PDFAnnotation | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<PDFAnnotation | null>(null);
  
  const [selection, setSelection] = useState<{
    text: string;
    rects: Array<{ left: number; top: number; width: number; height: number }>;
    page: number;
  } | null>(null);
  
  const [pendingNote, setPendingNote] = useState<{
    x: number;
    y: number;
    page: number;
  } | null>(null);
  
  const [isMobile, setIsMobile] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [showFloatingTools, setShowFloatingTools] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const toolbarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<number>(0);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
        setScale(0.8);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    const saved = localStorage.getItem(`pdf-progress-${book.id}`);
    if (saved) setPageNumber(parseInt(saved, 10));
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [book.id]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (isFs) {
        setImmersiveMode(true);
        resetToolbarTimer();
      } else {
        setImmersiveMode(false);
        setShowToolbar(true);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 沉浸模式自动隐藏工具栏
  const resetToolbarTimer = useCallback(() => {
    if (!immersiveMode && !isFullscreen && !isMobile) return;
    
    setShowToolbar(true);
    if (toolbarTimeout.current) clearTimeout(toolbarTimeout.current);
    
    // 沉浸模式下更快隐藏工具栏
    const delay = immersiveMode ? 2000 : 4000;
    toolbarTimeout.current = setTimeout(() => {
      if (!fabOpen && !selectedAnnotation && !pendingNote) {
        setShowToolbar(false);
      }
    }, delay);
  }, [immersiveMode, isFullscreen, isMobile, fabOpen, selectedAnnotation, pendingNote]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoadError(null);
    const saved = localStorage.getItem(`pdf-progress-${book.id}`);
    if (saved) {
      const page = parseInt(saved, 10);
      if (page <= numPages) setPageNumber(page);
    }
  }, [book.id]);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setLoadError('无法加载 PDF 文件');
    toast.error('PDF 加载失败');
  }, []);

  const goToPage = useCallback((page: number) => {
    const target = Math.max(1, Math.min(page, numPages));
    setPageNumber(target);
    localStorage.setItem(`pdf-progress-${book.id}`, String(target));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    // 移动端翻页后短暂显示工具栏
    if (isMobile || immersiveMode) {
      resetToolbarTimer();
    }
  }, [numPages, book.id, isMobile, immersiveMode, resetToolbarTimer]);

  const goToPrev = () => goToPage(pageNumber - 1);
  const goToNext = () => goToPage(pageNumber + 1);

  const handleZoom = useCallback((delta: number) => {
    setScale(s => Math.max(0.5, Math.min(3, s + delta)));
  }, []);

  const fitToWidth = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth || 800;
    const sidebarWidth = sidebarOpen && !isMobile ? 240 : 0;
    const availableWidth = containerWidth - sidebarWidth - 48;
    setScale(Math.min(availableWidth / 612, 2));
  }, [sidebarOpen, isMobile]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      toast.error('无法切换全屏模式');
    }
  }, []);

  const toggleImmersive = useCallback(() => {
    setImmersiveMode(prev => !prev);
    if (!immersiveMode) {
      resetToolbarTimer();
      toast.success('已进入沉浸模式，点击任意处显示工具栏');
    } else {
      setShowToolbar(true);
    }
  }, [immersiveMode, resetToolbarTimer]);

  const handleTextSelection = useCallback(() => {
    if (activeTool !== 'highlight' && activeTool !== 'select') return;
    
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelection(null);
      setShowFloatingTools(false);
      return;
    }
    
    const text = sel.toString().trim();
    if (!text) return;
    
    const range = sel.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).map(rect => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }));
    
    const pageElement = (range.startContainer.parentElement?.closest('.react-pdf__Page') ||
                        range.startContainer.parentElement?.closest('[data-page-number]')) as HTMLElement | null;
    
    if (pageElement) {
      const pageNum = parseInt(pageElement.getAttribute('data-page-number') || String(pageNumber), 10);
      setSelection({
        text,
        rects,
        page: pageNum,
      });
      // 自动显示浮动工具栏，如果是选择模式则提供快速高亮选项
      setShowFloatingTools(true);
      resetToolbarTimer();
    }
  }, [activeTool, pageNumber, resetToolbarTimer]);

  const addHighlight = useCallback((content: string = '') => {
    if (!selection) return;
    
    const pageElement = document.querySelector(`[data-page-number="${selection.page}"]`);
    if (!pageElement) return;
    
    const pageRect = pageElement.getBoundingClientRect();
    const relativeRects = selection.rects.map(rect => ({
      left: ((rect.left - pageRect.left) / pageRect.width) * 100,
      top: ((rect.top - pageRect.top) / pageRect.height) * 100,
      width: (rect.width / pageRect.width) * 100,
      height: (rect.height / pageRect.height) * 100,
    }));
    
    onAddAnnotation({
      bookId: book.id,
      page: selection.page,
      type: 'highlight',
      content,
      color: '#fef08a',
      rects: relativeRects,
      quote: selection.text,
    });
    
    setSelection(null);
    setShowFloatingTools(false);
    setActiveTool('select');
    window.getSelection()?.removeAllRanges();
    toast.success('高亮已添加');
  }, [selection, book.id, onAddAnnotation]);

  const handlePageClick = useCallback((e: React.MouseEvent, pageNum: number) => {
    if (activeTool !== 'note') return;
    
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    setPendingNote({ x, y, page: pageNum });
    setFabOpen(false);
  }, [activeTool]);

  const confirmAddNote = useCallback((content: string) => {
    if (!pendingNote || !content.trim()) return;
    
    onAddAnnotation({
      bookId: book.id,
      page: pendingNote.page,
      x: pendingNote.x,
      y: pendingNote.y,
      content: content.trim(),
      color: '#fbbf24',
      type: 'note',
    });
    
    setPendingNote(null);
    setActiveTool('select');
    toast.success('批注已添加');
  }, [pendingNote, book.id, onAddAnnotation]);

  const handleDelete = useCallback((id: string) => {
    onDeleteAnnotation(id);
    setSelectedAnnotation(null);
    setEditingAnnotation(null);
    toast.success('批注已删除');
  }, [onDeleteAnnotation]);

  // 快速笔记（不选位置，自动放在当前页中央）
  const quickAddNote = useCallback(() => {
    setActiveTool('note');
    setPendingNote({
      x: 0.5,
      y: 0.3,
      page: pageNumber
    });
    setFabOpen(false);
  }, [pageNumber]);

  // 快速高亮（如果已有选中文本则直接高亮，否则进入高亮模式）
  const quickHighlight = useCallback(() => {
    if (selection && selection.text) {
      addHighlight();
    } else {
      setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight');
      toast.info(activeTool === 'highlight' ? '已退出高亮模式' : '请选中文本进行高亮');
    }
    setFabOpen(false);
  }, [activeTool, selection, addHighlight]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      
      switch(e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          goToNext();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          goToPrev();
          break;
        case 'Home':
          e.preventDefault();
          goToPage(1);
          break;
        case 'End':
          e.preventDefault();
          goToPage(numPages);
          break;
        case 'h':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight');
          }
          break;
        case 'n':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setActiveTool(activeTool === 'note' ? 'select' : 'note');
          }
          break;
        case 'i':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleImmersive();
          }
          break;
        case 'Escape':
          if (fabOpen) {
            setFabOpen(false);
          } else if (selection) {
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          } else if (selectedAnnotation) {
            setSelectedAnnotation(null);
          } else if (pendingNote) {
            setPendingNote(null);
          } else if (activeTool !== 'select') {
            setActiveTool('select');
          } else if (immersiveMode) {
            setImmersiveMode(false);
            setShowToolbar(true);
          } else if (onClose) {
            onClose();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, goToPage, numPages, selectedAnnotation, pendingNote, activeTool, onClose, selection, immersiveMode, fabOpen, toggleImmersive]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    resetToolbarTimer();
    
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // 双击缩放
      setScale(s => s > 1.2 ? 1.0 : Math.min(2.0, s + 0.4));
    }
    lastTap.current = now;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current || viewMode !== 'single') return;
    
    const dx = touchStart.current.x - e.changedTouches[0].clientX;
    const dy = touchStart.current.y - e.changedTouches[0].clientY;
    
    // 水平滑动翻页
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0) goToNext();
      else goToPrev();
    }
    
    touchStart.current = null;
  };

  const onMouseMove = useCallback(() => {
    if (immersiveMode || isFullscreen) {
      resetToolbarTimer();
    }
  }, [immersiveMode, isFullscreen, resetToolbarTimer]);

  const currentAnnotations = useMemo(() => 
    annotations.filter(a => a.page === pageNumber),
  [annotations, pageNumber]);

  const renderHighlights = (pageNum: number) => {
    return annotations
      .filter(ann => ann.page === pageNum && ann.type === 'highlight' && ann.rects)
      .map(ann => (
        <div key={ann.id} className="absolute inset-0 pointer-events-none">
          {ann.rects!.map((rect, i) => (
            <div
              key={i}
              className="absolute bg-yellow-300/40 hover:bg-yellow-300/60 cursor-pointer pointer-events-auto transition-colors"
              style={{
                left: `${rect.left}%`,
                top: `${rect.top}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
              }}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setSelectedAnnotation(ann);
              }}
            />
          ))}
        </div>
      ));
  };

  if (viewMode === 'thumbnails') {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center justify-between p-3 border-b bg-muted/50 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setViewMode('single')}>
              <ScrollText className="h-4 w-4 mr-2" />
              阅读模式
            </Button>
          </div>
          <span className="font-medium text-sm truncate max-w-[200px]">{book.title}</span>
          <span className="text-xs text-muted-foreground">{numPages} 页</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4">
            <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError}>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => {
                      setPageNumber(page);
                      setViewMode('single');
                    }}
                    className="relative aspect-[3/4] rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                  >
                    <Page pageNumber={page} scale={0.2} renderTextLayer={false} renderAnnotationLayer={false} />
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] py-1 text-center">
                      {page}
                    </div>
                  </button>
                ))}
              </div>
            </Document>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "flex h-full bg-background overflow-hidden relative select-none",
        isFullscreen && "fixed inset-0 z-50 bg-black",
        immersiveMode && !isFullscreen && "fixed inset-0 z-40"
      )}
      onMouseMove={onMouseMove}
      onClick={resetToolbarTimer}
    >
      {/* 沉浸模式指示器 */}
      {immersiveMode && (
        <div className="absolute top-2 right-2 z-50 opacity-0 hover:opacity-100 transition-opacity">
          <Button variant="secondary" size="sm" className="bg-black/50 text-white border-0" onClick={toggleImmersive}>
            <Minimize2 className="h-4 w-4 mr-2" />
            退出沉浸
          </Button>
        </div>
      )}

      {/* 全屏退出按钮 */}
      {isFullscreen && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-4 right-4 z-50 shadow-lg opacity-0 hover:opacity-100 transition-opacity bg-black/50 text-white border-0"
          onClick={toggleFullscreen}
        >
          <Minimize2 className="h-4 w-4 mr-2" />
          退出全屏
        </Button>
      )}

      {!isMobile && sidebarOpen && (
        <div className={cn(
          "w-60 border-r bg-muted/30 flex flex-col transition-all duration-300",
          (immersiveMode || isFullscreen) && !showToolbar && "-ml-60"
        )}>
          <div className="flex items-center justify-between p-3 border-b">
            <span className="font-semibold text-sm truncate pr-2">{book.title}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSidebarOpen(false)}>
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex border-b">
            <button
              onClick={() => setSidebarTab('thumbnails')}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors",
                sidebarTab === 'thumbnails' ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              )}
            >
              缩略图
            </button>
            <button
              onClick={() => setSidebarTab('annotations')}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors",
                sidebarTab === 'annotations' ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              )}
            >
              批注 ({annotations.length})
            </button>
          </div>
          <ScrollArea className="flex-1">
            <Document file={fileUrl}>
              {sidebarTab === 'thumbnails' ? (
                <div className="p-2 space-y-2">
                  {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={cn(
                        "w-full relative aspect-[3/4] rounded-lg overflow-hidden transition-all",
                        pageNumber === page ? "ring-2 ring-primary ring-offset-1" : "opacity-60 hover:opacity-100"
                      )}
                    >
                      <Page pageNumber={page} scale={0.15} renderTextLayer={false} renderAnnotationLayer={false} />
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] py-0.5 text-center">
                        {page}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  {annotations.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      暂无批注
                    </div>
                  ) : (
                    annotations.map(ann => (
                      <div
                        key={ann.id}
                        onClick={() => {
                          goToPage(ann.page);
                          setSelectedAnnotation(ann);
                        }}
                        className={cn(
                          "p-3 rounded-lg border text-sm cursor-pointer transition-colors",
                          selectedAnnotation?.id === ann.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                          <span className={cn(
                            "w-2 h-2 rounded-full",
                            ann.type === 'highlight' ? "bg-yellow-400" : "bg-amber-400"
                          )} />
                          <span>第 {ann.page} 页</span>
                        </div>
                        <p className="line-clamp-2 text-xs">{ann.content || ann.quote || '[无文本]'}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </Document>
          </ScrollArea>
        </div>
      )}

      <div className="flex-1 flex flex-col relative">
        {/* 顶部工具栏 */}
        <div className={cn(
          "absolute top-4 left-1/2 -translate-x-1/2 z-40 transition-all duration-500",
          !showToolbar && (isMobile || immersiveMode || isFullscreen) && "-translate-y-24 opacity-0 pointer-events-none"
        )}>
          <div className="flex items-center gap-1 bg-background/95 backdrop-blur-md border rounded-full shadow-2xl px-2 py-1.5">
            {onClose && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>退出</TooltipContent>
              </Tooltip>
            )}
            
            {!sidebarOpen && !isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSidebarOpen(true)}>
                    <PanelRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>侧边栏</TooltipContent>
              </Tooltip>
            )}

            <div className="w-px h-4 bg-border mx-1" />

            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={goToPrev} disabled={pageNumber <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center px-2 min-w-[80px] justify-center">
              <span className="text-sm font-mono">{pageNumber} / {numPages}</span>
            </div>

            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={goToNext} disabled={pageNumber >= numPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-border mx-1" />

            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleZoom(-0.2)}>
              <ZoomOut className="h-4 w-4" />
            </Button>

            <span className="text-xs w-10 text-center font-mono">{Math.round(scale * 100)}%</span>

            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleZoom(0.2)}>
              <ZoomIn className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-border mx-1 hidden sm:block" />

            <Button 
              variant={activeTool === 'highlight' ? 'default' : 'ghost'} 
              size="icon" 
              className="h-8 w-8 rounded-full hidden sm:flex"
              onClick={() => setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight')}
            >
              <Highlighter className="h-4 w-4" />
            </Button>

            <Button 
              variant={activeTool === 'note' ? 'default' : 'ghost'} 
              size="icon" 
              className="h-8 w-8 rounded-full hidden sm:flex"
              onClick={() => setActiveTool(activeTool === 'note' ? 'select' : 'note')}
            >
              <Plus className="h-4 w-4" />
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={immersiveMode ? 'default' : 'ghost'} 
                  size="icon" 
                  className="h-8 w-8 rounded-full hidden md:flex"
                  onClick={toggleImmersive}
                >
                  <ScanLine className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>沉浸模式 (I)</TooltipContent>
            </Tooltip>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto">
                <SheetHeader>
                  <SheetTitle className="text-left">{book.title}</SheetTitle>
                </SheetHeader>
                <div className="grid grid-cols-4 gap-4 mt-4">
                  <Button variant="outline" className="flex-col h-auto py-4" onClick={() => setViewMode('thumbnails')}>
                    <LayoutGrid className="h-5 w-5 mb-2" />
                    <span className="text-xs">缩略图</span>
                  </Button>
                  <Button variant="outline" className="flex-col h-auto py-4" onClick={fitToWidth}>
                    <Maximize2 className="h-5 w-5 mb-2" />
                    <span className="text-xs">适应宽度</span>
                  </Button>
                  <Button variant="outline" className="flex-col h-auto py-4" onClick={() => setRotation(r => (r + 90) % 360)}>
                    <RotateCw className="h-5 w-5 mb-2" />
                    <span className="text-xs">旋转</span>
                  </Button>
                  <Button variant="outline" className="flex-col h-auto py-4" onClick={toggleFullscreen}>
                    {isFullscreen ? <Minimize2 className="h-5 w-5 mb-2" /> : <Maximize2 className="h-5 w-5 mb-2" />}
                    <span className="text-xs">全屏</span>
                  </Button>
                </div>
                <div className="mt-4 pt-4 border-t space-y-2">
                  <Button variant="outline" className="w-full" onClick={() => setIsDownloadDialogOpen(true)}>
                    <Download className="h-4 w-4 mr-2" />
                    下载 PDF
                  </Button>
                  <div className="flex gap-2">
                    <Button 
                      variant={activeTool === 'highlight' ? 'default' : 'outline'} 
                      className="flex-1"
                      onClick={() => setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight')}
                    >
                      <Highlighter className="h-4 w-4 mr-2" />
                      高亮模式
                    </Button>
                    <Button 
                      variant={activeTool === 'note' ? 'default' : 'outline'} 
                      className="flex-1"
                      onClick={() => setActiveTool(activeTool === 'note' ? 'select' : 'note')}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      笔记模式
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* 工具模式提示 */}
        {activeTool !== 'select' && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
            <span>{activeTool === 'highlight' ? '选中文本即可高亮标注' : '点击页面添加批注'}</span>
            <button onClick={() => setActiveTool('select')} className="hover:opacity-80">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 文本选中后的浮动工具栏 */}
        <div 
          className={cn(
            "absolute z-50 bg-popover border shadow-xl rounded-lg p-2 flex items-center gap-2 transition-all duration-200",
            showFloatingTools && selection ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
          )}
          style={{
            left: selection ? Math.min(...selection.rects.map(r => r.left)) + Math.max(...selection.rects.map(r => r.width)) / 2 : 0,
            top: selection ? Math.min(...selection.rects.map(r => r.top)) - 60 : 0,
            transform: 'translateX(-50%)',
          }}
        >
          <Button size="sm" variant="default" onClick={() => addHighlight()} className="gap-1">
            <Highlighter className="h-4 w-4" />
            高亮
          </Button>
          <Button size="sm" variant="secondary" onClick={() => {
            setActiveTool('highlight');
            addHighlight();
          }} className="gap-1">
            <Type className="h-4 w-4" />
            高亮并备注
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { 
            setSelection(null); 
            window.getSelection()?.removeAllRanges(); 
            setShowFloatingTools(false);
          }}>
            取消
          </Button>
        </div>

        {/* PDF 内容区域 */}
        <div 
          className={cn(
            "flex-1 overflow-auto bg-muted/30 relative touch-pan-y select-text",
            isFullscreen ? "bg-black" : "bg-muted/30"
          )}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onMouseUp={handleTextSelection}
        >
          {loadError ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                <X className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-lg font-medium mb-2">{loadError}</p>
              <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">
                重新加载
              </Button>
            </div>
          ) : (
            <Document 
              file={fileUrl} 
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="h-full flex items-center justify-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">正在加载 PDF...</p>
                  </div>
                </div>
              }
            >
              {viewMode === 'scroll' ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
                    <div key={page} className="relative" data-page-number={page}>
                      <Page
                        pageNumber={page}
                        scale={isMobile ? Math.min(scale, 1.0) : scale}
                        rotate={rotation}
                        renderTextLayer={true}
                        renderAnnotationLayer={false}
                        className="shadow-xl"
                      />
                      {renderHighlights(page)}
                      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                        {page} / {numPages}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="min-h-full flex items-center justify-center p-4">
                  <div
                    ref={pageRef}
                    className={cn(
                      "relative inline-block shadow-2xl rounded-lg overflow-hidden bg-white transition-all",
                      activeTool === 'note' ? "cursor-crosshair" : "cursor-text"
                    )}
                    style={{ 
                      touchAction: 'pan-y',
                      maxWidth: '100%'
                    }}
                    onClick={(e) => handlePageClick(e, pageNumber)}
                    data-page-number={pageNumber}
                  >
                    <Page
                      pageNumber={pageNumber}
                      scale={isMobile ? Math.min(scale, 1.2) : scale}
                      rotate={rotation}
                      renderTextLayer={true}
                      renderAnnotationLayer={false}
                      loading={
                        <div className="w-[300px] h-[400px] md:w-[600px] md:h-[800px] flex items-center justify-center bg-white">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                      }
                    />
                    
                    {renderHighlights(pageNumber)}
                    
                    {/* 笔记标记 */}
                    {currentAnnotations.filter(a => a.type === 'note').map(ann => {
                      if (ann.x === undefined || ann.y === undefined) return null;
                      return (
                        <button
                          key={ann.id}
                          className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-amber-400 hover:bg-amber-500 flex items-center justify-center shadow-lg transition-transform hover:scale-110 z-10 border-2 border-white animate-in zoom-in duration-200"
                          style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%` }}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setSelectedAnnotation(ann);
                          }}
                        >
                          <MessageSquare className="h-4 w-4 text-amber-900" />
                        </button>
                      );
                    })}

                    {/* 待添加笔记标记 */}
                    {pendingNote?.page === pageNumber && (
                      <div
                        className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-primary flex items-center justify-center shadow-lg z-20 border-2 border-white animate-bounce"
                        style={{ left: `${pendingNote.x * 100}%`, top: `${pendingNote.y * 100}%` }}
                      >
                        <Plus className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Document>
          )}
        </div>

        {/* 进度条 */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted z-30">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(pageNumber / numPages) * 100}%` }}
          />
        </div>

        {/* 移动端底部导航 */}
        {isMobile && (
          <div className={cn(
            "absolute bottom-6 left-4 right-4 flex items-center justify-between transition-all duration-300 z-30",
            !showToolbar && "translate-y-20 opacity-0 pointer-events-none"
          )}>
            <Button variant="secondary" size="icon" className="rounded-full shadow-xl h-12 w-12 bg-background/90 backdrop-blur" onClick={goToPrev} disabled={pageNumber <= 1}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
            
            <div className="flex gap-2">
              <Button 
                variant={activeTool === 'highlight' ? 'default' : 'secondary'} 
                size="icon"
                className="rounded-full shadow-xl h-12 w-12 bg-background/90 backdrop-blur"
                onClick={() => setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight')}
              >
                <Highlighter className="h-5 w-5" />
              </Button>
              
              <Button 
                variant="secondary" 
                className="rounded-full shadow-xl px-4 h-12 bg-background/90 backdrop-blur font-mono"
                onClick={() => setSidebarOpen(true)}
              >
                <span className="text-sm">{pageNumber}</span>
                <span className="text-xs text-muted-foreground mx-1">/</span>
                <span className="text-xs text-muted-foreground">{numPages}</span>
              </Button>

              <Button 
                variant={activeTool === 'note' ? 'default' : 'secondary'} 
                size="icon"
                className="rounded-full shadow-xl h-12 w-12 bg-background/90 backdrop-blur"
                onClick={() => setActiveTool(activeTool === 'note' ? 'select' : 'note')}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>

            <Button variant="secondary" size="icon" className="rounded-full shadow-xl h-12 w-12 bg-background/90 backdrop-blur" onClick={goToNext} disabled={pageNumber >= numPages}>
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        )}

        {/* 移动端悬浮批注按钮 */}
        <FloatingActionButton
          isOpen={fabOpen}
          onToggle={() => setFabOpen(!fabOpen)}
          onHighlight={quickHighlight}
          onNote={quickAddNote}
          activeTool={activeTool}
          isMobile={isMobile}
        />
      </div>

      {/* 添加笔记对话框 */}
      <Dialog open={!!pendingNote} onOpenChange={() => setPendingNote(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加批注</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="写下你的想法..."
            autoFocus
            className="mt-4 min-h-[100px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                confirmAddNote((e.target as HTMLTextAreaElement).value);
              }
            }}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setPendingNote(null)}>取消</Button>
            <Button onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              const textarea = e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement;
              confirmAddNote(textarea?.value || '');
            }}>
              <Check className="h-4 w-4 mr-2" />
              添加
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 查看/编辑批注对话框 */}
      <Dialog open={!!selectedAnnotation} onOpenChange={() => {
        setSelectedAnnotation(null);
        setEditingAnnotation(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAnnotation?.type === 'highlight' ? <Highlighter className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
              {selectedAnnotation?.type === 'highlight' ? '高亮批注' : '笔记'}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {selectedAnnotation?.quote && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4 text-sm italic text-muted-foreground">
                "{selectedAnnotation.quote}"
              </div>
            )}
            
            {editingAnnotation?.id === selectedAnnotation?.id ? (
              <>
                <Textarea
                  defaultValue={selectedAnnotation?.content}
                  className="min-h-[100px]"
                  autoFocus
                />
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setEditingAnnotation(null)}>取消</Button>
                  <Button className="flex-1" onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    const content = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement)?.value;
                    if (selectedAnnotation && content !== undefined) {
                      onUpdateAnnotation(selectedAnnotation.id, content);
                      setEditingAnnotation(null);
                      setSelectedAnnotation(null);
                      toast.success('已更新');
                    }
                  }}>保存</Button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-muted p-4 rounded-lg mb-4 min-h-[60px]">
                  <p className="whitespace-pre-wrap text-sm">{selectedAnnotation?.content || <span className="text-muted-foreground italic">暂无笔记内容</span>}</p>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                  <span>第 {selectedAnnotation?.page} 页</span>
                  <span>{selectedAnnotation?.createdAt && formatDate(selectedAnnotation.createdAt)}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => selectedAnnotation && setEditingAnnotation(selectedAnnotation)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    编辑
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => selectedAnnotation && handleDelete(selectedAnnotation.id)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    删除
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 下载对话框 */}
      <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5" />
              下载文件
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              下载《{book.title}》的 PDF 文件
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-annotations"
                checked={includeAnnotations}
                onCheckedChange={(checked) => setIncludeAnnotations(checked as boolean)}
              />
              <label htmlFor="include-annotations" className="text-sm font-medium">
                同时导出批注 ({annotations.length} 条)
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>取消</Button>
            <Button onClick={() => {
              onDownloadFile?.(includeAnnotations);
              setIsDownloadDialogOpen(false);
            }}>
              <Download className="h-4 w-4 mr-2" />
              确认下载
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 移动端侧边栏 */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="text-left text-sm">{book.title}</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-80px)]">
              <Document file={fileUrl}>
                <div className="p-2 space-y-2">
                  {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => {
                        goToPage(page);
                        setSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 p-2 rounded-lg transition-colors",
                        pageNumber === page ? "bg-accent" : "hover:bg-accent/50"
                      )}
                    >
                      <div className="w-12 h-16 bg-white rounded border overflow-hidden relative shrink-0">
                        <Page pageNumber={page} scale={0.1} renderTextLayer={false} renderAnnotationLayer={false} />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm block">第 {page} 页</span>
                        <span className="text-xs text-muted-foreground">
                          {annotations.filter(a => a.page === page).length} 条批注
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </Document>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}

      {/* 移动端手势提示 */}
      {isMobile && pageNumber === 1 && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 pointer-events-none opacity-50">
          <div className="flex flex-col items-center gap-2 text-white text-xs bg-black/50 px-4 py-2 rounded-full">
            <GripHorizontal className="h-4 w-4" />
            <span>左右滑动翻页 · 双击缩放</span>
          </div>
        </div>
      )}
    </div>
  );
}