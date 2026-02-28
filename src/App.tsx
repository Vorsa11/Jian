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
  Download,
  Code2,
  PieChart,
  Cloud,
  Database,
  Cog,
  ChevronRight,
  HardDrive,
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
import FileManager from '@/components/FileManager';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Book, FilterCriteria } from '@/types';
import './App.css';

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
  } = useLibrary();

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [filter, setFilter] = useState<FilterCriteria>({});
  const [activeTab, setActiveTab] = useState('schedule');
  const [isReadingPDF, setIsReadingPDF] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [readingBookId, setReadingBookId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReadingText, setIsReadingText] = useState(false);
  const [textContent, setTextContent] = useState('');

  const selectedBook = selectedBookId ? getBook(selectedBookId) : null;
  const readingBook = readingBookId ? getBook(readingBookId) : null;
  const filteredBooks = filterBooks(filter);
  const allTags = getAllTags();
  const stats = getStats();

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
    const maxSize = 100 * 1024 * 1024;
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

  const handleAddPDFAnnotationWrapper = (annotation: any) => {
    if (readingBook?.id) {
      addPDFAnnotation({ 
        ...annotation, 
        bookId: readingBook.id,
        type: annotation.type || 'highlight'
      });
    }
  };

  const handleDownloadWithAnnotations = (includeAnnotations: boolean) => {
    if (pdfUrl && readingBook?.fileName) {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = readingBook.fileName;
      a.click();

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
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-6xl px-4 flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">简</h1>
            <span className="text-xs text-muted-foreground ml-2">v1.4.0</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setActiveTab('stats')} 
              className={activeTab === 'stats' ? 'text-primary' : ''}
              title="统计"
            >
              <PieChart className="h-5 w-5" />
            </Button>
            
            <PomodoroTimer />

            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setIsSettingsOpen(true)}
              className={isSettingsOpen ? 'text-primary' : ''}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto max-w-6xl px-4 py-6 pb-28">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsContent value="schedule" className="mt-0">
            <SchedulePanel
              notes={notes}
              onAddNote={addNote}
              onUpdateNote={updateNote}
              onDeleteNote={deleteNote}
              onToggleComplete={toggleNoteComplete}
            />
          </TabsContent>

          <TabsContent value="coding" className="mt-0">
            <CodingPanel />
          </TabsContent>

          <TabsContent value="library" className="mt-0">
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
              <div className="space-y-6">
                <div className="max-w-2xl mx-auto w-full">
                  <SearchBar
                    value={filter.searchQuery || ''}
                    onChange={handleSearch}
                    placeholder="搜索书名、作者、标签..."
                  />
                </div>

                {filteredBooks.length === 0 ? (
                  <div className="text-center py-16 space-y-4 max-w-md mx-auto">
                    <Library className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="text-lg text-muted-foreground">还没有书籍</p>
                    <p className="text-sm text-muted-foreground">
                      点击右下角按钮添加你的第一本书
                    </p>
                  </div>
                ) : (
                  <BookList
                    books={filteredBooks}
                    categories={categories}
                    filter={filter}
                    onFilterChange={handleFilterChange}
                    onBookClick={handleBookClick}
                    allTags={allTags}
                    onEditBook={(book) => setSelectedBookId(book.id)}
                    onDeleteBook={(bookId) => {
                      deleteBook(bookId);
                      toast.success('书籍已删除');
                    }}
                  />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="projects" className="mt-0">
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

          <TabsContent value="stats" className="mt-0">
            <StatsPanel stats={stats} />
          </TabsContent>
        </Tabs>

        {/* Floating Action Button - ONLY in library list view */}
        {activeTab === 'library' && !selectedBook && (
          <button
            onClick={() => setIsAddDialogOpen(true)}
            className="fixed bottom-20 right-6 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:bg-primary/90 transition-all duration-200 flex items-center justify-center"
            aria-label="添加书籍"
          >
            <Upload className="h-6 w-6" />
          </button>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container mx-auto max-w-6xl px-4">
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
                  className={`flex flex-col items-center gap-1 px-2 py-2 transition-colors duration-200 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium leading-none">{item.label}</span>
                  {isActive && <div className="absolute bottom-1 w-6 h-0.5 bg-primary rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Settings Modal - 修复双X和滚动问题 */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b bg-muted/30 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Cog className="h-5 w-5 text-primary" />
              设置
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[calc(85vh-4rem)] overflow-y-auto scrollbar-hide">
            <div className="p-6 space-y-8">
              
              {/* 云文献库板块 */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">云文献库</h3>
                    <p className="text-sm text-muted-foreground">基于 GitHub 的无限空间存储</p>
                  </div>
                </div>
                <div className="bg-card border rounded-2xl p-1 shadow-sm">
                  <FileManager />
                </div>
              </section>

              <Separator />

              {/* 数据管理板块 */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <Database className="h-5 w-5 text-green-600 dark:text-green-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">数据管理</h3>
                    <p className="text-sm text-muted-foreground">本地数据备份与恢复</p>
                  </div>
                </div>
                
                <div className="grid gap-3">
                  <button
                    onClick={handleExport}
                    className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-accent transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg group-hover:bg-background transition-colors">
                        <Download className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">导出备份</div>
                        <div className="text-sm text-muted-foreground">将数据保存为 JSON 文件</div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </button>

                  <label className="cursor-pointer block">
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
                    <div className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-accent transition-colors text-left group">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-lg group-hover:bg-background transition-colors">
                          <HardDrive className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium">导入数据</div>
                          <div className="text-sm text-muted-foreground">从备份文件恢复数据</div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </label>
                </div>
              </section>

              <Separator />

              {/* 应用设置板块 */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                    <Cog className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">应用设置</h3>
                    <p className="text-sm text-muted-foreground">分类管理与偏好</p>
                  </div>
                </div>
                <div className="bg-card border rounded-2xl p-4 shadow-sm">
                  <SettingsPanel
                    categories={categories}
                    onAddCategory={addCategory}
                    onDeleteCategory={deleteCategory}
                  />
                </div>
              </section>

              {/* 底部信息 */}
              <div className="pt-4 text-center space-y-1 text-muted-foreground">
                <p className="text-sm font-medium">简 v1.4.0</p>
                <p className="text-xs">基于 GitHub 的分布式知识库</p>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* 其他 Dialogs */}
      <AddBookDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        categories={categories}
        onAdd={addBook}
        allTags={allTags}
      />

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
                annotations={getBookPDFAnnotations(readingBook.id) as any}
                onAddAnnotation={handleAddPDFAnnotationWrapper}
                onUpdateAnnotation={updatePDFAnnotation}
                onDeleteAnnotation={deletePDFAnnotation}
                onDownloadFile={handleDownloadWithAnnotations}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      <Toaster 
        position="top-center"
        toastOptions={{ duration: 2000 }}
        style={{ top: '20%' }}
      />
    </div>
  );
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default App;