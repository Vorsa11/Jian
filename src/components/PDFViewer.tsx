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

// 保持能工作的 Worker 配置
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// 扩展的批注类型（确保与后端一致）
interface PDFAnnotation {
  id: string;
  page: number;
  type: 'note' | 'highlight' | 'text';
  content: string;
  color: string;
  x?: number;
  y?: number;
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

// 工具函数：格式化日期
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
  // 核心状态
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  
  // 视图模式：single | scroll | thumbnails
  const [viewMode, setViewMode] = useState<'single' | 'scroll' | 'thumbnails'>('single');
  
  // 侧边栏状态
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'thumbnails' | 'annotations'>('thumbnails');
  
  // 批注状态
  const [activeTool, setActiveTool] = useState<'select' | 'note' | 'highlight'>('select');
  const [selectedAnnotation, setSelectedAnnotation] = useState<PDFAnnotation | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<PDFAnnotation | null>(null);
  
  const [pendingAnnotation, setPendingAnnotation] = useState<{
    x: number;
    y: number;
    page: number;
    type: 'note' | 'highlight';
    quote?: string;
  } | null>(null);
  
  // 移动端检测
  const [isMobile, setIsMobile] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const toolbarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 触摸手势
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // 记忆缩放级别
  const savedScale = useRef(1.2);

