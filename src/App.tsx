import { useState, useEffect } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import {
  Library,
  FolderKanban,
  Calendar,
  Settings,
  Upload,
  FileText,
  BookOpen,
  RefreshCw,
  Download,
  UploadCloud,
  Smartphone,
  Code2,
  PieChart,
} from 'lucide-react';
import { useLibrary } from '@/hooks/useLibrary';
import { BookList } from '@/components/BookList';
import { BookDetail } from '@/components/BookDetail';
import { AddBookDialog } from '@/components/AddBookDialog';
import { StatsPanel } from '@/components/StatsPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { SearchBar } from '@/components/SearchBar';
import { PDFViewer } from '@/components/PDFViewer';
import { TextReader } from '@/components/TextReader';
import { ProjectsPanel } from '@/components/ProjectsPanel';
import { SchedulePanel } from '@/components/SchedulePanel';
import { CodingPanel } from '@/components/CodingPanel';
import { PomodoroTimer } from '@/components/PomodoroTimer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Book, FilterCriteria, PDFAnnotation } from '@/types';
import './App.css';

// Navigation items - 日程-编程-书籍-项目
const navItems = [
  { id: 'schedule', label: '日程', icon: Calendar },
  { id: 'coding', label: '编程', icon: Code2 },
  { id: 'library', label: '书籍', icon: Library },
  { id: 'projects', label: '项目', icon: FolderKanban },
];

