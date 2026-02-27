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
  ArrowLeft,
  MoreVertical,
  Highlighter,
  Pencil,
  Trash2,
  PanelLeft,
  PanelRight,
  Check,
  BookOpen,
  StickyNote,
  Type,
  Undo2,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [viewMode, setViewMode] = useState<'single' | 'scroll' | 'thumbnails'>('single');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const [showFloatingTools, setShowFloatingTools] = useState(false);
  const [showGestureHint, setShowGestureHint] = useState(true);
  const [isPinching, setIsPinching] = useState(false);
  const [showFullscreenControls, setShowFullscreenControls] = useState(true);
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; time: number; isTopEdge?: boolean } | null>(null);
  const pinchStartScale = useRef<number>(1);
  const touchStartDist = useRef<number>(0);
  const lastPinchDistance = useRef<number>(0);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const fullscreenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化检测
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
        setScale(1.0);
        const hasSeenHint = localStorage.getItem('pdf-gesture-hint-seen');
        if (hasSeenHint) setShowGestureHint(false);
      } else {
        setScale(1.2);
        setSidebarOpen(true);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    const saved = localStorage.getItem(`pdf-progress-${book.id}`);
    if (saved) setPageNumber(parseInt(saved, 10));
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [book.id]);

  // 全屏控制栏自动隐藏
  useEffect(() => {
    if (isFullscreen) {
      setShowFullscreenControls(true);
      // 显示全屏提示
      setShowFullscreenHint(true);
      const hintTimer = setTimeout(() => setShowFullscreenHint(false), 4000);
      
      if (fullscreenTimer.current) clearTimeout(fullscreenTimer.current);
      fullscreenTimer.current = setTimeout(() => {
        setShowFullscreenControls(false);
      }, 4000);
      
      return () => {
        clearTimeout(hintTimer);
        if (fullscreenTimer.current) clearTimeout(fullscreenTimer.current);
      };
    }
  }, [isFullscreen, pageNumber, scale]);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        setShowFullscreenHint(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoadError(null);
  }, []);

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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      scrollRef.current.scrollLeft = 0;
    }
  }, [numPages, book.id]);

  const goToPrev = () => goToPage(pageNumber - 1);
  const goToNext = () => goToPage(pageNumber + 1);

  const handleZoom = useCallback((delta: number) => {
    setScale(s => {
      const newScale = Math.max(0.5, Math.min(4, s + delta));
      return Math.round(newScale * 10) / 10;
    });
  }, []);

  const resetZoom = () => setScale(isMobile ? 1.0 : 1.2);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      toast.error('无法切换全屏模式');
    }
  }, []);

  // 处理文本选择
  const handleTextSelection = useCallback(() => {
    if (activeTool !== 'highlight' && activeTool !== 'select') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelection(null);
      setShowFloatingTools(false);
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length < 2) return;
    
    const range = sel.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).map(rect => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }));
    
    const pageElement = range.startContainer.parentElement?.closest('[data-page-number]') as HTMLElement | null;
    if (pageElement) {
      const pageNum = parseInt(pageElement.getAttribute('data-page-number') || String(pageNumber), 10);
      setSelection({ text, rects, page: pageNum });
      setShowFloatingTools(true);
    }
  }, [activeTool, pageNumber]);

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
    if (activeTool !== 'note' || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPendingNote({ x, y, page: pageNum });
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

  // 优化的触摸处理 - 全屏模式下优化
  const onTouchStart = (e: React.TouchEvent) => {
    // 全屏时触摸显示控制栏
    if (isFullscreen) {
      setShowFullscreenControls(true);
      if (fullscreenTimer.current) clearTimeout(fullscreenTimer.current);
      fullscreenTimer.current = setTimeout(() => setShowFullscreenControls(false), 4000);
    }

    if (e.touches.length === 2) {
      setIsPinching(true);
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      touchStartDist.current = dist;
      lastPinchDistance.current = dist;
      pinchStartScale.current = scale;
    } else if (e.touches.length === 1) {
      // 记录是否从顶部边缘开始（用于退出全屏判定）
      const isTopEdge = e.touches[0].clientY < 50;
      touchStart.current = { 
        x: e.touches[0].clientX, 
        y: e.touches[0].clientY,
        time: Date.now(),
        isTopEdge
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinching) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      // 更平滑的缩放
      const scaleFactor = dist / touchStartDist.current;
      const newScale = Math.max(0.5, Math.min(4, pinchStartScale.current * scaleFactor));
      setScale(Math.round(newScale * 10) / 10);
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isPinching) {
      // 从双指变为单指，继续 pinch 状态但准备结束
      return;
    }
    
    if (e.touches.length === 0 && isPinching) {
      setIsPinching(false);
      return;
    }
    
    if (!touchStart.current || isPinching) {
      touchStart.current = null;
      return;
    }
    
    const touch = e.changedTouches[0];
    const dx = touchStart.current.x - touch.clientX;
    const dy = touchStart.current.y - touch.clientY;
    const dt = Date.now() - touchStart.current.time;
    const now = Date.now();
    
    // 双击缩放（全屏和非全屏都支持）
    if (lastTap.current && 
        now - lastTap.current.time < 300 && 
        Math.abs(touch.clientX - lastTap.current.x) < 10 &&
        Math.abs(touch.clientY - lastTap.current.y) < 10) {
      if (scale > 1.5) {
        resetZoom();
        toast.success('重置缩放');
      } else {
        setScale(2.5);
        toast.success('放大至 250%');
      }
      lastTap.current = null;
      touchStart.current = null;
      return;
    }
    
    lastTap.current = { time: now, x: touch.clientX, y: touch.clientY };
    
    // 全屏退出判定：必须从顶部边缘(50px内)开始，且向下滑动超过150px，速度要快
    if (isFullscreen && 
        touchStart.current.isTopEdge && 
        dy < -150 && 
        Math.abs(dy) > Math.abs(dx) && 
        dt < 400) {
      toggleFullscreen();
      toast.success('退出全屏');
      return;
    }
    
    // 滑动翻页（非缩放状态下）
    if (!isPinching && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 80 && dt < 300) {
      if (dx > 0) goToNext();
      else goToPrev();
    }
    
    touchStart.current = null;
  };

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      
      switch(e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          goToNext();
          break;
        case 'ArrowLeft':
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
        case '+':
        case '=':
          e.preventDefault();
          handleZoom(0.2);
          break;
        case '-':
          e.preventDefault();
          handleZoom(-0.2);
          break;
        case '0':
          e.preventDefault();
          resetZoom();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else if (onClose) {
            onClose();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, goToPage, numPages, onClose, handleZoom]);

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
        <div className="flex items-center justify-between p-3 border-b bg-background/80 backdrop-blur-md sticky top-0 z-20 h-14">
          <div className="flex items-center gap-2">
            {onClose && (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onClose}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setViewMode('single')} className="h-9">
              <BookOpen className="h-4 w-4 mr-2" />
              阅读
            </Button>
          </div>
          <span className="font-medium text-sm truncate max-w-[200px]">{book.title}</span>
          <span className="text-xs text-muted-foreground">{numPages} 页</span>
        </div>
        <ScrollArea className="flex-1 bg-muted/20">
          <div className="p-4 pb-20">
            <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => {
                      setPageNumber(page);
                      setViewMode('single');
                    }}
                    className="relative aspect-[3/4] rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md hover:ring-2 hover:ring-primary transition-all active:scale-95"
                  >
                    <Page pageNumber={page} scale={0.15} renderTextLayer={false} renderAnnotationLayer={false} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
                      <span className="text-white text-xs font-medium">{page}</span>
                    </div>
                    {pageNumber === page && (
                      <div className="absolute inset-0 ring-2 ring-primary ring-inset" />
                    )}
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
        "flex h-full w-full overflow-hidden relative bg-background",
        isFullscreen && "fixed inset-0 z-50 bg-black"
      )}
    >
      {/* 桌面端侧边栏 */}
      {!isMobile && !isFullscreen && sidebarOpen && (
        <div className="w-64 border-r bg-muted/30 flex flex-col shrink-0 h-full">
          <div className="flex items-center justify-between p-3 border-b h-14">
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

      <div className="flex-1 flex flex-col relative h-full w-full min-w-0">
        {/* 顶部导航 - 全屏时隐藏 */}
        {!isFullscreen && (
          <div className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-4 shrink-0 z-20">
            <div className="flex items-center gap-2">
              {onClose && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {!isMobile && !sidebarOpen && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(true)}>
                  <PanelRight className="h-4 w-4" />
                </Button>
              )}
              {isMobile && (
                <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setViewMode('thumbnails')}>
                  <LayoutGrid className="h-4 w-4" />
                  目录
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-medium tabular-nums">
                {pageNumber} / {numPages}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {!isMobile && (
                <div className="flex items-center gap-1 mr-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleZoom(-0.2)}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleZoom(0.2)}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-auto">
                  <SheetHeader className="pb-4">
                    <SheetTitle className="text-left">{book.title}</SheetTitle>
                  </SheetHeader>
                  <div className="grid grid-cols-4 gap-3">
                    <Button variant="outline" className="flex-col h-auto py-4 gap-1" onClick={() => setViewMode('thumbnails')}>
                      <LayoutGrid className="h-5 w-5" />
                      <span className="text-xs">缩略图</span>
                    </Button>
                    <Button variant="outline" className="flex-col h-auto py-4 gap-1" onClick={resetZoom}>
                      <Undo2 className="h-5 w-5" />
                      <span className="text-xs">重置</span>
                    </Button>
                    <Button variant="outline" className="flex-col h-auto py-4 gap-1" onClick={() => setRotation(r => (r + 90) % 360)}>
                      <RotateCw className="h-5 w-5" />
                      <span className="text-xs">旋转</span>
                    </Button>
                    <Button variant="outline" className="flex-col h-auto py-4 gap-1" onClick={() => setIsDownloadDialogOpen(true)}>
                      <Download className="h-5 w-5" />
                      <span className="text-xs">下载</span>
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        )}

        {/* 全屏悬浮控制栏 - 始终可交互 */}
        {isFullscreen && (
          <div className={cn(
            "absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent pb-12 pt-4 px-4 transition-all duration-300",
            showFullscreenControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
          )}>
            <div className="flex items-center justify-between max-w-3xl mx-auto">
              <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full px-4 py-2 text-white">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={goToPrev}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="text-sm font-medium tabular-nums min-w-[80px] text-center">
                  {pageNumber} / {numPages}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={goToNext}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full px-3 py-2 text-white">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => handleZoom(-0.2)}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => handleZoom(0.2)}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <div className="w-px h-4 bg-white/30 mx-1" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggleFullscreen}>
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 全屏模式底部提示 */}
        {isFullscreen && showFullscreenHint && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 bg-black/70 backdrop-blur-md text-white px-6 py-3 rounded-full text-sm animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3">
              <Info className="h-4 w-4" />
              <span>双击放大 · 双指缩放 · 顶部下滑退出</span>
              <button onClick={() => setShowFullscreenHint(false)} className="ml-2 hover:bg-white/20 rounded-full p-1">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* 工具模式提示 */}
        {activeTool !== 'select' && !isFullscreen && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg flex items-center gap-2 animate-in fade-in zoom-in-95">
            <span>{activeTool === 'highlight' ? '选中文本即可高亮' : '点击页面添加批注'}</span>
            <button onClick={() => setActiveTool('select')} className="hover:opacity-80 p-1">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* 浮动工具栏（文本选中后） */}
        {showFloatingTools && selection && !isFullscreen && (
          <div 
            className="absolute z-40 bg-popover border shadow-xl rounded-full p-1.5 flex items-center gap-1 animate-in zoom-in-95"
            style={{
              left: '50%',
              top: Math.min(...selection.rects.map(r => r.top)) - 70,
              transform: 'translateX(-50%)',
            }}
          >
            <Button size="sm" className="rounded-full h-8 px-3" onClick={() => addHighlight()}>
              <Highlighter className="h-3.5 w-3.5 mr-1" />
              高亮
            </Button>
            <Button size="sm" variant="secondary" className="rounded-full h-8 px-3" onClick={() => addHighlight()}>
              <Type className="h-3.5 w-3.5 mr-1" />
              备注
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full h-8 w-8 p-0" onClick={() => { 
              setSelection(null);
              window.getSelection()?.removeAllRanges();
              setShowFloatingTools(false);
            }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* PDF 内容区域 */}
        <div 
          ref={scrollRef}
          className={cn(
            "flex-1 overflow-auto relative touch-pan-y select-text bg-muted/20",
            isFullscreen ? "bg-black" : "bg-muted/20"
          )}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseUp={handleTextSelection}
          onClick={() => isFullscreen && setShowFullscreenControls(true)}
        >
          <div className="min-h-full w-full flex items-center justify-center p-4 md:p-8">
            {loadError ? (
              <div className="flex flex-col items-center justify-center text-muted-foreground p-8">
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
                  <div className="flex items-center justify-center h-[50vh]">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">加载中...</p>
                    </div>
                  </div>
                }
              >
                <div
                  ref={pageRef}
                  className={cn(
                    "relative shadow-2xl bg-white transition-transform duration-200 ease-out origin-center",
                    activeTool === 'note' ? "cursor-crosshair" : "cursor-text",
                    isPinching && "transition-none"
                  )}
                  style={{ 
                    transform: `scale(${scale})`,
                    touchAction: isPinching ? 'none' : 'pan-y',
                  }}
                  onClick={(e) => handlePageClick(e, pageNumber)}
                  data-page-number={pageNumber}
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={1}
                    rotate={rotation}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                    className="shadow-2xl"
                    loading={
                      <div className="w-[350px] h-[500px] md:w-[600px] md:h-[800px] flex items-center justify-center bg-white">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                      </div>
                    }
                  />
                  
                  {renderHighlights(pageNumber)}
                  
                  {currentAnnotations.filter(a => a.type === 'note').map(ann => {
                    if (ann.x === undefined || ann.y === undefined) return null;
                    return (
                      <button
                        key={ann.id}
                        className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-amber-400 hover:bg-amber-500 flex items-center justify-center shadow-lg transition-transform hover:scale-110 z-10 border-2 border-white"
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

                  {pendingNote?.page === pageNumber && (
                    <div
                      className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-primary flex items-center justify-center shadow-lg z-20 border-2 border-white animate-bounce"
                      style={{ left: `${pendingNote.x * 100}%`, top: `${pendingNote.y * 100}%` }}
                    >
                      <Plus className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </Document>
            )}
          </div>
        </div>

        {/* 移动端底部 Dock - 全屏时隐藏 */}
        {isMobile && !isFullscreen && (
          <div className="h-16 border-t bg-background/95 backdrop-blur-md shrink-0 z-30">
            <div className="flex items-center justify-around h-full px-2">
              <button 
                onClick={() => setViewMode('thumbnails')}
                className="flex flex-col items-center justify-center w-14 h-full gap-0.5 text-muted-foreground active:text-foreground"
              >
                <LayoutGrid className="h-5 w-5" />
                <span className="text-[10px]">目录</span>
              </button>

              <button 
                onClick={goToPrev}
                disabled={pageNumber <= 1}
                className="flex items-center justify-center w-12 h-12 rounded-full active:bg-accent disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              <button 
                onClick={() => setSidebarOpen(true)}
                className="flex flex-col items-center justify-center min-w-[80px] h-full"
              >
                <span className="text-lg font-semibold leading-none tabular-nums">{pageNumber}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{numPages}</span>
              </button>

              <button 
                onClick={goToNext}
                disabled={pageNumber >= numPages}
                className="flex items-center justify-center w-12 h-12 rounded-full active:bg-accent disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-6 w-6" />
              </button>

              <Sheet>
                <SheetTrigger asChild>
                  <button className="flex flex-col items-center justify-center w-14 h-full gap-0.5 text-muted-foreground active:text-foreground relative">
                    <div className="relative">
                      <StickyNote className="h-5 w-5" />
                      {annotations.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary text-[8px] text-primary-foreground rounded-full flex items-center justify-center font-medium">
                          {annotations.length}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px]">工具</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[60vh]">
                  <SheetHeader className="pb-4">
                    <SheetTitle className="text-left">阅读工具</SheetTitle>
                  </SheetHeader>
                  
                  <div className="grid grid-cols-4 gap-3 mb-6">
                    <button
                      onClick={() => setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight')}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                        activeTool === 'highlight' 
                          ? "border-primary bg-primary/5 text-primary" 
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <Highlighter className="h-6 w-6" />
                      <span className="text-xs">高亮</span>
                    </button>
                    
                    <button
                      onClick={() => setActiveTool(activeTool === 'note' ? 'select' : 'note')}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                        activeTool === 'note' 
                          ? "border-primary bg-primary/5 text-primary" 
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <Plus className="h-6 w-6" />
                      <span className="text-xs">笔记</span>
                    </button>

                    <button
                      onClick={() => { handleZoom(-0.2); toast.success(`${Math.round((scale - 0.2) * 100)}%`); }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-border hover:border-primary/50 transition-all"
                    >
                      <ZoomOut className="h-6 w-6" />
                      <span className="text-xs">缩小</span>
                    </button>

                    <button
                      onClick={() => { handleZoom(0.2); toast.success(`${Math.round((scale + 0.2) * 100)}%`); }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-border hover:border-primary/50 transition-all"
                    >
                      <ZoomIn className="h-6 w-6" />
                      <span className="text-xs">放大</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start" onClick={resetZoom}>
                      <Undo2 className="h-4 w-4 mr-2" />
                      重置缩放 (100%)
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={toggleFullscreen}>
                      <Maximize2 className="h-4 w-4 mr-2" />
                      进入全屏阅读
                    </Button>
                  </div>

                  <ScrollArea className="h-[calc(100%-240px)] mt-4">
                    <h4 className="text-sm font-medium mb-3 text-muted-foreground">批注列表</h4>
                    {annotations.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8 text-sm">
                        暂无批注，点击上方工具开始添加
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {annotations.map(ann => (
                          <div
                            key={ann.id}
                            onClick={() => { goToPage(ann.page); setSelectedAnnotation(ann); }}
                            className="p-3 rounded-lg border bg-card active:bg-accent/50 transition-colors text-sm"
                          >
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                              <span className={cn("w-2 h-2 rounded-full", ann.type === 'highlight' ? "bg-yellow-400" : "bg-amber-400")} />
                              <span>第 {ann.page} 页</span>
                            </div>
                            <p className="line-clamp-2">{ann.content || ann.quote}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        )}

        {/* 手势提示 */}
        {isMobile && showGestureHint && !isFullscreen && (
          <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
            <div className="bg-background rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">阅读手势</h3>
                <p className="text-sm text-muted-foreground mt-1">专为文献阅读优化</p>
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-10 h-10 bg-background rounded-full flex items-center justify-center shrink-0 border text-lg">👆</div>
                  <div>
                    <p className="font-medium">左右滑动</p>
                    <p className="text-xs text-muted-foreground">快速翻页</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-10 h-10 bg-background rounded-full flex items-center justify-center shrink-0 border text-lg">👐</div>
                  <div>
                    <p className="font-medium">双指捏合</p>
                    <p className="text-xs text-muted-foreground">精确缩放文献</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-10 h-10 bg-background rounded-full flex items-center justify-center shrink-0 border text-lg">👆👆</div>
                  <div>
                    <p className="font-medium">双击页面</p>
                    <p className="text-xs text-muted-foreground">快速放大/重置</p>
                  </div>
                </div>
              </div>

              <Button className="w-full" onClick={() => {
                setShowGestureHint(false);
                localStorage.setItem('pdf-gesture-hint-seen', 'true');
              }}>
                开始使用
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 对话框 */}
      <Dialog open={!!pendingNote} onOpenChange={() => setPendingNote(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加批注</DialogTitle>
          </DialogHeader>
          <Textarea placeholder="写下你的想法..." autoFocus className="mt-4 min-h-[100px]" />
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

      <Dialog open={!!selectedAnnotation} onOpenChange={() => { setSelectedAnnotation(null); setEditingAnnotation(null); }}>
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
                <Textarea defaultValue={selectedAnnotation?.content} className="min-h-[100px]" autoFocus />
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

      <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5" />
              下载文件
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">下载《{book.title}》的 PDF 文件</p>
            <div className="flex items-center space-x-2">
              <Checkbox id="include-annotations" checked={includeAnnotations} onCheckedChange={(checked) => setIncludeAnnotations(checked as boolean)} />
              <label htmlFor="include-annotations" className="text-sm font-medium">
                同时导出批注 ({annotations.length} 条)
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>取消</Button>
            <Button onClick={() => { onDownloadFile?.(includeAnnotations); setIsDownloadDialogOpen(false); }}>
              <Download className="h-4 w-4 mr-2" />
              确认下载
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 移动端页码选择 */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="bottom" className="h-[70vh]">
            <SheetHeader className="pb-4">
              <SheetTitle className="text-left">跳转到页面</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100%-80px)]">
              <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => { goToPage(page); setSidebarOpen(false); }}
                    className={cn(
                      "aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-colors",
                      pageNumber === page ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
                    )}
                  >
                    {page}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}