  // 初始化
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // 恢复阅读进度
    const saved = localStorage.getItem(`pdf-progress-${book.id}`);
    if (saved) setPageNumber(parseInt(saved, 10));
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [book.id]);

  // 自动隐藏工具栏（移动端）
  const resetToolbarTimer = useCallback(() => {
    if (!isMobile) return;
    setShowToolbar(true);
    if (toolbarTimeout.current) clearTimeout(toolbarTimeout.current);
    toolbarTimeout.current = setTimeout(() => setShowToolbar(false), 3000);
  }, [isMobile]);

  // PDF 加载事件
  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoadError(null);
    const saved = localStorage.getItem(`pdf-progress-${book.id}`);
    if (saved) {
      const page = parseInt(saved, 10);
      if (page <= numPages) setPageNumber(page);
    }
    toast.success(`已加载 ${numPages} 页`);
  }, [book.id]);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    setLoadError('无法加载 PDF 文件，请检查链接或网络连接');
    toast.error('PDF 加载失败');
  }, []);

  // 页面导航
  const goToPage = useCallback((page: number) => {
    const target = Math.max(1, Math.min(page, numPages));
    setPageNumber(target);
    localStorage.setItem(`pdf-progress-${book.id}`, String(target));
  }, [numPages, book.id]);

  const goToPrev = () => goToPage(pageNumber - 1);
  const goToNext = () => goToPage(pageNumber + 1);

  // 缩放控制
  const handleZoom = useCallback((delta: number) => {
    setScale(s => {
      const newScale = Math.max(0.5, Math.min(3, s + delta));
      savedScale.current = newScale;
      return newScale;
    });
  }, []);

  const fitToWidth = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth || 800;
    const sidebarWidth = sidebarOpen && !isMobile ? 240 : 0;
    const availableWidth = containerWidth - sidebarWidth - 48;
    setScale(Math.min(availableWidth / 612, 2)); // 612 是标准 PDF 宽度
  }, [sidebarOpen, isMobile]);

  // 全屏
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

  // 批注操作
  const handlePageClick = useCallback((e: React.MouseEvent, pageNum: number) => {
    if (activeTool === 'select' || !pageRef.current) return;
    
    const rect = pageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    if (activeTool === 'note') {
      setPendingAnnotation({ x, y, page: pageNum, type: 'note' });
    }
  }, [activeTool]);

  const confirmAddAnnotation = useCallback((content: string) => {
    if (!pendingAnnotation || !content.trim()) return;
    
    onAddAnnotation({
      bookId: book.id,
      page: pendingAnnotation.page,
      x: pendingAnnotation.x,
      y: pendingAnnotation.y,
      content: content.trim(),
      color: pendingAnnotation.type === 'highlight' ? '#fef08a' : '#fbbf24',
      type: pendingAnnotation.type,
      quote: pendingAnnotation.quote,
    });
    
    setPendingAnnotation(null);
    setActiveTool('select');
    toast.success('批注已添加');
  }, [pendingAnnotation, book.id, onAddAnnotation]);

  const handleDelete = useCallback((id: string) => {
    onDeleteAnnotation(id);
    setSelectedAnnotation(null);
    setEditingAnnotation(null);
    toast.success('批注已删除');
  }, [onDeleteAnnotation]);

  // 键盘快捷键
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
        case 'Escape':
          if (selectedAnnotation) setSelectedAnnotation(null);
          else if (pendingAnnotation) setPendingAnnotation(null);
          else if (activeTool !== 'select') setActiveTool('select');
          else if (onClose) onClose();
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, goToPage, numPages, selectedAnnotation, pendingAnnotation, activeTool, onClose]);

  // 触摸手势（移动端滑动翻页）
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    resetToolbarTimer();
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current || viewMode !== 'single') return;
    
    const dx = touchStart.current.x - e.changedTouches[0].clientX;
    const dy = touchStart.current.y - e.changedTouches[0].clientY;
    
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0) goToNext();
      else goToPrev();
    }
    
    touchStart.current = null;
  };

  // 当前页批注
  const currentAnnotations = useMemo(() => 
    annotations.filter(a => a.page === pageNumber),
  [annotations, pageNumber]);

  // 渲染缩略图
  const renderThumbnails = () => (
    <div className="space-y-2 p-2">
      {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
        <button
          key={page}
          onClick={() => {
            goToPage(page);
            if (isMobile) setSidebarOpen(false);
          }}
          className={cn(
            "w-full relative aspect-[3/4] rounded-lg overflow-hidden transition-all",
            pageNumber === page 
              ? "ring-2 ring-primary ring-offset-1" 
              : "hover:opacity-80 opacity-60"
          )}
        >
          <Page
            pageNumber={page}
            scale={0.15}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] py-0.5 text-center">
            {page}
          </div>
        </button>
      ))}
    </div>
  );

  // 渲染批注列表
  const renderAnnotationList = () => (
    <div className="space-y-3 p-3">
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
              if (isMobile) setSidebarOpen(false);
            }}
            className={cn(
              "p-3 rounded-lg border text-sm cursor-pointer transition-colors",
              selectedAnnotation?.id === ann.id 
                ? "border-primary bg-primary/5" 
                : "border-border hover:bg-accent"
            )}
          >
            <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
              <span className={cn(
                "w-2 h-2 rounded-full",
                ann.type === 'highlight' ? "bg-yellow-400" : "bg-amber-400"
              )} />
              <span>第 {ann.page} 页</span>
              <span>·</span>
              <span>{formatDate(ann.createdAt)}</span>
            </div>
            <p className="line-clamp-2 text-xs">{ann.content || ann.quote || '[无文本]'}</p>
          </div>
        ))
      )}
    </div>
  );

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
                {renderThumbnails()}
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
      className="flex h-full bg-background overflow-hidden relative"
      onMouseMove={resetToolbarTimer}
      onClick={resetToolbarTimer}
    >
      {/* 左侧边栏 */}
      {!isMobile && sidebarOpen && (
        <div className="w-60 border-r bg-muted/30 flex flex-col animate-in slide-in-from-left">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="font-semibold text-sm">{book.title}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(false)}>
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
            <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError}>
              {sidebarTab === 'thumbnails' ? renderThumbnails() : renderAnnotationList()}
            </Document>
          </ScrollArea>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col relative">
        {/* 顶部悬浮工具栏 */}
        <div className={cn(
          "absolute top-4 left-1/2 -translate-x-1/2 z-40 transition-all duration-300",
          !showToolbar && isMobile && "-translate-y-20 opacity-0 pointer-events-none"
        )}>
          <div className="flex items-center gap-1 bg-background/90 backdrop-blur-md border rounded-full shadow-lg px-2 py-1.5">
            {onClose && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>退出 (Esc)</TooltipContent>
              </Tooltip>
            )}
            
            {!sidebarOpen && !isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSidebarOpen(true)}>
                    <PanelRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>显示侧边栏</TooltipContent>
              </Tooltip>
            )}

            <div className="w-px h-4 bg-border mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={goToPrev} disabled={pageNumber <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>上一页</TooltipContent>
            </Tooltip>

            <div className="flex items-center px-2">
              <input
                type="number"
                value={pageNumber}
                onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                className="w-10 text-center text-sm bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                min={1}
                max={numPages}
              />
              <span className="text-sm text-muted-foreground mx-1">/</span>
              <span className="text-sm text-muted-foreground w-6">{numPages}</span>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={goToNext} disabled={pageNumber >= numPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>下一页</TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleZoom(-0.2)}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>缩小</TooltipContent>
            </Tooltip>

            <span className="text-xs w-10 text-center font-mono">{Math.round(scale * 100)}%</span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleZoom(0.2)}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>放大</TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border mx-1 hidden sm:block" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={activeTool === 'highlight' ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-8 w-8 rounded-full hidden sm:flex"
                  onClick={() => setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight')}
                >
                  <Highlighter className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>高亮</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={activeTool === 'note' ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-8 w-8 rounded-full hidden sm:flex"
                  onClick={() => setActiveTool(activeTool === 'note' ? 'select' : 'note')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>添加批注</TooltipContent>
            </Tooltip>

            {/* 更多操作菜单 */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto">
                <SheetHeader>
                  <SheetTitle>{book.title}</SheetTitle>
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
                    <span className="text-xs">{isFullscreen ? '退出全屏' : '全屏'}</span>
                  </Button>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <Button variant="outline" className="w-full" onClick={() => setIsDownloadDialogOpen(true)}>
                    <Download className="h-4 w-4 mr-2" />
                    下载 PDF
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* 工具模式提示 */}
        {activeTool !== 'select' && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
            <span>{activeTool === 'highlight' ? '选中文字以高亮' : '点击页面添加批注'}</span>
            <button onClick={() => setActiveTool('select')} className="hover:opacity-80">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 阅读区域 */}
        <div 
          className="flex-1 overflow-auto bg-muted/30 relative touch-pan-y"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
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
                    <div key={page} className="relative">
                      <Page
                        pageNumber={page}
                        scale={isMobile ? Math.min(scale, 1.0) : scale}
                        rotate={rotation}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        className="shadow-xl"
                      />
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
                    className="relative inline-block shadow-2xl rounded-lg overflow-hidden bg-white transition-transform duration-200"
                    style={{ 
                      cursor: activeTool === 'select' ? 'grab' : 'crosshair',
                      touchAction: activeTool === 'select' ? 'pan-y' : 'none'
                    }}
                    onClick={(e) => handlePageClick(e, pageNumber)}
                  >
                    <Page
                      pageNumber={pageNumber}
                      scale={isMobile ? Math.min(scale, 1.2) : scale}
                      rotate={rotation}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      loading={
                        <div className="w-[300px] h-[400px] md:w-[600px] md:h-[800px] flex items-center justify-center bg-white">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                      }
                    />
                    
                    {/* 批注渲染 */}
                    {currentAnnotations.map(ann => {
                      if (ann.x === undefined || ann.y === undefined) return null;
                      return (
                        <button
                          key={ann.id}
                          className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-amber-400 hover:bg-amber-500 flex items-center justify-center shadow-lg transition-transform hover:scale-110 z-10 border-2 border-white"
                          style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%` }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAnnotation(ann);
                          }}
                        >
                          <MessageSquare className="h-3 w-3 text-amber-900" />
                        </button>
                      );
                    })}

                    {/* 待添加批注预览 */}
                    {pendingAnnotation?.page === pageNumber && (
                      <div
                        className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-primary flex items-center justify-center shadow-lg z-20 border-2 border-white animate-bounce"
                        style={{ left: `${pendingAnnotation.x * 100}%`, top: `${pendingAnnotation.y * 100}%` }}
                      >
                        <Plus className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Document>
          )}
        </div>

        {/* 底部进度条（移动端） */}
        {isMobile && numPages > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(pageNumber / numPages) * 100}%` }}
            />
          </div>
        )}

        {/* 移动端底部导航 */}
        {isMobile && (
          <div className={cn(
            "absolute bottom-6 left-4 right-4 flex items-center justify-between transition-all duration-300",
            !showToolbar && "translate-y-20 opacity-0"
          )}>
            <Button variant="secondary" size="icon" className="rounded-full shadow-lg h-12 w-12" onClick={goToPrev} disabled={pageNumber <= 1}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
            
            <Button 
              variant="secondary" 
              className="rounded-full shadow-lg px-4"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="text-sm font-mono">{pageNumber} / {numPages}</span>
            </Button>

            <Button variant="secondary" size="icon" className="rounded-full shadow-lg h-12 w-12" onClick={goToNext} disabled={pageNumber >= numPages}>
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        )}
      </div>

      {/* 批注编辑弹窗 */}
      <Dialog open={!!pendingAnnotation} onOpenChange={() => setPendingAnnotation(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加批注</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="输入批注内容..."
            autoFocus
            className="mt-4 min-h-[100px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                confirmAddAnnotation((e.target as HTMLTextAreaElement).value);
              }
            }}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setPendingAnnotation(null)}>取消</Button>
            <Button onClick={(e) => {
              const textarea = e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement;
              confirmAddAnnotation(textarea?.value || '');
            }}>
              添加 (⌘+Enter)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 查看批注详情 */}
      <Dialog open={!!selectedAnnotation} onOpenChange={() => {
        setSelectedAnnotation(null);
        setEditingAnnotation(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              批注详情
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {editingAnnotation?.id === selectedAnnotation?.id ? (
              <>
                <Textarea
                  defaultValue={selectedAnnotation?.content}
                  className="min-h-[100px]"
                  autoFocus
                />
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setEditingAnnotation(null)}>取消</Button>
                  <Button className="flex-1" onClick={(e) => {
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
                <div className="bg-muted p-4 rounded-lg mb-4">
                  <p className="whitespace-pre-wrap text-sm">{selectedAnnotation?.content}</p>
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

      {/* 移动端侧边栏 Drawer */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="text-left">{book.title}</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-80px)]">
              <Document file={fileUrl}>
                <div className="p-4 space-y-2">
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
                      <span className="text-sm">第 {page} 页</span>
                    </button>
                  ))}
                </div>
              </Document>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}