function App() {
  const {
    categories,
    projects,
    notes,
    sync,
    isLoaded,
    addBook,
    updateBook,
    deleteBook,
    getBook,
    filterBooks,
    uploadFile,
    downloadFile,
    deleteBookFile,
    addPDFAnnotation,
    updatePDFAnnotation,
    deletePDFAnnotation,
    getBookPDFAnnotations,
    addProject,
    deleteProject,
    addProjectKnowledge,
    addProjectLesson,
    addProjectFile,
    deleteProjectFile,
    downloadProjectFile,
    addNote,
    updateNote,
    deleteNote,
    toggleNoteComplete,
    addCategory,
    deleteCategory,
    getAllTags,
    getStats,
    exportData,
    importData,
    regenerateSyncCode,
    syncDataToCloud,
    syncDataFromCloud,
    mergeData,
  } = useLibrary();

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [filter, setFilter] = useState<FilterCriteria>({});
  const [activeTab, setActiveTab] = useState('schedule');
  const [isReadingPDF, setIsReadingPDF] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [readingBookId, setReadingBookId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [syncInputCode, setSyncInputCode] = useState('');
  const [isReadingText, setIsReadingText] = useState(false);
  const [textContent, setTextContent] = useState('');

  const selectedBook = selectedBookId ? getBook(selectedBookId) : null;
  const readingBook = readingBookId ? getBook(readingBookId) : null;
  const filteredBooks = filterBooks(filter);
  const allTags = getAllTags();
  const stats = getStats();

  // Cleanup PDF URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleBookClick = (book: Book) => {
    setSelectedBookId(book.id);
  };

  const handleBackToList = () => {
    setSelectedBookId(null);
  };

  const handleSearch = (query: string) => {
    setFilter((prev) => ({ ...prev, searchQuery: query }));
  };

  const handleFilterChange = (newFilter: Partial<FilterCriteria>) => {
    setFilter((prev) => ({ ...prev, ...newFilter }));
  };

  const handleFileUpload = async (bookId: string, file: File) => {
    // Support all file types
    const maxSize = 100 * 1024 * 1024; // 100MB limit
    
    if (file.size > maxSize) {
      toast.error('文件大小超过100MB限制');
      return;
    }
    
    await uploadFile(bookId, file);
    toast.success('文件上传成功');
  };

  const handleReadPDF = async (bookId: string) => {
    const book = getBook(bookId);
    if (!book?.fileId) {
      toast.error('没有可阅读的文件');
      return;
    }

    try {
      const file = await downloadFile(book.fileId);
      if (file) {
        // Cleanup old URL
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);

        const blob = new Blob([file.data], { type: file.type });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setReadingBookId(bookId);
        setIsReadingPDF(true);
      } else {
        toast.error('文件读取失败');
      }
    } catch (error) {
      toast.error('文件读取失败');
    }
  };

  const handleReadText = async (bookId: string) => {
    const book = getBook(bookId);
    if (!book?.fileId) {
      toast.error('没有可阅读的文件');
      return;
    }

    try {
      const file = await downloadFile(book.fileId);
      if (file) {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(file.data);
        setTextContent(text);
        setReadingBookId(bookId);
        setIsReadingText(true);
      } else {
        toast.error('文件读取失败');
      }
    } catch (error) {
      toast.error('文件读取失败');
    }
  };

  const handleUploadCover = async (bookId: string, file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: file.type });
      const url = URL.createObjectURL(blob);
      updateBook(bookId, { coverUrl: url });
      return Promise.resolve();
    } catch (error) {
      toast.error('封面上传失败');
      return Promise.reject(error);
    }
  };

  const handleAddPDFAnnotationWrapper = (annotation: Omit<PDFAnnotation, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (readingBook) {
      addPDFAnnotation({ ...annotation, bookId: readingBook.id });
    }
  };

  const handleDownloadWithAnnotations = (includeAnnotations: boolean) => {
    if (pdfUrl && readingBook?.fileName) {
      // Download PDF file
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = readingBook.fileName;
      a.click();

      // Download annotations if requested
      if (includeAnnotations) {
        const bookAnnotations = getBookPDFAnnotations(readingBook.id);
        if (bookAnnotations.length > 0) {
          const annotationsText = bookAnnotations
            .sort((a, b) => a.page - b.page || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .map((ann, index) => {
              return `[${index + 1}] 第${ann.page}页\n${ann.content}\n添加时间: ${new Date(ann.createdAt).toLocaleString()}\n`;
            })
            .join('\n---\n\n');

          const fullText = `《${readingBook.title}》批注\n作者: ${readingBook.author}\n导出时间: ${new Date().toLocaleString()}\n共 ${bookAnnotations.length} 条批注\n\n==================\n\n${annotationsText}`;

          const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const annotationA = document.createElement('a');
          annotationA.href = url;
          annotationA.download = `${readingBook.title}_批注.txt`;
          annotationA.click();
          URL.revokeObjectURL(url);
        }
      }

      toast.success('下载已开始');
    }
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-library-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('数据已导出');
  };

  const handleImport = (jsonString: string) => {
    if (importData(jsonString)) {
      toast.success('数据导入成功');
      return true;
    } else {
      toast.error('数据格式错误');
      return false;
    }
  };

  const handleSync = () => {
    // Generate new sync code if not exists
    const syncCode = sync.syncCode || regenerateSyncCode();
    // Upload current data to cloud
    const success = syncDataToCloud(syncCode, {
      books: filteredBooks,
      categories,
      pdfAnnotations: [],
      projects,
      notes,
      sync: { ...sync, syncCode },
    });
    if (success) {
      toast.success('数据已上传到云端，请在其他设备输入此代码');
    } else {
      toast.error('同步失败，请重试');
    }
    setIsSyncOpen(true);
  };

  const handleSyncFromCloud = () => {
    if (!syncInputCode.trim()) {
      toast.error('请输入同步代码');
      return;
    }
    const remoteData = syncDataFromCloud(syncInputCode.toUpperCase());
    if (remoteData) {
      mergeData(remoteData);
      toast.success('同步成功！数据已合并');
      setIsSyncOpen(false);
      setSyncInputCode('');
    } else {
      toast.error('未找到该同步代码的数据，请检查代码是否正确');
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">简</h1>
            <span className="text-xs text-muted-foreground ml-2">v1.4.0</span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Stats Button */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setActiveTab('stats')} 
              className={activeTab === 'stats' ? 'text-primary' : ''}
              title="统计"
            >
              <PieChart className="h-5 w-5" />
            </Button>
            
            {/* Pomodoro Timer */}
            <PomodoroTimer />

            {/* Sync Button */}
            <Button variant="ghost" size="sm" onClick={handleSync} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">同步</span>
            </Button>
            
            {/* Settings Button */}
            <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>设置</SheetTitle>
                </SheetHeader>
                <div className="py-4 space-y-6">
                  {/* Sync Section */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      跨设备同步
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-2">您的同步代码</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 p-2 bg-background rounded text-lg font-mono tracking-wider">
                          {sync.syncCode}
                        </code>
                        <Button size="sm" variant="outline" onClick={() => {
                          const newCode = regenerateSyncCode();
                          toast.success('同步代码已更新: ' + newCode);
                        }}>
                          刷新
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        在其他设备输入此代码即可同步数据
                      </p>
                    </div>
                  </div>

                  {/* Data Management */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">数据管理</h3>
                    <div className="space-y-2">
                      <Button variant="outline" className="w-full gap-2" onClick={handleExport}>
                        <Download className="h-4 w-4" />
                        导出备份
                      </Button>
                      <label className="flex">
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                handleImport(ev.target?.result as string);
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                        <Button variant="outline" className="w-full gap-2" asChild>
                          <span><UploadCloud className="h-4 w-4" />导入数据</span>
                        </Button>
                      </label>
                    </div>
                  </div>

                  {/* Categories */}
                  <SettingsPanel
                    categories={categories}
                    onAddCategory={addCategory}
                    onDeleteCategory={deleteCategory}
                  />

                  {/* About */}
                  <div className="pt-4 border-t text-center">
                    <p className="text-sm text-muted-foreground">简 v1.4.0</p>
                    <p className="text-xs text-muted-foreground mt-1">简约个人知识管理系统</p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {(activeTab === 'library' && !selectedBook) && (
              <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-1" />
                添加
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container px-4 py-4 pb-24">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Schedule Tab */}
          <TabsContent value="schedule" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <SchedulePanel
              notes={notes}
              onAddNote={addNote}
              onUpdateNote={updateNote}
              onDeleteNote={deleteNote}
              onToggleComplete={toggleNoteComplete}
            />
          </TabsContent>

          {/* Coding Tab */}
          <TabsContent value="coding" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <CodingPanel />
          </TabsContent>

          {/* Library Tab */}
          <TabsContent value="library" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {selectedBook ? (
              <BookDetail
                book={selectedBook}
                categories={categories}
                onBack={handleBackToList}
                onUpdate={updateBook}
                onDelete={(id) => {
                  deleteBook(id);
                  handleBackToList();
                  toast.success('书籍已删除');
                }}
                onAddAnnotation={(bookId, content, page) => {
                  const book = getBook(bookId);
                  if (book) {
                    updateBook(bookId, {
                      annotations: [...book.annotations, {
                        id: generateId(),
                        content,
                        page,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      }],
                    });
                    toast.success('批注已添加');
                  }
                }}
                onUpdateAnnotation={(bookId, annotationId, content) => {
                  const book = getBook(bookId);
                  if (book) {
                    updateBook(bookId, {
                      annotations: book.annotations.map((a) =>
                        a.id === annotationId ? { ...a, content, updatedAt: new Date().toISOString() } : a
                      ),
                    });
                    toast.success('批注已更新');
                  }
                }}
                onDeleteAnnotation={(bookId, annotationId) => {
                  const book = getBook(bookId);
                  if (book) {
                    updateBook(bookId, {
                      annotations: book.annotations.filter((a) => a.id !== annotationId),
                    });
                    toast.success('批注已删除');
                  }
                }}
                onUploadFile={handleFileUpload}
                onDeleteFile={deleteBookFile}
                onReadPDF={() => handleReadPDF(selectedBook.id)}
                onReadText={() => handleReadText(selectedBook.id)}
                hasFile={!!selectedBook.fileId}
                onUploadCover={handleUploadCover}
              />
            ) : (
              <div className="space-y-4">
                <SearchBar
                  value={filter.searchQuery || ''}
                  onChange={handleSearch}
                  placeholder="搜索书名、作者、标签..."
                />
                <BookList
                  books={filteredBooks}
                  categories={categories}
                  filter={filter}
                  onFilterChange={handleFilterChange}
                  onBookClick={handleBookClick}
                  allTags={allTags}
                  onEditBook={(book) => {
                    // Open edit dialog
                    setSelectedBookId(book.id);
                  }}
                  onDeleteBook={(bookId) => {
                    deleteBook(bookId);
                    toast.success('书籍已删除');
                  }}
                />
              </div>
            )}
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <ProjectsPanel
              projects={projects}
              onAddProject={addProject}
              onDeleteProject={deleteProject}
              onAddKnowledge={addProjectKnowledge}
              onAddLesson={addProjectLesson}
              onAddFile={addProjectFile}
              onDeleteFile={deleteProjectFile}
              onDownloadFile={downloadProjectFile}
            />
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <StatsPanel stats={stats} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur safe-area-pb z-50">
        <div className="flex justify-around h-16 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  handleBackToList();
                }}
                className={`flex flex-col items-center gap-1 px-4 py-2 transition-all duration-200 ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px]">{item.label}</span>
                {isActive && <div className="absolute bottom-1 w-4 h-0.5 bg-primary rounded-full" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Add Book Dialog */}
      <AddBookDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        categories={categories}
        onAdd={addBook}
        allTags={allTags}
      />

      {/* PDF Viewer Dialog */}
      <Dialog open={isReadingPDF} onOpenChange={setIsReadingPDF}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col" showCloseButton={false}>
          <DialogHeader className="p-4 border-b flex flex-row items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {readingBook?.title || '阅读'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {pdfUrl && readingBook && (
              <PDFViewer
                fileUrl={pdfUrl}
                book={readingBook}
                annotations={getBookPDFAnnotations(readingBook.id)}
                onAddAnnotation={handleAddPDFAnnotationWrapper}
                onUpdateAnnotation={updatePDFAnnotation}
                onDeleteAnnotation={deletePDFAnnotation}
                onDownloadFile={handleDownloadWithAnnotations}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Text Reader */}
      {isReadingText && readingBook && (
        <TextReader
          content={textContent}
          title={readingBook.title}
          bookId={readingBook.id}
          onClose={() => {
            setIsReadingText(false);
            setTextContent('');
          }}
        />
      )}

      {/* Sync Dialog */}
      <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>跨设备同步</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-primary/10 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">您的同步代码</p>
              <code className="text-2xl font-mono tracking-widest">{sync.syncCode}</code>
            </div>
            <div className="space-y-2">
              <Label>在其他设备输入此代码</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="输入同步代码" 
                  value={syncInputCode}
                  onChange={(e) => setSyncInputCode(e.target.value.toUpperCase())}
                  maxLength={6}
                />
                <Button onClick={handleSyncFromCloud}>同步</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 2000,
        }}
        style={{
          top: '20%',
        }}
      />
    </div>
  );
}

// Helper function for generating IDs
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default App;
