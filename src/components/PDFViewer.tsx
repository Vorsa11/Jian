import { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { 
  ChevronLeft, ChevronRight, Search, RotateCw, ZoomIn, ZoomOut, 
  Maximize2, Minimize2, Download, MessageSquare, 
  Highlighter, X, LayoutList, Grid3X3, ScrollText, 
  PanelLeft, PanelRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// 设置 worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// ==================== 类型定义 ====================
type AnnotationType = 'note' | 'highlight' | 'text';

interface PDFAnnotation {
  id: string;
  page: number;
  type: AnnotationType;
  content: string;
  color: string;
  x?: number;
  y?: number;
  rects?: Array<{ left: number; top: number; width: number; height: number }>;
  quote?: string;
  createdAt: string;
  updatedAt: string;
}

interface Book {
  id: string;
  title: string;
  author?: string;
}

type ViewMode = 'single' | 'double' | 'scroll';
type SidebarTab = 'thumbnails' | 'outline' | 'annotations' | 'search';

interface PDFViewerProps {
  fileUrl: string;
  book: Book;
  annotations: PDFAnnotation[];
  onAddAnnotation: (annotation: Omit<PDFAnnotation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateAnnotation: (id: string, updates: Partial<PDFAnnotation>) => void;
  onDeleteAnnotation: (id: string) => void;
  onDownloadFile?: (includeAnnotations: boolean) => void;
}

// ==================== 工具函数 ====================
const useLocalStorage = <T,>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] => {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('localStorage error:', e);
    }
  }, [key, value]);
  
  return [value, setValue];
};

