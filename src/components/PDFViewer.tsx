import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ChevronLeft,
  ChevronRight,
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
  Highlighter,
  Pencil,
  Trash2,
  Check,
  BookOpen,
  GripHorizontal,
  Move,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@ ${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFAnnotation {
  id: string;
  page: number;
  type: 'note' | 'highlight';
  content: string;
  color: string;
  x: number;
  y: number;
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

interface ViewState {
  scale: number;
  panX: number;
  panY: number;
}

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
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [viewMode, setViewMode] = useState<'single' | 'scroll' | 'thumbnails'>('single');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // 视图状态：缩放和平移
  const [viewState, setViewState] = useState<ViewState>({ scale: 1, panX: 0, panY: 0 });
  const [isPinching, setIsPinching] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  
  // 批注状态
  const [activeTool, setActiveTool] = useState<'select' | 'note' | 'highlight' | 'move'>('select');
  const [selectedAnnotation, setSelectedAnnotation] = useState<PDFAnnotation | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<string | null>(null);
  const [tempNote, setTempNote] = useState<{x: number; y: number; content: string} | null>(null);
  
  const [isMobile, setIsMobile] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasShownFullscreenHint, setHasShownFullscreenHint] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  
  // 触摸状态
  const touchStart = useRef<{ x: number; y: number; time: number; touches: number } | null>(null);
  const lastTouch = useRef<{ x: number; y: number; scale: number; panX: number; panY: number } | null>(null);
  const initialPinchDistance = useRef<number>(0);
  const pinchCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
      // 移动端初始缩放适配屏幕
      if (mobile) {
        setViewState({ scale: 0.85, panX: 0, panY: 0 });
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    const saved = localStorage.getItem(`pdf-progress-${book.id}`);
    if (saved) setPageNumber(parseInt(saved, 10));
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [book.id]);

  // 控制栏自动隐藏
  const resetControlsTimer = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    setShowControls(true);
    controlsTimer.current = setTimeout(() => {
      if (!isPinching && !isPanning && activeTool !== 'note') {
        setShowControls(false);
      }
    }, 3000);
  }, [isPinching, isPanning, activeTool]);

  // 监听全屏
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs && !hasShownFullscreenHint) {
        setHasShownFullscreenHint(true);
        toast.success('全屏模式：双指缩放查看细节，拖拽移动', { duration: 3000 });
      }
      resetControlsTimer();
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [hasShownFullscreenHint, resetControlsTimer]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    toast.error('PDF 加载失败');
  }, []);

  const goToPage = useCallback((page: number) => {
    const target = Math.max(1, Math.min(page, numPages));
    setPageNumber(target);
    localStorage.setItem(`pdf-progress-${book.id}`, String(target));
    // 翻页时重置视图但保持缩放级别
    setViewState(prev => ({ ...prev, panX: 0, panY: 0 }));
  }, [numPages, book.id]);

  const goToPrev = () => goToPage(pageNumber - 1);
  const goToNext = () => goToPage(pageNumber + 1);

  const resetView = () => setViewState({ scale: isMobile ? 0.85 : 1, panX: 0, panY: 0 });

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

  // 触摸处理 - 图片式浏览
  const onTouchStart = (e: React.TouchEvent) => {
    resetControlsTimer();
    
    if (e.touches.length === 2) {
      // 双指缩放开始
      setIsPinching(true);
      const dx = e.touches[0].pageX - e.touches[1].pageX;
      const dy = e.touches[0].pageY - e.touches[1].pageY;
      initialPinchDistance.current = Math.hypot(dx, dy);
      
      // 计算双指中心点（相对于视口）
      const centerX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
      const centerY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
      pinchCenter.current = { x: centerX, y: centerY };
      
      lastTouch.current = { 
        x: centerX, 
        y: centerY, 
        scale: viewState.scale,
        panX: viewState.panX,
        panY: viewState.panY
      };
    } else if (e.touches.length === 1) {
      // 单指：可能是平移或批注
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
        touches: 1
      };
      lastTouch.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        scale: viewState.scale,
        panX: viewState.panX,
        panY: viewState.panY
      };
      
      // 如果是批注模式，记录位置
      if (activeTool === 'note' && pageRef.current) {
        const rect = pageRef.current.getBoundingClientRect();
        const x = (e.touches[0].clientX - rect.left) / rect.width;
        const y = (e.touches[0].clientY - rect.top) / rect.height;
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
          setTempNote({ x, y, content: '' });
        }
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault(); // 防止页面滚动
    
    if (e.touches.length === 2 && isPinching) {
      // 双指缩放：以双指中心为焦点缩放
      const dx = e.touches[0].pageX - e.touches[1].pageX;
      const dy = e.touches[0].pageY - e.touches[1].pageY;
      const distance = Math.hypot(dx, dy);
      const scaleFactor = distance / initialPinchDistance.current;
      
      // 计算新的缩放级别
      const newScale = Math.max(0.5, Math.min(5, lastTouch.current!.scale * scaleFactor));
      
      // 计算焦点偏移以保持中心点稳定
      const centerX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
      const centerY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
      
      // 简化的以焦点为中心的缩放公式
      const scaleRatio = newScale / viewState.scale;
      const newPanX = centerX - (centerX - viewState.panX) * scaleRatio;
      const newPanY = centerY - (centerY - viewState.panY) * scaleRatio;
      
      setViewState({
        scale: newScale,
        panX: newPanX,
        panY: newPanY
      });
    } else if (e.touches.length === 1 && lastTouch.current && !activeTool) {
      // 单指拖拽平移（仅当不在批注模式下）
      if (viewState.scale > 1 || isFullscreen) {
        setIsPanning(true);
        const dx = e.touches[0].clientX - lastTouch.current.x;
        const dy = e.touches[0].clientY - lastTouch.current.y;
        
        setViewState(prev => ({
          ...prev,
          panX: lastTouch.current!.panX + dx,
          panY: lastTouch.current!.panY + dy
        }));
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      setIsPinching(false);
      setIsPanning(false);
      
      // 检测点击（用于批注）
      if (touchStart.current && activeTool === 'note') {
        const dt = Date.now() - touchStart.current.time;
        const dx = Math.abs(e.changedTouches[0].clientX - touchStart.current.x);
        const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
        
        if (dt < 300 && dx < 10 && dy < 10 && tempNote) {
          // 确认添加批注位置
          setActiveTool('select');
        }
      }
      
      touchStart.current = null;
    } else if (e.touches.length === 1 && isPinching) {
      // 从双指变为单指，切换为平移模式
      setIsPinching(false);
      setIsPanning(true);
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
        touches: 1
      };
      lastTouch.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        scale: viewState.scale,
        panX: viewState.panX,
        panY: viewState.panY
      };
    }
  };

  // 鼠标滚轮缩放（桌面端）
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.max(0.5, Math.min(5, viewState.scale + delta));
      setViewState(prev => ({ ...prev, scale: newScale }));
    }
  };

  // 批注处理
  const handleAddNote = () => {
    if (tempNote && tempNote.content.trim()) {
      onAddAnnotation({
        bookId: book.id,
        page: pageNumber,
        x: tempNote.x,
        y: tempNote.y,
        content: tempNote.content.trim(),
        color: '#fbbf24',
        type: 'note',
      });
      setTempNote(null);
      toast.success('批注已添加');
    }
  };

  const handleTextSelection = useCallback(() => {
    if (activeTool !== 'highlight') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    
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
      
      // 自动添加高亮
      const pageRect = pageElement.getBoundingClientRect();
      const relativeRects = rects.map(rect => ({
        left: ((rect.left - pageRect.left) / pageRect.width) * 100,
        top: ((rect.top - pageRect.top) / pageRect.height) * 100,
        width: (rect.width / pageRect.width) * 100,
        height: (rect.height / pageRect.height) * 100,
      }));
      
      onAddAnnotation({
        bookId: book.id,
        page: pageNum,
        type: 'highlight',
        content: '',
        color: '#fef08a',
        rects: relativeRects,
        quote: text,
        x: 0, y: 0
      });
      
      window.getSelection()?.removeAllRanges();
      setActiveTool('select');
      toast.success('已高亮');
    }
  }, [activeTool, pageNumber, book.id, onAddAnnotation]);

  const handleDelete = useCallback((id: string) => {
    onDeleteAnnotation(id);
    setSelectedAnnotation(null);
    toast.success('已删除');
  }, [onDeleteAnnotation]);

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) {
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
        case '+':
        case '=':
          e.preventDefault();
          setViewState(prev => ({ ...prev, scale: Math.min(5, prev.scale + 0.2) }));
          break;
        case '-':
          e.preventDefault();
          setViewState(prev => ({ ...prev, scale: Math.max(0.5, prev.scale - 0.2) }));
          break;
        case '0':
          e.preventDefault();
          resetView();
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
  }, [goToNext, goToPrev, onClose]);

  const currentAnnotations = useMemo(() => 
    annotations.filter(a => a.page === pageNumber),
  [annotations, pageNumber]);

  if (viewMode === 'thumbnails') {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center justify-between p-3 border-b h-14 shrink-0">
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
      onClick={resetControlsTimer}
    >
      {/* 顶部控制栏 */}
      <div className={cn(
        "absolute top-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-md border-b transition-transform duration-300",
        (isFullscreen || showControls) ? "translate-y-0" : "-translate-y-full",
        isFullscreen && "bg-black/80 border-white/10 text-white"
      )}>
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            {(onClose && !isFullscreen) && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setViewMode('thumbnails')}>
              <LayoutGrid className="h-4 w-4" />
              {!isMobile && "目录"}
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-muted/50 rounded-full px-3 py-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrev} disabled={pageNumber <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium tabular-nums min-w-[60px] text-center">
                {pageNumber}/{numPages}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNext} disabled={pageNumber >= numPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1 bg-muted/50 rounded-full px-2 py-1 mr-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewState(prev => ({ ...prev, scale: Math.max(0.5, prev.scale - 0.2) }))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs w-10 text-center font-mono">{Math.round(viewState.scale * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewState(prev => ({ ...prev, scale: Math.min(5, prev.scale + 0.2) }))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className={cn(
        "absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-background/90 backdrop-blur-md border rounded-full shadow-lg px-4 py-2 transition-all duration-300",
        (showControls || activeTool !== 'select') ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none",
        isFullscreen && "bg-black/80 border-white/10 text-white bottom-10"
      )}>
        <Button 
          variant={activeTool === 'move' ? 'default' : 'ghost'} 
          size="icon" 
          className="h-9 w-9 rounded-full"
          onClick={() => setActiveTool(activeTool === 'move' ? 'select' : 'move')}
          title="移动/浏览"
        >
          <Move className="h-4 w-4" />
        </Button>
        
        <Button 
          variant={activeTool === 'highlight' ? 'default' : 'ghost'} 
          size="icon" 
          className="h-9 w-9 rounded-full"
          onClick={() => setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight')}
          title="高亮"
        >
          <Highlighter className="h-4 w-4" />
        </Button>

        <Button 
          variant={activeTool === 'note' ? 'default' : 'ghost'} 
          size="icon" 
          className="h-9 w-9 rounded-full relative"
          onClick={() => setActiveTool(activeTool === 'note' ? 'select' : 'note')}
          title="添加批注"
        >
          <MessageSquare className="h-4 w-4" />
          {activeTool === 'note' && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />}
        </Button>

        <div className="w-px h-4 bg-border mx-1" />
        
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={resetView} title="重置视图">
          <GripHorizontal className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setRotation(r => (r + 90) % 360)}>
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      {/* 批注提示 */}
      {activeTool === 'note' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg flex items-center gap-2 animate-in fade-in">
          <span>点击页面添加批注便签</span>
          <button onClick={() => setActiveTool('select')} className="hover:opacity-80">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* PDF 内容区域 - 支持自由缩放平移 */}
      <div 
        ref={viewRef}
        className={cn(
          "flex-1 overflow-hidden relative touch-none select-text bg-muted/20",
          (isPanning || activeTool === 'move') && "cursor-grab active:cursor-grabbing",
          activeTool === 'note' && "cursor-crosshair",
          isFullscreen && "bg-black"
        )}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseUp={handleTextSelection}
        onWheel={onWheel}
      >
        <div 
          className="w-full h-full flex items-center justify-center"
          style={{
            transform: `translate(${viewState.panX}px, ${viewState.panY}px) scale(${viewState.scale})`,
            transformOrigin: 'center center',
            transition: isPinching || isPanning ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          <Document 
            file={fileUrl} 
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-[50vh]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <div
              ref={pageRef}
              className="relative shadow-2xl bg-white"
              style={{ transform: `rotate(${rotation}deg)` }}
              onClick={(e) => {
                if (activeTool === 'note') {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width;
                  const y = (e.clientY - rect.top) / rect.height;
                  setTempNote({ x, y, content: '' });
                }
              }}
              data-page-number={pageNumber}
            >
              <Page
                pageNumber={pageNumber}
                scale={1.5} // 高分辨率渲染
                rotate={rotation}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                className="shadow-2xl"
              />
              
              {/* 渲染现有批注 */}
              {currentAnnotations.map(ann => {
                if (ann.type === 'highlight' && ann.rects) {
                  return (
                    <div key={ann.id} className="absolute inset-0 pointer-events-none">
                      {ann.rects.map((rect, i) => (
                        <div
                          key={i}
                          className="absolute bg-yellow-300/50 pointer-events-auto cursor-pointer hover:bg-yellow-300/70 transition-colors"
                          style={{
                            left: `${rect.left}%`,
                            top: `${rect.top}%`,
                            width: `${rect.width}%`,
                            height: `${rect.height}%`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAnnotation(ann);
                          }}
                        />
                      ))}
                    </div>
                  );
                }
                if (ann.type === 'note') {
                  const isEditing = editingAnnotation === ann.id;
                  return (
                    <div
                      key={ann.id}
                      className="absolute z-20"
                      style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%`, transform: 'translate(-50%, -50%)' }}
                    >
                      {isEditing ? (
                        <div className="bg-white border-2 border-primary rounded-lg shadow-xl p-2 w-48 animate-in zoom-in-95">
                          <Textarea
                            autoFocus
                            defaultValue={ann.content}
                            className="min-h-[80px] text-sm resize-none"
                            onBlur={(e) => {
                              onUpdateAnnotation(ann.id, e.target.value);
                              setEditingAnnotation(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.metaKey) {
                                onUpdateAnnotation(ann.id, (e.target as HTMLTextAreaElement).value);
                                setEditingAnnotation(null);
                              }
                            }}
                          />
                          <div className="flex justify-end mt-2">
                            <Button size="sm" className="h-7" onClick={() => setEditingAnnotation(null)}>
                              <Check className="h-3 w-3 mr-1" />
                              完成
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="group relative"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingAnnotation(ann.id);
                          }}
                        >
                          <div className="w-8 h-8 bg-amber-400 rounded-full shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform border-2 border-white">
                            <MessageSquare className="h-4 w-4 text-amber-900" />
                          </div>
                          {ann.content && (
                            <div className="absolute left-10 top-0 bg-white border shadow-lg rounded-lg p-2 w-48 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                              <p className="text-xs text-muted-foreground line-clamp-3">{ann.content}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}

              {/* 临时批注输入 */}
              {tempNote && (
                <div
                  className="absolute z-30"
                  style={{ left: `${tempNote.x * 100}%`, top: `${tempNote.y * 100}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <div className="bg-white border-2 border-primary rounded-lg shadow-xl p-3 w-56 animate-in zoom-in-95">
                    <Textarea
                      autoFocus
                      placeholder="输入批注..."
                      className="min-h-[100px] text-sm resize-none"
                      value={tempNote.content}
                      onChange={(e) => setTempNote({ ...tempNote, content: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.metaKey) {
                          handleAddNote();
                        }
                        if (e.key === 'Escape') {
                          setTempNote(null);
                          setActiveTool('select');
                        }
                      }}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => {
                        setTempNote(null);
                        setActiveTool('select');
                      }}>
                        取消
                      </Button>
                      <Button size="sm" className="h-7" onClick={handleAddNote}>
                        添加
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Document>
        </div>
      </div>

      {/* 缩略图侧边栏 */}
      {!isMobile && sidebarOpen && (
        <div className="w-56 border-l bg-background/95 backdrop-blur-md flex flex-col shrink-0 h-full absolute right-0 top-0 z-30 shadow-xl">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="font-semibold text-sm">页面导航</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <Document file={fileUrl}>
              <div className="p-2 space-y-2">
                {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => goToPage(page)}
                    className={cn(
                      "w-full relative aspect-[3/4] rounded-lg overflow-hidden transition-all border-2",
                      pageNumber === page ? "border-primary opacity-100" : "border-transparent opacity-50 hover:opacity-80"
                    )}
                  >
                    <Page pageNumber={page} scale={0.12} renderTextLayer={false} renderAnnotationLayer={false} />
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] py-0.5 text-center">
                      {page}
                    </div>
                  </button>
                ))}
              </div>
            </Document>
          </ScrollArea>
        </div>
      )}

      {/* 移动端底部栏 */}
      {isMobile && !isFullscreen && (
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-background/95 backdrop-blur-md border-t flex items-center justify-around z-30">
          <button onClick={() => setViewMode('thumbnails')} className="flex flex-col items-center gap-1 text-muted-foreground">
            <LayoutGrid className="h-5 w-5" />
            <span className="text-[10px]">目录</span>
          </button>
          
          <button onClick={goToPrev} disabled={pageNumber <= 1} className="p-2 disabled:opacity-30">
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="flex flex-col items-center px-4"
          >
            <span className="text-lg font-bold tabular-nums">{pageNumber}</span>
            <span className="text-[10px] text-muted-foreground">/{numPages}</span>
          </button>
          
          <button onClick={goToNext} disabled={pageNumber >= numPages} className="p-2 disabled:opacity-30">
            <ChevronRight className="h-6 w-6" />
          </button>

          <button onClick={toggleFullscreen} className="flex flex-col items-center gap-1 text-muted-foreground">
            <Maximize2 className="h-5 w-5" />
            <span className="text-[10px]">全屏</span>
          </button>
        </div>
      )}

      {/* 对话框 */}
      <Dialog open={!!selectedAnnotation} onOpenChange={() => setSelectedAnnotation(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              批注详情
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">第 {selectedAnnotation?.page} 页</p>
            <div className="bg-muted p-4 rounded-lg mb-4">
              <p className="whitespace-pre-wrap text-sm">{selectedAnnotation?.content}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => {
                setEditingAnnotation(selectedAnnotation?.id || null);
                setSelectedAnnotation(null);
              }}>
                <Pencil className="h-4 w-4 mr-2" />
                编辑
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => selectedAnnotation && handleDelete(selectedAnnotation.id)}>
                <Trash2 className="h-4 w-4 mr-2" />
                删除
              </Button>
            </div>
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
            <p className="text-sm text-muted-foreground">下载《{book.title}》</p>
            <div className="flex items-center space-x-2">
              <Checkbox id="include-annotations" checked={includeAnnotations} onCheckedChange={(checked) => setIncludeAnnotations(checked as boolean)} />
              <label htmlFor="include-annotations" className="text-sm font-medium">
                包含批注 ({annotations.length})
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>取消</Button>
            <Button onClick={() => { onDownloadFile?.(includeAnnotations); setIsDownloadDialogOpen(false); }}>
              <Download className="h-4 w-4 mr-2" />
              下载
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}