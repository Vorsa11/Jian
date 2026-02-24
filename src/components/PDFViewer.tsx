import { useState, useRef, useCallback, useEffect } from 'react';
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
  Printer,
  ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import type { PDFAnnotation, Book } from '@/types';

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  fileUrl: string;
  book: Book;
  annotations: PDFAnnotation[];
  onAddAnnotation: (annotation: Omit<PDFAnnotation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateAnnotation: (id: string, content: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onDownloadFile?: (includeAnnotations: boolean) => void;
}

export function PDFViewer({
  fileUrl,
  book,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onDownloadFile,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false);
  const [newAnnotationPos, setNewAnnotationPos] = useState<{ x: number; y: number } | null>(null);
  const [newAnnotationContent, setNewAnnotationContent] = useState('');
  const [selectedAnnotation, setSelectedAnnotation] = useState<PDFAnnotation | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<PDFAnnotation | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [showAllPages, setShowAllPages] = useState(false);
  const [scrollMode, setScrollMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const pageAnnotations = annotations.filter((ann) => ann.page === pageNumber);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setLoadError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error);
    setLoadError('PDF加载失败，请检查文件');
  };

  const goToPrevPage = () => setPageNumber((p) => Math.max(p - 1, 1));
  const goToNextPage = () => setPageNumber((p) => Math.min(p + 1, numPages));

  const handleZoomIn = () => setScale((s) => Math.min(3, s + 0.2));
  const handleZoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddingAnnotation || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setNewAnnotationPos({ x, y });
  };

  const handleAddAnnotation = () => {
    if (!newAnnotationPos || !newAnnotationContent.trim()) return;
    onAddAnnotation({
      bookId: book.id,
      page: pageNumber,
      x: newAnnotationPos.x,
      y: newAnnotationPos.y,
      content: newAnnotationContent.trim(),
      color: '#fbbf24',
    });
    setNewAnnotationContent('');
    setNewAnnotationPos(null);
    setIsAddingAnnotation(false);
    toast.success('批注已添加');
  };

  const handleUpdateAnnotation = () => {
    if (!editingAnnotation || !editContent.trim()) return;
    onUpdateAnnotation(editingAnnotation.id, editContent.trim());
    setEditingAnnotation(null);
    setEditContent('');
    toast.success('批注已更新');
  };

  const handleDeleteAnnotation = (id: string) => {
    onDeleteAnnotation(id);
    setSelectedAnnotation(null);
    toast.success('批注已删除');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleDownload = () => {
    setIsDownloadDialogOpen(true);
  };

  const confirmDownload = () => {
    if (onDownloadFile) {
      onDownloadFile(includeAnnotations);
    }
    setIsDownloadDialogOpen(false);
  };

  const handlePrint = () => {
    const printWindow = window.open(fileUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  // Handle wheel for page navigation
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom with Ctrl+wheel
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    } else if (!scrollMode && !showAllPages) {
      // Page navigation with wheel
      e.preventDefault();
      if (e.deltaY > 0) {
        goToNextPage();
      } else {
        goToPrevPage();
      }
    }
  }, [scrollMode, showAllPages]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showAllPages) return;
      
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          goToNextPage();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goToPrevPage();
          break;
        case 'Home':
          e.preventDefault();
          setPageNumber(1);
          break;
        case 'End':
          e.preventDefault();
          setPageNumber(numPages);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, showAllPages]);

  if (showAllPages) {
    // All pages preview mode
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-3 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAllPages(false)}>
              <ScrollText className="h-4 w-4 mr-1" />
              单页模式
            </Button>
          </div>
          <span className="text-sm font-medium">全部页面预览</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setScale((s) => Math.max(0.3, s - 0.1))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
            <Button variant="outline" size="sm" onClick={() => setScale((s) => Math.min(2, s + 0.1))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* All Pages Grid */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="h-96 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                </div>
              }
            >
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
                  <div
                    key={page}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => {
                      setPageNumber(page);
                      setShowAllPages(false);
                    }}
                  >
                    <div className="relative bg-white shadow-md rounded-lg overflow-hidden">
                      <Page
                        pageNumber={page}
                        scale={0.3}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-center text-xs py-1">
                        第 {page} 页
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Document>
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (scrollMode) {
    // Scroll mode - continuous reading
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-3 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setScrollMode(false)}>
              <ScrollText className="h-4 w-4 mr-1" />
              翻页模式
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
            <Button variant="outline" size="sm" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleRotate}>
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scroll Content */}
        <ScrollArea ref={scrollContainerRef} className="flex-1 bg-muted/30">
          <div className="py-8">
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="h-96 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                </div>
              }
            >
              <div className="space-y-4">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
                  <div key={page} className="flex justify-center">
                    <div className="relative shadow-xl rounded-lg overflow-hidden bg-white">
                      <Page
                        pageNumber={page}
                        scale={scale}
                        rotate={rotation}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                        {page} / {numPages}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Document>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Single page mode (default)
  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-background"
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/50 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToPrevPage} disabled={pageNumber <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm min-w-[80px] text-center font-mono">
            {numPages > 0 ? `${pageNumber} / ${numPages}` : '-'}
          </span>
          <Button variant="outline" size="sm" onClick={goToNextPage} disabled={pageNumber >= numPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setShowAllPages(true)}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setScrollMode(true)}>
            <ScrollText className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-14 text-center font-mono">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleRotate}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={isAddingAnnotation ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setIsAddingAnnotation(!isAddingAnnotation);
              setNewAnnotationPos(null);
            }}
            disabled={loadError !== null}
          >
            <Plus className="h-4 w-4 mr-1" />
            批注
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <FileDown className="h-4 w-4 mr-1" />
            下载
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto p-4 relative bg-muted/30">
        {isAddingAnnotation && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg flex items-center gap-2">
            <span>点击页面添加批注</span>
            <button
              onClick={() => { setIsAddingAnnotation(false); setNewAnnotationPos(null); }}
              className="hover:opacity-80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Navigation hint */}
        <div className="absolute bottom-4 right-4 z-10 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded space-y-1">
          <p>滚轮翻页 · Ctrl+滚轮缩放</p>
          <p>← → 方向键翻页</p>
        </div>

        <div className="flex justify-center min-h-full items-start">
          {loadError ? (
            <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
              <p className="text-lg mb-2">{loadError}</p>
              <p className="text-sm">请尝试重新上传文件</p>
            </div>
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="h-96 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                </div>
              }
            >
              <div
                ref={pageRef}
                className="relative inline-block shadow-xl rounded-lg overflow-hidden"
                onClick={handlePageClick}
                style={{ cursor: isAddingAnnotation ? 'crosshair' : 'default' }}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  rotate={rotation}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={
                    <div className="w-[400px] h-[600px] flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  }
                />

                {/* Annotation Markers */}
                {pageAnnotations.map((ann) => (
                  <button
                    key={ann.id}
                    className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-amber-400 hover:bg-amber-500 flex items-center justify-center shadow-lg transition-transform hover:scale-110 z-10 border-2 border-white"
                    style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%` }}
                    onClick={(e) => { e.stopPropagation(); setSelectedAnnotation(ann); }}
                    title="查看批注"
                  >
                    <MessageSquare className="h-4 w-4 text-amber-900" />
                  </button>
                ))}

                {/* New Annotation Position */}
                {newAnnotationPos && (
                  <div
                    className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-primary flex items-center justify-center shadow-lg z-20 border-2 border-white"
                    style={{ left: `${newAnnotationPos.x * 100}%`, top: `${newAnnotationPos.y * 100}%` }}
                  >
                    <Plus className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            </Document>
          )}
        </div>
      </div>

      {/* Add Annotation Dialog */}
      <Dialog open={!!newAnnotationPos} onOpenChange={() => setNewAnnotationPos(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加批注</DialogTitle></DialogHeader>
          <Textarea
            placeholder="输入批注内容..."
            value={newAnnotationContent}
            onChange={(e) => setNewAnnotationContent(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNewAnnotationPos(null)}>取消</Button>
            <Button onClick={handleAddAnnotation} disabled={!newAnnotationContent.trim()}>添加</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Annotation Dialog */}
      <Dialog open={!!selectedAnnotation} onOpenChange={() => setSelectedAnnotation(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>批注</DialogTitle></DialogHeader>
          <div className="py-4">
            {editingAnnotation?.id === selectedAnnotation?.id ? (
              <>
                <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} autoFocus />
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => { setEditingAnnotation(null); setEditContent(''); }}>取消</Button>
                  <Button onClick={handleUpdateAnnotation}>保存</Button>
                </div>
              </>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{selectedAnnotation?.content}</p>
                <p className="text-xs text-muted-foreground mt-4">
                  第 {selectedAnnotation?.page} 页 · {selectedAnnotation && new Date(selectedAnnotation.createdAt).toLocaleString()}
                </p>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => { if (selectedAnnotation) { setEditingAnnotation(selectedAnnotation); setEditContent(selectedAnnotation.content); } }}>编辑</Button>
                  <Button variant="destructive" onClick={() => selectedAnnotation && handleDeleteAnnotation(selectedAnnotation.id)}>删除</Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Download Dialog */}
      <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              下载文件
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              您正在下载《{book.title}》的PDF文件
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-annotations"
                checked={includeAnnotations}
                onCheckedChange={(checked) => setIncludeAnnotations(checked as boolean)}
              />
              <label
                htmlFor="include-annotations"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                同时下载批注（导出为文本文件）
              </label>
            </div>
            {includeAnnotations && annotations.length > 0 && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="text-muted-foreground">
                  将导出 {annotations.length} 条批注
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={confirmDownload}>
              <Download className="h-4 w-4 mr-1" />
              确认下载
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