// ==================== 主组件 ====================
export function PDFViewer({
  fileUrl,
  book,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onDownloadFile,
}: PDFViewerProps) {
  // 核心状态
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useLocalStorage('pdf-scale', 1.2);
  const [rotation, setRotation] = useState(0);
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('pdf-view-mode', 'single');
  const [sidebarTab, setSidebarTab] = useLocalStorage<SidebarTab>('pdf-sidebar', 'thumbnails');
  const [isSidebarOpen, setIsSidebarOpen] = useLocalStorage('pdf-sidebar-open', true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ page: number; matchIndex: number }>>([]);
  
  // 批注
  const [activeTool, setActiveTool] = useState<'select' | 'note' | 'highlight'>('select');
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<Partial<PDFAnnotation> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ==================== 事件处理 ====================
  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    const savedPage = localStorage.getItem(`pdf-progress-${book.id}`);
    if (savedPage) setPageNumber(parseInt(savedPage));
  }, [book.id]);

  const handlePageChange = useCallback((newPage: number) => {
    const page = Math.max(1, Math.min(newPage, numPages));
    setPageNumber(page);
    localStorage.setItem(`pdf-progress-${book.id}`, String(page));
  }, [numPages, book.id]);

  // 缩放控制
  const zoomIn = useCallback(() => setScale(s => Math.min(3, s + 0.2)), [setScale]);
  const zoomOut = useCallback(() => setScale(s => Math.max(0.5, s - 0.2)), [setScale]);
  const fitToWidth = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    const pageWidth = 612;
    const sidebarOffset = isSidebarOpen ? 250 : 0;
    setScale((containerWidth - sidebarOffset - 80) / pageWidth);
  }, [isSidebarOpen, setScale]);

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
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  // ==================== 搜索功能 ====================
  const handleSearch = useCallback(async (query: string) => {
    if (!query || !numPages) return;
    setSearchQuery(query);
    
    try {
      const pdf = await pdfjs.getDocument(fileUrl).promise;
      const results: Array<{ page: number; matchIndex: number }> = [];
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(' ');
        
        let index = text.toLowerCase().indexOf(query.toLowerCase());
        let matchIndex = 0;
        while (index !== -1) {
          results.push({ page: i, matchIndex });
          index = text.toLowerCase().indexOf(query.toLowerCase(), index + 1);
          matchIndex++;
        }
      }
      
      setSearchResults(results);
      if (results.length > 0) {
        handlePageChange(results[0].page);
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  }, [fileUrl, numPages, handlePageChange]);

  // ==================== 文本选择 & 批注 ====================
  const handleTextSelection = useCallback(() => {
    if (activeTool === 'select') return;
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const text = selection.toString().trim();
    if (!text) return;
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    setSelectionRect(rect);
    
    if (activeTool === 'highlight') {
      const pageElement = (range.startContainer as Element).closest('.react-pdf__Page');
      if (pageElement) {
        const pageIndex = parseInt(pageElement.getAttribute('data-page-number') || '1');
        const pageRect = pageElement.getBoundingClientRect();
        
        const rects = Array.from(range.getClientRects()).map(r => ({
          left: ((r.left - pageRect.left) / pageRect.width) * 100,
          top: ((r.top - pageRect.top) / pageRect.height) * 100,
          width: (r.width / pageRect.width) * 100,
          height: (r.height / pageRect.height) * 100,
        }));
        
        setPendingAnnotation({
          type: 'highlight',
          page: pageIndex,
          rects,
          quote: text,
          color: '#fef08a',
        });
      }
    }
  }, [activeTool]);

  const confirmAnnotation = useCallback((content: string) => {
    if (!pendingAnnotation) return;
    
    onAddAnnotation({
      ...pendingAnnotation,
      content,
      color: pendingAnnotation.type === 'highlight' ? '#fef08a' : '#fbbf24',
    } as Omit<PDFAnnotation, 'id' | 'createdAt' | 'updatedAt'>);
    
    setPendingAnnotation(null);
    setSelectionRect(null);
    window.getSelection()?.removeAllRanges();
    toast.success('批注已添加');
  }, [pendingAnnotation, onAddAnnotation]);

  // ==================== 键盘快捷键 ====================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch(e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          handlePageChange(pageNumber + (viewMode === 'double' ? 2 : 1));
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          handlePageChange(pageNumber - (viewMode === 'double' ? 2 : 1));
          break;
        case 'Home':
          e.preventDefault();
          handlePageChange(1);
          break;
        case 'End':
          e.preventDefault();
          handlePageChange(numPages);
          break;
        case 'f':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setSidebarTab('search');
            setIsSidebarOpen(true);
          }
          break;
        case 'Escape':
          setActiveTool('select');
          setPendingAnnotation(null);
          setEditingId(null);
          break;
        case 'h':
          e.preventDefault();
          setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight');
          break;
        case 'n':
          e.preventDefault();
          setActiveTool(activeTool === 'note' ? 'select' : 'note');
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pageNumber, numPages, viewMode, handlePageChange, setSidebarTab, setIsSidebarOpen, activeTool]);

  // ==================== 渲染辅助 ====================
  const renderPage = useCallback((pageNum: number) => {
    const isActive = pageNum === pageNumber || (viewMode === 'double' && pageNum === pageNumber + 1);
    
    return (
      <div 
        key={`page-${pageNum}`} 
        className={cn(
          "relative transition-all duration-300",
          viewMode === 'scroll' ? "mb-4" : "",
          !isActive && viewMode !== 'scroll' ? "opacity-50" : ""
        )}
        data-page-number={pageNum}
      >
        <Page
          pageNumber={pageNum}
          scale={scale}
          rotate={rotation}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          className="shadow-2xl"
          loading={
            <div className="w-[600px] h-[800px] flex items-center justify-center bg-white">
              <div className="animate-pulse flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">加载中...</span>
              </div>
            </div>
          }
        />
        
        {/* 批注层 */}
        {annotations
          .filter(ann => ann.page === pageNum)
          .map(ann => (
            <div key={ann.id}>
              {ann.type === 'note' && ann.x !== undefined && ann.y !== undefined && (
                <button
                  className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-amber-400 hover:bg-amber-500 
                           flex items-center justify-center shadow-lg transition-transform hover:scale-110 
                           border-2 border-white z-20 group"
                  style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%` }}
                  onClick={(e) => { e.stopPropagation(); setEditingId(ann.id); }}
                >
                  <MessageSquare className="h-3 w-3 text-amber-900" />
                  <div className="absolute left-full ml-2 top-0 w-48 bg-popover text-popover-foreground 
                                p-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none 
                                transition-opacity text-xs z-30">
                    {ann.content.substring(0, 50)}...
                  </div>
                </button>
              )}
              
              {ann.type === 'highlight' && ann.rects && (
                <div className="absolute inset-0 pointer-events-none">
                  {ann.rects.map((rect, i) => (
                    <div
                      key={i}
                      className="absolute bg-yellow-300/30 border-b-2 border-yellow-400 cursor-pointer 
                               hover:bg-yellow-300/50 transition-colors pointer-events-auto"
                      style={{
                        left: `${rect.left}%`,
                        top: `${rect.top}%`,
                        width: `${rect.width}%`,
                        height: `${rect.height}%`,
                      }}
                      onClick={() => setEditingId(ann.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    );
  }, [pageNumber, scale, rotation, viewMode, annotations]);

  // ==================== UI 组件 ====================
  const Toolbar = () => (
    <div className={cn(
      "flex items-center justify-between px-4 py-2 bg-background/95 backdrop-blur border-b",
      "sticky top-0 z-50 transition-all duration-300",
      isFullscreen ? "opacity-0 hover:opacity-100" : ""
    )}>
      {/* 左侧：文档信息 */}
      <div className="flex items-center gap-3 w-[200px]">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={cn(isSidebarOpen && "bg-accent")}
        >
          {isSidebarOpen ? <PanelLeft className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
        </Button>
        <div className="truncate">
          <h2 className="text-sm font-semibold truncate">{book.title}</h2>
          <p className="text-xs text-muted-foreground">{pageNumber} / {numPages}</p>
        </div>
      </div>

      {/* 中央：阅读控制 */}
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <div className="flex items-center bg-muted rounded-lg p-1 gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePageChange(pageNumber - 1)} disabled={pageNumber <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>上一页 (←)</TooltipContent>
            </Tooltip>
            
            <Input 
              type="number" 
              value={pageNumber} 
              onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
              className="w-16 h-8 text-center"
              min={1} 
              max={numPages}
            />
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePageChange(pageNumber + 1)} disabled={pageNumber >= numPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>下一页 (→)</TooltipContent>
            </Tooltip>
          </div>

          <div className="w-px h-6 bg-border mx-2" />

          <div className="flex items-center bg-muted rounded-lg p-1 gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>缩小 (Ctrl+-)</TooltipContent>
            </Tooltip>
            
            <span className="text-xs w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>放大 (Ctrl++)</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fitToWidth}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>适应宽度</TooltipContent>
            </Tooltip>
          </div>

          <div className="w-px h-6 bg-border mx-2" />

          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button 
              variant={viewMode === 'single' ? 'secondary' : 'ghost'} 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setViewMode('single')}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button 
              variant={viewMode === 'double' ? 'secondary' : 'ghost'} 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setViewMode('double')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button 
              variant={viewMode === 'scroll' ? 'secondary' : 'ghost'} 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setViewMode('scroll')}
            >
              <ScrollText className="h-4 w-4" />
            </Button>
          </div>
        </TooltipProvider>
      </div>

      {/* 右侧：工具 */}
      <div className="flex items-center gap-1 w-[200px] justify-end">
        <TooltipProvider>
          <div className="flex items-center bg-muted rounded-lg p-1 gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={activeTool === 'highlight' ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight')}
                >
                  <Highlighter className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>高亮 (H)</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={activeTool === 'note' ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setActiveTool(activeTool === 'note' ? 'select' : 'note')}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>批注 (N)</TooltipContent>
            </Tooltip>
          </div>

          <div className="w-px h-6 bg-border mx-2" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRotation(r => (r + 90) % 360)}>
                <RotateCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>旋转 (R)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>全屏 (F11)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDownloadFile?.(true)}>
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>下载</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );

  const Sidebar = () => {
    if (!isSidebarOpen) return null;

    return (
      <div className="w-[250px] border-r bg-muted/30 flex flex-col">
        <div className="flex border-b">
          {(['thumbnails', 'outline', 'annotations', 'search'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors relative",
                sidebarTab === tab ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === 'thumbnails' && '缩略图'}
              {tab === 'outline' && '大纲'}
              {tab === 'annotations' && '批注'}
              {tab === 'search' && '搜索'}
              {sidebarTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          {sidebarTab === 'thumbnails' && (
            <div className="p-2 space-y-2">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
                <div
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={cn(
                    "cursor-pointer p-1 rounded transition-all",
                    pageNumber === page ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-accent"
                  )}
                >
                  <div className="relative aspect-[3/4] bg-white shadow-sm rounded overflow-hidden">
                    <Page
                      pageNumber={page}
                      scale={0.2}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-center text-[10px] py-0.5">
                      {page}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sidebarTab === 'search' && (
            <div className="p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索文档..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (searchTimeout.current) clearTimeout(searchTimeout.current);
                    searchTimeout.current = setTimeout(() => handleSearch(e.target.value), 500);
                  }}
                  className="pl-8"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground mb-2">
                    找到 {searchResults.length} 个结果
                  </div>
                  {searchResults.slice(0, 10).map((result, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePageChange(result.page)}
                      className="w-full text-left text-xs p-2 hover:bg-accent rounded"
                    >
                      第 {result.page} 页 - 匹配 {result.matchIndex + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {sidebarTab === 'annotations' && (
            <div className="p-2 space-y-2">
              {annotations.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  暂无批注
                </div>
              ) : (
                annotations.map((ann) => (
                  <div
                    key={ann.id}
                    onClick={() => handlePageChange(ann.page)}
                    className={cn(
                      "p-2 rounded cursor-pointer text-sm border",
                      editingId === ann.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        ann.type === 'highlight' ? "bg-yellow-400" : "bg-amber-400"
                      )} />
                      <span className="text-xs text-muted-foreground">第 {ann.page} 页</span>
                    </div>
                    <p className="line-clamp-2 text-xs">{ann.content || ann.quote}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  };

  // ==================== 主渲染 ====================
  return (
    <div ref={containerRef} className="flex flex-col h-full bg-background overflow-hidden">
      <Toolbar />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <div 
          ref={scrollRef}
          className="flex-1 overflow-auto bg-muted/30 relative"
          onMouseUp={handleTextSelection}
        >
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-muted-foreground">正在加载 PDF...</p>
                </div>
              </div>
            }
          >
            <div className={cn(
              "min-h-full p-8 transition-all duration-300",
              viewMode === 'scroll' ? "flex flex-col items-center" : "flex items-start justify-center gap-4"
            )}>
              {viewMode === 'scroll' ? (
                Array.from({ length: numPages }, (_, i) => i + 1).map(page => renderPage(page))
              ) : viewMode === 'double' ? (
                <>
                  {renderPage(pageNumber)}
                  {pageNumber + 1 <= numPages && renderPage(pageNumber + 1)}
                </>
              ) : (
                renderPage(pageNumber)
              )}
            </div>
          </Document>

          {/* 悬浮操作提示 */}
          {activeTool !== 'select' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground 
                          px-4 py-2 rounded-full text-sm shadow-lg animate-in fade-in slide-in-from-top-2">
              {activeTool === 'highlight' ? '选中文字即可高亮' : '点击页面添加批注'}
              <button 
                onClick={() => setActiveTool('select')}
                className="ml-2 hover:opacity-80"
              >
                <X className="h-3 w-3 inline" />
              </button>
            </div>
          )}

          {/* 批注输入弹窗 */}
          {pendingAnnotation && selectionRect && (
            <div 
              className="fixed z-50 w-80 bg-popover rounded-lg shadow-xl border p-4 animate-in zoom-in-95"
              style={{
                left: Math.min(selectionRect.right + 10, window.innerWidth - 320),
                top: Math.max(selectionRect.top - 50, 20),
              }}
            >
              <h4 className="font-medium mb-2 text-sm">
                {pendingAnnotation.type === 'highlight' ? '添加高亮批注' : '添加批注'}
              </h4>
              <Textarea
                placeholder="输入批注内容..."
                autoFocus
                className="min-h-[80px] mb-3"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    const textarea = e.currentTarget;
                    confirmAnnotation(textarea.value);
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => {
                  setPendingAnnotation(null);
                  setSelectionRect(null);
                  window.getSelection()?.removeAllRanges();
                }}>
                  取消
                </Button>
                <Button size="sm" onClick={(e) => {
                  const textarea = e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement;
                  confirmAnnotation(textarea.value);
                }}>
                  保存 (⌘+Enter)
                </Button>
              </div>
            </div>
          )}

          {/* 批注编辑侧边栏 */}
          {editingId && (
            <div className="absolute right-0 top-0 bottom-0 w-80 bg-background border-l shadow-xl animate-in slide-in-from-right">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-semibold">编辑批注</h3>
                <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-4">
                {(() => {
                  const ann = annotations.find(a => a.id === editingId);
                  if (!ann) return null;
                  return (
                    <div className="space-y-4">
                      {ann.quote && (
                        <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm italic">
                          "{ann.quote}"
                        </div>
                      )}
                      <Textarea
                        defaultValue={ann.content}
                        className="min-h-[200px]"
                      />
                      <div className="flex gap-2">
                        <Button 
                          className="flex-1" 
                          onClick={(e) => {
                            const content = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement)?.value;
                            if (content !== undefined) {
                              onUpdateAnnotation(editingId, { content });
                              setEditingId(null);
                              toast.success('已更新');
                            }
                          }}
                        >
                          保存
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="icon"
                          onClick={() => {
                            onDeleteAnnotation(editingId);
                            setEditingId(null);
                            toast.success('已删除');
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}