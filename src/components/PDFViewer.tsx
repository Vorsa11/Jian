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
  const [viewMode, setViewMode] = useState<'single' | 'thumbnails'>('single');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // 视图状态
  const [viewState, setViewState] = useState<ViewState>({ scale: 1, panX: 0, panY: 0 });
  const [isPinching, setIsPinching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
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
  
  // 手势状态
  const touchStart = useRef<{ x: number; y: number; time: number; scale: number; panX: number; panY: number } | null>(null);
  const lastTouch = useRef<{ x: number; y: number } | null>(null);
  const initialPinchDistance = useRef<number>(0);
  const rafId = useRef<number | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
      if (mobile && viewState.scale === 1) {
        setViewState({ scale: 0.9, panX: 0, panY: 0 });
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    const saved = localStorage.getItem(`pdf-progress-${book.id}`);
    if (saved) setPageNumber(parseInt(saved, 10));
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [book.id, viewState.scale]);

  // 控制栏自动隐藏
  const resetControlsTimer = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    setShowControls(true);
    controlsTimer.current = setTimeout(() => {
      if (!isPinching && !isDragging && activeTool !== 'note') {
        setShowControls(false);
      }
    }, 3000);
  }, [isPinching, isDragging, activeTool]);

  // 全屏监听
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs && !hasShownFullscreenHint) {
        setHasShownFullscreenHint(true);
        toast.success('全屏模式：双指缩放，双击放大，拖拽移动', { duration: 3000 });
      }
      resetControlsTimer();
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [hasShownFullscreenHint, resetControlsTimer]);

  // 边界限制（防止拖出太远）
  const constrainPan = useCallback((newPanX: number, newPanY: number, scale: number) => {
    if (!containerRef.current || !pageRef.current) return { x: newPanX, y: newPanY };
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const pageWidth = pageRef.current.offsetWidth * scale;
    const pageHeight = pageRef.current.offsetHeight * scale;
    
    const maxPanX = Math.max(0, (pageWidth - containerRect.width) / 2 + 50);
    const maxPanY = Math.max(0, (pageHeight - containerRect.height) / 2 + 50);
    
    // 如果页面小于容器，居中显示
    if (pageWidth <= containerRect.width) {
      newPanX = 0;
    } else {
      newPanX = Math.max(-maxPanX, Math.min(maxPanX, newPanX));
    }
    
    if (pageHeight <= containerRect.height) {
      newPanY = 0;
    } else {
      newPanY = Math.max(-maxPanY, Math.min(maxPanY, newPanY));
    }
    
    return { x: newPanX, y: newPanY };
  }, []);

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
    // 翻页时平滑回到中心，但保持缩放级别
    setViewState(prev => ({ ...prev, panX: 0, panY: 0 }));
  }, [numPages, book.id]);

  const goToPrev = () => goToPage(pageNumber - 1);
  const goToNext = () => goToPage(pageNumber + 1);

  const resetView = () => setViewState({ scale: isMobile ? 0.9 : 1, panX: 0, panY: 0 });

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

  // 核心：触摸手势处理（优化版）
  const onTouchStart = (e: React.TouchEvent) => {
    resetControlsTimer();
    
    if (e.touches.length === 2) {
      // 双指缩放开始
      setIsPinching(true);
      const dx = e.touches[0].pageX - e.touches[1].pageX;
      const dy = e.touches[0].pageY - e.touches[1].pageY;
      initialPinchDistance.current = Math.hypot(dx, dy);
      
      touchStart.current = {
        x: (e.touches[0].pageX + e.touches[1].pageX) / 2,
        y: (e.touches[0].pageY + e.touches[1].pageY) / 2,
        time: Date.now(),
        scale: viewState.scale,
        panX: viewState.panX,
        panY: viewState.panY
      };
    } else if (e.touches.length === 1) {
      // 单指：准备拖动或点击
      const touch = e.touches[0];
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        scale: viewState.scale,
        panX: viewState.panX,
        panY: viewState.panY
      };
      lastTouch.current = { x: touch.clientX, y: touch.clientY };
      
      // 批注模式：记录位置
      if (activeTool === 'note' && pageRef.current) {
        const rect = pageRef.current.getBoundingClientRect();
        // 考虑当前的pan和scale计算相对位置
        const relativeX = (touch.clientX - rect.left - viewState.panX) / (rect.width * viewState.scale);
        const relativeY = (touch.clientY - rect.top - viewState.panY) / (rect.height * viewState.scale);
        
        if (relativeX >= 0 && relativeX <= 1 && relativeY >= 0 && relativeY <= 1) {
          setTempNote({ x: relativeX, y: relativeY, content: '' });
        }
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    // 阻止默认滚动行为
    if (e.touches.length > 1 || isDragging) {
      e.preventDefault();
    }
    
    if (e.touches.length === 2 && touchStart.current) {
      // 双指缩放
      const dx = e.touches[0].pageX - e.touches[1].pageX;
      const dy = e.touches[0].pageY - e.touches[1].pageY;
      const distance = Math.hypot(dx, dy);
      const scaleFactor = distance / initialPinchDistance.current;
      
      const newScale = Math.max(0.5, Math.min(5, touchStart.current.scale * scaleFactor));
      
      // 以双指中心为焦点缩放
      const centerX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
      const centerY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
      
      const scaleRatio = newScale / viewState.scale;
      const newPanX = centerX - (centerX - viewState.panX) * scaleRatio;
      const newPanY = centerY - (centerY - viewState.panY) * scaleRatio;
      
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        setViewState({
          scale: newScale,
          panX: newPanX,
          panY: newPanY
        });
      });
    } else if (e.touches.length === 1 && touchStart.current && lastTouch.current) {
      // 单指拖动（只要不是批注模式就允许拖动查看）
      if (activeTool !== 'note' && activeTool !== 'highlight') {
        const touch = e.touches[0];
        const dx = touch.clientX - lastTouch.current.x;
        const dy = touch.clientY - lastTouch.current.y;
        
        // 移动超过5px才算拖动，否则可能是点击
        if (Math.abs(touch.clientX - touchStart.current.x) > 5 || 
            Math.abs(touch.clientY - touchStart.current.y) > 5) {
          setIsDragging(true);
        }
        
        if (isDragging || Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          const newPanX = viewState.panX + dx;
          const newPanY = viewState.panY + dy;
          
          if (rafId.current) cancelAnimationFrame(rafId.current);
          rafId.current = requestAnimationFrame(() => {
            setViewState(prev => ({
              ...prev,
              panX: newPanX,
              panY: newPanY
            }));
          });
          
          lastTouch.current = { x: touch.clientX, y: touch.clientY };
        }
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      // 所有手指离开
      const wasPinching = isPinching;
      const wasDragging = isDragging;
      const startInfo = touchStart.current;
      
      setIsPinching(false);
      setIsDragging(false);
      
      // 检测点击（用于批注或翻页）
      if (startInfo && !wasPinching && !wasDragging) {
        const dt = Date.now() - startInfo.time;
        const target = e.changedTouches[0];
        const dx = Math.abs(target.clientX - startInfo.x);
        const dy = Math.abs(target.clientY - startInfo.y);
        
        // 轻触（小于300ms且移动小于10px）
        if (dt < 300 && dx < 10 && dy < 10) {
          if (activeTool === 'note' && tempNote) {
            // 确认批注位置
            setActiveTool('select');
          } else if (!activeTool || activeTool === 'select') {
            // 判断点击区域：左侧上一页，右侧下一页（可选功能）
            const screenWidth = window.innerWidth;
            if (target.clientX < screenWidth * 0.2 && pageNumber > 1) {
              goToPrev();
            } else if (target.clientX > screenWidth * 0.8 && pageNumber < numPages) {
              goToNext();
            }
          }
        }
        
        // 双击检测（300ms内的第二次点击）
        if (dt < 300 && dx < 20 && dy < 20) {
          const now = Date.now();
          if ((window as any).lastClickTime && now - (window as any).lastClickTime < 300) {
            // 双击缩放
            if (viewState.scale > 1.2) {
              setViewState({ scale: 1, panX: 0, panY: 0 });
            } else {
              setViewState({ scale: 2.5, panX: 0, panY: 0 });
            }
            (window as any).lastClickTime = 0;
          } else {
            (window as any).lastClickTime = now;
          }
        }
      }
      
      touchStart.current = null;
      lastTouch.current = null;
      
      // 应用边界限制（橡皮筋效果）
      if (!wasPinching) {
        const constrained = constrainPan(viewState.panX, viewState.panY, viewState.scale);
        if (constrained.x !== viewState.panX || constrained.y !== viewState.panY) {
          setViewState(prev => ({ ...prev, panX: constrained.x, panY: constrained.y }));
        }
      }
    } else if (e.touches.length === 1 && isPinching) {
      // 从双指变为单指，切换为拖动
      setIsPinching(false);
      const touch = e.touches[0];
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        scale: viewState.scale,
        panX: viewState.panX,
        panY: viewState.panY
      };
      lastTouch.current = { x: touch.clientX, y: touch.clientY };
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
        "flex h-full w-full overflow-hidden relative bg-background touch-none select-none",
        isFullscreen && "fixed inset-0 z-50 bg-black"
      )}
      onClick={resetControlsTimer}
    >
      {/* 顶部控制栏 */}
      <div className={cn(
        "absolute top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-b transition-transform duration-300 ease-out",
        (isFullscreen || showControls) ? "translate-y-0" : "-translate-y-full",
        isFullscreen && "bg-black/90 border-white/10 text-white"
      )}>
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            {(onClose && !isFullscreen) && (
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={onClose}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 gap-1 hover:bg-white/10" onClick={() => setViewMode('thumbnails')}>
              <LayoutGrid className="h-4 w-4" />
              {!isMobile && "目录"}
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-muted/50 rounded-full px-3 py-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-white/20" onClick={goToPrev} disabled={pageNumber <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium tabular-nums min-w-[60px] text-center">
                {pageNumber}/{numPages}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-white/20" onClick={goToNext} disabled={pageNumber >= numPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1 bg-muted/50 rounded-full px-2 py-1 mr-2">
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-white/20" onClick={() => setViewState(prev => ({ ...prev, scale: Math.max(0.5, prev.scale - 0.2) }))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs w-10 text-center font-mono">{Math.round(viewState.scale * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-white/20" onClick={() => setViewState(prev => ({ ...prev, scale: Math.min(5, prev.scale + 0.2) }))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className={cn(
        "absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-md border rounded-full shadow-lg px-4 py-2 transition-all duration-300 ease-out",
        (showControls || activeTool !== 'select') ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none",
        isFullscreen && "bg-black/90 border-white/10 text-white bottom-10"
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
          className={cn(
            "h-9 w-9 rounded-full relative",
            activeTool === 'highlight' && "ring-2 ring-primary ring-offset-2"
          )}
          onClick={() => setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight')}
          title="高亮选中文本"
        >
          <Highlighter className="h-4 w-4" />
        </Button>

        <Button 
          variant={activeTool === 'note' ? 'default' : 'ghost'} 
          size="icon" 
          className={cn(
            "h-9 w-9 rounded-full relative",
            activeTool === 'note' && "ring-2 ring-primary ring-offset-2"
          )}
          onClick={() => setActiveTool(activeTool === 'note' ? 'select' : 'note')}
          title="添加批注"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>

        <div className="w-px h-4 bg-border mx-1" />
        
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={resetView} title="重置视图">
          <GripHorizontal className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setRotation(r => (r + 90) % 360)}>
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      {/* 高亮模式提示 */}
      {activeTool === 'highlight' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span>选中文字即可高亮</span>
          <button onClick={() => setActiveTool('select')} className="hover:opacity-80 p-1">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* 批注提示 */}
      {activeTool === 'note' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-amber-500 text-white px-4 py-2 rounded-full text-sm shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span>点击页面添加批注便签</span>
          <button onClick={() => { setActiveTool('select'); setTempNote(null); }} className="hover:opacity-80 p-1">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* PDF 内容区域 - 支持自由缩放平移 */}
      <div 
        ref={viewRef}
        className={cn(
          "flex-1 overflow-hidden relative bg-muted/30 cursor-grab active:cursor-grabbing",
          activeTool === 'note' && "cursor-crosshair",
          activeTool === 'highlight' && "cursor-text",
          isFullscreen && "bg-black"
        )}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseUp={activeTool === 'highlight' ? handleTextSelection : undefined}
        onWheel={onWheel}
      >
        <div 
          className="w-full h-full flex items-center justify-center will-change-transform"
          style={{
            transform: `translate3d(${viewState.panX}px, ${viewState.panY}px, 0) scale(${viewState.scale})`,
            transformOrigin: 'center center',
            transition: isPinching || isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
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
              style={{ 
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'center center'
              }}
              onClick={(e) => {
                if (activeTool === 'note' && !isDragging) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  // 计算相对于页面的点击位置（考虑缩放和平移）
                  const x = (e.clientX - rect.left) / rect.width;
                  const y = (e.clientY - rect.top) / rect.height;
                  setTempNote({ x, y, content: '' });
                }
              }}
              data-page-number={pageNumber}
            >
              <Page
                pageNumber={pageNumber}
                scale={1.5}
                rotate={rotation}
                renderTextLayer={activeTool === 'highlight'} // 只有高亮模式才显示文字层
                renderAnnotationLayer={false}
                className="shadow-2xl"
                canvasBackground="white"
              />
              
              {/* 渲染现有批注 */}
              {currentAnnotations.map(ann => {
                if (ann.type === 'highlight' && ann.rects) {
                  return (
                    <div key={ann.id} className="absolute inset-0 pointer-events-none">
                      {ann.rects.map((rect, i) => (
                        <div
                          key={i}
                          className="absolute bg-yellow-300/60 pointer-events-auto cursor-pointer hover:bg-yellow-400/70 transition-all border-b-2 border-yellow-500/50"
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
                        <div className="bg-white border-2 border-primary rounded-lg shadow-xl p-2 w-48 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                          <Textarea
                            autoFocus
                            defaultValue={ann.content}
                            className="min-h-[80px] text-sm resize-none border-0 focus-visible:ring-1"
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
                          <div className="w-8 h-8 bg-amber-400 rounded-full shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform border-2 border-white ring-2 ring-amber-400/30">
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
                  onClick={e => e.stopPropagation()}
                >
                  <div className="bg-white border-2 border-amber-400 rounded-lg shadow-xl p-3 w-56 animate-in zoom-in-95">
                    <Textarea
                      autoFocus
                      placeholder="输入批注内容..."
                      className="min-h-[100px] text-sm resize-none border-0 focus-visible:ring-1"
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
                      <Button size="sm" className="h-7 bg-amber-500 hover:bg-amber-600" onClick={handleAddNote}>
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
        <div className="w-56 border-l bg-background/95 backdrop-blur-md flex flex-col shrink-0 h-full absolute right-0 top-14 bottom-0 z-30 shadow-xl">
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
                      "w-full relative aspect-[3/4] rounded-lg overflow-hidden transition-all border-2 hover:opacity-100",
                      pageNumber === page ? "border-primary opacity-100 ring-1 ring-primary" : "border-transparent opacity-60"
                    )}
                  >
                    <Page pageNumber={page} scale={0.12} renderTextLayer={false} renderAnnotationLayer={false} />
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] py-0.5 text-center font-medium">
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
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-background/95 backdrop-blur-lg border-t flex items-center justify-around z-30 pb-safe">
          <button onClick={() => setViewMode('thumbnails')} className="flex flex-col items-center gap-1 text-muted-foreground active:scale-95 transition-transform">
            <LayoutGrid className="h-5 w-5" />
            <span className="text-[10px]">目录</span>
          </button>
          
          <button onClick={goToPrev} disabled={pageNumber <= 1} className="p-3 disabled:opacity-30 active:scale-95 transition-transform">
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="flex flex-col items-center px-4 active:scale-95 transition-transform"
          >
            <span className="text-lg font-bold tabular-nums leading-none">{pageNumber}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">/{numPages}</span>
          </button>
          
          <button onClick={goToNext} disabled={pageNumber >= numPages} className="p-3 disabled:opacity-30 active:scale-95 transition-transform">
            <ChevronRight className="h-6 w-6" />
          </button>

          <button onClick={toggleFullscreen} className="flex flex-col items-center gap-1 text-muted-foreground active:scale-95 transition-transform">
            <Maximize2 className="h-5 w-5" />
            <span className="text-[10px]">全屏</span>
          </button>
        </div>
      )}

      {/* 批注详情对话框 */}
      <Dialog open={!!selectedAnnotation} onOpenChange={() => setSelectedAnnotation(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-amber-500" />
              批注详情
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">第 {selectedAnnotation?.page} 页</p>
            {selectedAnnotation?.quote && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4 rounded-r-lg">
                <p className="text-sm text-yellow-900 italic line-clamp-3">"{selectedAnnotation.quote}"</p>
              </div>
            )}
            <div className="bg-muted p-4 rounded-lg mb-4">
              <p className="whitespace-pre-wrap text-sm">{selectedAnnotation?.content || '无文本内容'}</p>
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