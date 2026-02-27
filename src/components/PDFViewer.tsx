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
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchStartDist = useRef<number>(0);
  const lastPinchDistance = useRef<number>(0);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  // 检测移动端并设置合适的初始状态
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
        setScale(0.85); // 移动端默认更适合的缩放
        // 检查是否是首次使用
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

  // 手势提示自动隐藏
  useEffect(() => {
    if (showGestureHint && isMobile) {
      const timer = setTimeout(() => {
        setShowGestureHint(false);
        localStorage.setItem('pdf-gesture-hint-seen', 'true');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showGestureHint, isMobile]);

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
  }, [numPages, book.id]);

  const goToPrev = () => goToPage(pageNumber - 1);
  const goToNext = () => goToPage(pageNumber + 1);

  const handleZoom = useCallback((delta: number) => {
    setScale(s => {
      const newScale = Math.max(0.5, Math.min(3, s + delta));
      return Math.round(newScale * 10) / 10; // 防止浮点误差
    });
  }, []);

  const fitToWidth = useCallback(() => {
    if (isMobile) {
      setScale(0.85);
    } else {
      const containerWidth = containerRef.current?.clientWidth || 800;
      const sidebarWidth = sidebarOpen ? 240 : 0;
      const availableWidth = containerWidth - sidebarWidth - 48;
      setScale(Math.min(availableWidth / 612, 2));
    }
  }, [sidebarOpen, isMobile]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      toast.error('无法切换全屏模式');
    }
  }, []);

  const handleTextSelection = useCallback(() => {
    if (activeTool !== 'highlight' && activeTool !== 'select') return;
    
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelection(null);
      setShowFloatingTools(false);
      return;
    }
    
    const text = sel.toString().trim();
    if (!text || text.length < 2) return; // 防止误触选中的单个字符
    
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
    if (activeTool !== 'note') return;
    
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;
    
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

  // 优化的触摸手势处理
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 双指缩放开始
      setIsPinching(true);
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      touchStartDist.current = dist;
      lastPinchDistance.current = dist;
    } else if (e.touches.length === 1) {
      // 单指触摸
      touchStart.current = { 
        x: e.touches[0].clientX, 
        y: e.touches[0].clientY,
        time: Date.now()
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinching) {
      e.preventDefault(); // 防止页面滚动
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      
      // 缩放灵敏度调整，每 50px 变化 0.1
      const delta = (dist - lastPinchDistance.current) / 50 * 0.1;
      if (Math.abs(delta) > 0.05) {
        setScale(s => Math.max(0.5, Math.min(3, s + delta)));
        lastPinchDistance.current = dist;
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    // 处理双指结束
    if (e.touches.length === 0 && isPinching) {
      setIsPinching(false);
      return;
    }
    
    if (!touchStart.current || isPinching || viewMode !== 'single') {
      touchStart.current = null;
      return;
    }
    
    const touch = e.changedTouches[0];
    const dx = touchStart.current.x - touch.clientX;
    const dy = touchStart.current.y - touch.clientY;
    const dt = Date.now() - touchStart.current.time;
    
    // 双击检测（300ms 内，位移小于 10px）
    const now = Date.now();
    if (lastTap.current && 
        now - lastTap.current.time < 300 && 
        Math.abs(touch.clientX - lastTap.current.x) < 10 &&
        Math.abs(touch.clientY - lastTap.current.y) < 10) {
      // 双击缩放
      if (scale > 1.2) {
        setScale(0.85);
        toast.success('恢复默认大小');
      } else {
        setScale(Math.min(2.0, scale + 0.5));
        toast.success('放大');
      }
      lastTap.current = null;
      touchStart.current = null;
      return;
    }
    
    lastTap.current = { time: now, x: touch.clientX, y: touch.clientY };
    
    // 滑动翻页判定（快速滑动或长距离滑动）
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50 && dt < 300) {
      e.preventDefault();
      if (dx > 0) goToNext();
      else goToPrev();
    }
    
    touchStart.current = null;
  };

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
        case 'Escape':
          if (selection) {
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          } else if (selectedAnnotation) {
            setSelectedAnnotation(null);
          } else if (pendingNote) {
            setPendingNote(null);
          } else if (activeTool !== 'select') {
            setActiveTool('select');
          } else if (onClose) {
            onClose();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, goToPage, numPages, selectedAnnotation, pendingNote, activeTool, onClose, selection]);

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
        <div className="flex items-center justify-between p-3 border-b bg-background/80 backdrop-blur-md sticky top-0 z-20">
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
          <span className="font-medium text-sm truncate max-w-[150px]">{book.title}</span>
          <span className="text-xs text-muted-foreground px-2">{numPages} 页</span>
        </div>
        <ScrollArea className="flex-1 bg-muted/20">
          <div className="p-4 pb-24">
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
        "flex h-full bg-background overflow-hidden relative",
        isFullscreen && "fixed inset-0 z-50 bg-black"
      )}
    >
      {/* 桌面端侧边栏 */}
      {!isMobile && sidebarOpen && (
        <div className="w-60 border-r bg-muted/30 flex flex-col shrink-0">
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

      <div className="flex-1 flex flex-col relative min-w-0">
        {/* 顶部导航栏 - 桌面端始终显示，移动端紧凑显示 */}
        <div className={cn(
          "absolute top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b transition-transform duration-300",
          isMobile ? "h-12" : "h-14",
          isFullscreen && "-translate-y-full"
        )}>
          <div className="flex items-center justify-between h-full px-3">
            <div className="flex items-center gap-1">
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
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setViewMode('thumbnails')}>
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  目录
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {pageNumber} <span className="text-muted-foreground/50">/</span> {numPages}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {!isMobile && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleZoom(-0.2)}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs w-10 text-center font-mono">{Math.round(scale * 100)}%</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleZoom(0.2)}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-4 bg-border mx-1" />
                </>
              )}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-auto pb-8">
                  <SheetHeader className="pb-4">
                    <SheetTitle className="text-left text-sm">{book.title}</SheetTitle>
                  </SheetHeader>
                  <div className="grid grid-cols-4 gap-3">
                    <Button variant="outline" className="flex-col h-auto py-3 gap-1" onClick={() => setViewMode('thumbnails')}>
                      <LayoutGrid className="h-5 w-5" />
                      <span className="text-[10px]">缩略图</span>
                    </Button>
                    <Button variant="outline" className="flex-col h-auto py-3 gap-1" onClick={fitToWidth}>
                      <Maximize2 className="h-5 w-5" />
                      <span className="text-[10px]">适应宽度</span>
                    </Button>
                    <Button variant="outline" className="flex-col h-auto py-3 gap-1" onClick={() => setRotation(r => (r + 90) % 360)}>
                      <RotateCw className="h-5 w-5" />
                      <span className="text-[10px]">旋转</span>
                    </Button>
                    <Button variant="outline" className="flex-col h-auto py-3 gap-1" onClick={toggleFullscreen}>
                      {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                      <span className="text-[10px]">全屏</span>
                    </Button>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Button variant="outline" className="w-full" onClick={() => setIsDownloadDialogOpen(true)}>
                      <Download className="h-4 w-4 mr-2" />
                      下载 PDF
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        {/* 工具模式提示 */}
        {activeTool !== 'select' && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
            <span>{activeTool === 'highlight' ? '选中文本即可高亮' : '点击页面添加批注'}</span>
            <button onClick={() => setActiveTool('select')} className="hover:opacity-80 p-1">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* 浮动工具栏（文本选中后） */}
        {showFloatingTools && selection && (
          <div 
            className="absolute z-50 bg-popover border shadow-xl rounded-full p-1.5 flex items-center gap-1 animate-in zoom-in-95"
            style={{
              left: '50%',
              top: Math.min(...selection.rects.map(r => r.top)) - 60,
              transform: 'translateX(-50%)',
            }}
          >
            <Button size="sm" className="rounded-full h-8 px-3" onClick={() => addHighlight()}>
              <Highlighter className="h-3.5 w-3.5 mr-1" />
              高亮
            </Button>
            <Button size="sm" variant="secondary" className="rounded-full h-8 px-3" onClick={() => {
              addHighlight();
              setSelectedAnnotation(annotations[annotations.length - 1] || null);
            }}>
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

        {/* PDF 内容区域 - 移动端预留底部导航空间 */}
        <div 
          className={cn(
            "flex-1 overflow-auto bg-muted/20 relative touch-pan-y select-text",
            isMobile ? "pb-20 pt-12" : "pt-14",
            isFullscreen ? "pt-0" : ""
          )}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
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
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">加载中...</p>
                  </div>
                </div>
              }
            >
              <div className={cn(
                "min-h-full flex items-start justify-center p-4",
                isMobile && "items-start pt-4"
              )}>
                <div
                  ref={pageRef}
                  className={cn(
                    "relative shadow-2xl bg-white transition-all duration-200",
                    activeTool === 'note' ? "cursor-crosshair" : "cursor-text",
                    isPinching && "transition-none" // 缩放时禁用过渡，避免卡顿
                  )}
                  style={{ 
                    touchAction: isPinching ? 'none' : 'pan-y',
                    maxWidth: '100%',
                    transform: isMobile ? `scale(${scale})` : undefined,
                    transformOrigin: 'top center'
                  }}
                  onClick={(e) => handlePageClick(e, pageNumber)}
                  data-page-number={pageNumber}
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={isMobile ? 1 : scale} // 移动端使用 CSS 缩放，避免重绘
                    rotate={rotation}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                    loading={
                      <div className={cn(
                        "flex items-center justify-center bg-white",
                        isMobile ? "w-[350px] h-[500px]" : "w-[600px] h-[800px]"
                      )}>
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
              </div>
            </Document>
          )}
        </div>

        {/* 移动端底部 Dock 栏 - 固定显示，不自动隐藏 */}
        {isMobile && !isFullscreen && (
          <div className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t z-50">
            <div className="flex items-center justify-around h-16 px-2">
              {/* 缩略图/目录 */}
              <button 
                onClick={() => setViewMode('thumbnails')}
                className="flex flex-col items-center justify-center w-14 h-14 gap-0.5 text-muted-foreground active:text-foreground transition-colors"
              >
                <LayoutGrid className="h-5 w-5" />
                <span className="text-[10px]">目录</span>
              </button>

              {/* 上一页 */}
              <button 
                onClick={goToPrev}
                disabled={pageNumber <= 1}
                className="flex items-center justify-center w-12 h-12 rounded-full active:bg-accent disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              {/* 页码指示器 - 可点击快速跳转 */}
              <button 
                onClick={() => setSidebarOpen(true)}
                className="flex flex-col items-center justify-center min-w-[80px] h-14"
              >
                <span className="text-lg font-semibold leading-none">{pageNumber}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{numPages}</span>
              </button>

              {/* 下一页 */}
              <button 
                onClick={goToNext}
                disabled={pageNumber >= numPages}
                className="flex items-center justify-center w-12 h-12 rounded-full active:bg-accent disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-6 w-6" />
              </button>

              {/* 批注菜单 */}
              <Sheet>
                <SheetTrigger asChild>
                  <button className="flex flex-col items-center justify-center w-14 h-14 gap-0.5 text-muted-foreground active:text-foreground transition-colors relative">
                    <div className="relative">
                      <StickyNote className="h-5 w-5" />
                      {annotations.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary text-[8px] text-primary-foreground rounded-full flex items-center justify-center font-medium">
                          {annotations.length}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px]">批注</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[50vh] pb-8">
                  <SheetHeader className="pb-4">
                    <SheetTitle className="text-left flex items-center gap-2">
                      <span>批注与工具</span>
                      <span className="text-xs text-muted-foreground font-normal">({annotations.length})</span>
                    </SheetTitle>
                  </SheetHeader>
                  
                  <div className="grid grid-cols-4 gap-3 mb-6">
                    <button
                      onClick={() => {
                        setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight');
                        setShowFloatingTools(false);
                      }}
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
                      onClick={() => {
                        handleZoom(-0.2);
                        toast.success(`${Math.round((scale - 0.2) * 100)}%`);
                      }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-border hover:border-primary/50 transition-all"
                    >
                      <ZoomOut className="h-6 w-6" />
                      <span className="text-xs">缩小</span>
                    </button>

                    <button
                      onClick={() => {
                        handleZoom(0.2);
                        toast.success(`${Math.round((scale + 0.2) * 100)}%`);
                      }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-border hover:border-primary/50 transition-all"
                    >
                      <ZoomIn className="h-6 w-6" />
                      <span className="text-xs">放大</span>
                    </button>
                  </div>

                  <ScrollArea className="h-[calc(100%-140px)]">
                    {annotations.length === 0 ? (
                      <div className="text-center text-muted-foreground py-12">
                        <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">暂无批注</p>
                        <p className="text-xs mt-1">点击上方工具开始批注</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {annotations.map(ann => (
                          <div
                            key={ann.id}
                            onClick={() => {
                              goToPage(ann.page);
                              setSelectedAnnotation(ann);
                            }}
                            className="p-4 rounded-xl border bg-card active:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className={cn(
                                  "w-2 h-2 rounded-full",
                                  ann.type === 'highlight' ? "bg-yellow-400" : "bg-amber-400"
                                )} />
                                <span>第 {ann.page} 页</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDate(ann.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm line-clamp-2">{ann.content || ann.quote || '[无文本]'}</p>
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

        {/* 手势提示 - 首次使用时显示 */}
        {isMobile && showGestureHint && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-300">
            <div className="bg-background rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">阅读手势</h3>
                <p className="text-sm text-muted-foreground">掌握这些技巧，阅读更流畅</p>
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-10 h-10 bg-background rounded-full flex items-center justify-center shrink-0 border">
                    <span className="text-lg">👆</span>
                  </div>
                  <div>
                    <p className="font-medium">左右滑动</p>
                    <p className="text-xs text-muted-foreground">快速翻页</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-10 h-10 bg-background rounded-full flex items-center justify-center shrink-0 border">
                    <span className="text-lg">👐</span>
                  </div>
                  <div>
                    <p className="font-medium">双指捏合</p>
                    <p className="text-xs text-muted-foreground">放大或缩小页面</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-10 h-10 bg-background rounded-full flex items-center justify-center shrink-0 border">
                    <span className="text-lg">👆👆</span>
                  </div>
                  <div>
                    <p className="font-medium">双击页面</p>
                    <p className="text-xs text-muted-foreground">快速放大/还原</p>
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

        {/* 桌面端悬浮工具栏 */}
        {!isMobile && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/90 backdrop-blur-md border rounded-full shadow-lg px-2 py-1.5 z-30">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={goToPrev} disabled={pageNumber <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-px h-4 bg-border" />
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleZoom(-0.2)}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleZoom(0.2)}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="w-px h-4 bg-border" />
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={goToNext} disabled={pageNumber >= numPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* 对话框组件 */}
      <Dialog open={!!pendingNote} onOpenChange={() => setPendingNote(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加批注</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="写下你的想法..."
            autoFocus
            className="mt-4 min-h-[100px]"
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

      {/* 移动端页码跳转侧边栏 */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="bottom" className="h-[60vh] pb-8">
            <SheetHeader className="pb-4">
              <SheetTitle className="text-left">跳转到指定页面</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100%-80px)]">
              <div className="grid grid-cols-5 gap-2 p-1">
                {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => {
                      goToPage(page);
                      setSidebarOpen(false);
                    }}
                    className={cn(
                      "aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-colors",
                      pageNumber === page 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted hover:bg-accent"
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