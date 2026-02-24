import { useState, useRef } from 'react';
import {
  ArrowLeft,
  Calendar,
  Edit2,
  MessageSquare,
  MoreVertical,
  Plus,
  Star,
  Trash2,
  User,
  Upload,
  Eye,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Book, Category, Annotation, ReadingStatus } from '@/types';
import { getFileTypeIcon, getFileTypeLabel, isReadableFile } from '@/types';

interface BookDetailProps {
  book: Book;
  categories: Category[];
  onBack: () => void;
  onUpdate: (id: string, updates: Partial<Book>) => void;
  onDelete: (id: string) => void;
  onAddAnnotation: (bookId: string, content: string, page?: number) => void;
  onUpdateAnnotation: (bookId: string, annotationId: string, content: string) => void;
  onDeleteAnnotation: (bookId: string, annotationId: string) => void;
  onUploadFile?: (bookId: string, file: File) => void;
  onDeleteFile?: (bookId: string) => Promise<void>;
  onReadPDF?: () => void;
  onReadText?: () => void;
  hasFile?: boolean;
  onUploadCover?: (bookId: string, file: File) => Promise<void>;
}

const statusLabels: Record<ReadingStatus, string> = {
  unread: '未读',
  reading: '阅读中',
  completed: '已读完',
};

export function BookDetail({
  book,
  categories,
  onBack,
  onUpdate,
  onDelete,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onUploadFile,
  onDeleteFile,
  onReadPDF,
  onReadText,
  hasFile,
  onUploadCover,
}: BookDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState('');
  const [newAnnotationPage, setNewAnnotationPage] = useState('');
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editForm, setEditForm] = useState({
    title: book.title,
    author: book.author,
    description: book.description || '',
    totalPages: book.totalPages?.toString() || '',
    currentPage: book.currentPage?.toString() || '',
    rating: book.rating?.toString() || '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const category = categories.find((c) => c.id === book.categoryId);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadCover) {
      if (!file.type.startsWith('image/')) {
        toast.error('请上传图片文件');
        return;
      }
      await onUploadCover(book.id, file);
      toast.success('封面上传成功');
    }
  };

  const handleDeleteCover = () => {
    onUpdate(book.id, { coverUrl: undefined });
    toast.success('封面已删除');
  };

  const handleSaveEdit = () => {
    if (!editForm.title.trim()) {
      toast.error('书名不能为空');
      return;
    }
    onUpdate(book.id, {
      title: editForm.title.trim(),
      author: editForm.author.trim(),
      description: editForm.description.trim() || undefined,
      totalPages: editForm.totalPages ? parseInt(editForm.totalPages) : undefined,
      currentPage: editForm.currentPage ? parseInt(editForm.currentPage) : undefined,
      rating: editForm.rating ? parseInt(editForm.rating) : undefined,
    });
    setIsEditing(false);
    toast.success('书籍信息已更新');
  };

  const handleDelete = () => {
    onDelete(book.id);
  };

  const handleAddAnnotation = () => {
    if (!newAnnotation.trim()) {
      toast.error('批注内容不能为空');
      return;
    }
    onAddAnnotation(book.id, newAnnotation.trim(), newAnnotationPage ? parseInt(newAnnotationPage) : undefined);
    setNewAnnotation('');
    setNewAnnotationPage('');
    toast.success('批注已添加');
  };

  const handleUpdateAnnotation = () => {
    if (!editingAnnotation || !editContent.trim()) {
      toast.error('批注内容不能为空');
      return;
    }
    onUpdateAnnotation(book.id, editingAnnotation.id, editContent.trim());
    setEditingAnnotation(null);
    setEditContent('');
    toast.success('批注已更新');
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    onDeleteAnnotation(book.id, annotationId);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadFile) {
      onUploadFile(book.id, file);
    }
  };

  const handleDeleteFile = async () => {
    if (onDeleteFile) {
      try {
        await onDeleteFile(book.id);
        toast.success('文件已删除');
      } catch (error) {
        toast.error('删除文件失败');
      }
    }
  };

  const progressPercent =
    book.totalPages && book.currentPage ? Math.round((book.currentPage / book.totalPages) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1 truncate">{book.title}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Edit2 className="h-4 w-4 mr-2" />
              编辑信息
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="text-destructive" 
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除书籍
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Book Info Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Cover */}
            <div className="flex-shrink-0 relative group">
              {book.coverUrl ? (
                <>
                  <img src={book.coverUrl} alt={book.title} className="w-28 h-40 object-cover rounded-lg bg-muted" />
                  <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:text-white hover:bg-white/20"
                      onClick={() => coverInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:text-white hover:bg-white/20"
                      onClick={handleDeleteCover}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div
                  className="w-28 h-40 rounded-lg bg-gradient-to-br from-muted to-muted/50 flex flex-col items-center justify-center cursor-pointer hover:from-muted/80 hover:to-muted/30 transition-colors border-2 border-dashed border-muted-foreground/30"
                  onClick={() => coverInputRef.current?.click()}
                >
                  <ImageIcon className="h-10 w-10 text-muted-foreground/50 mb-2" />
                  <span className="text-xs text-muted-foreground/70">点击添加封面</span>
                </div>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverUpload}
              />
            </div>

            {/* Info */}
            <div className="flex-1 space-y-2">
              <div>
                <h2 className="font-semibold text-lg">{book.title}</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <User className="h-3 w-3" />
                  {book.author}
                </p>
              </div>

              {category && (
                <Badge variant="outline" style={{ borderColor: category.color, color: category.color }}>
                  {category.name}
                </Badge>
              )}

              {/* Status Selector */}
              <Select
                value={book.status}
                onValueChange={(value) => {
                  onUpdate(book.id, {
                    status: value as ReadingStatus,
                    completedAt: value === 'completed' ? new Date().toISOString() : undefined,
                  });
                  toast.success('状态已更新');
                }}
              >
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Rating */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => onUpdate(book.id, { rating: star })} className="p-0.5">
                    <Star
                      className={`h-5 w-5 ${
                        (book.rating || 0) >= star ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* File Section */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">文件</span>
              {hasFile ? (
                <div className="flex gap-2">
                  {book.fileType === 'txt' && onReadText && (
                    <Button size="sm" variant="outline" onClick={onReadText}>
                      <Eye className="h-4 w-4 mr-1" />
                      阅读
                    </Button>
                  )}
                  {book.fileType && book.fileType !== 'txt' && isReadableFile(book.fileType) && onReadPDF && (
                    <Button size="sm" variant="outline" onClick={onReadPDF}>
                      <Eye className="h-4 w-4 mr-1" />
                      阅读
                    </Button>
                  )}
                  {onDeleteFile && (
                    <Button size="sm" variant="outline" className="text-destructive" onClick={handleDeleteFile}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      删除
                    </Button>
                  )}
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" />
                  上传文件
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
            />
            {hasFile && (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <span className="text-lg">{book.fileType ? getFileTypeIcon(book.fileType) : '📎'}</span>
                <span>{book.fileName || '已上传文件'}</span>
                {book.fileType && (
                  <Badge variant="secondary" className="text-xs">
                    {getFileTypeLabel(book.fileType)}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Progress */}
          {book.totalPages && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">阅读进度</span>
                <span className="text-sm text-muted-foreground">
                  {book.currentPage || 0} / {book.totalPages} 页 ({progressPercent}%)
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="flex gap-2 mt-3">
                <Input
                  type="number"
                  placeholder="当前页码"
                  value={book.currentPage || ''}
                  onChange={(e) =>
                    onUpdate(book.id, {
                      currentPage: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-28"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onUpdate(book.id, {
                      currentPage: book.totalPages,
                      status: 'completed',
                      completedAt: new Date().toISOString(),
                    })
                  }
                >
                  标记读完
                </Button>
              </div>
            </div>
          )}

          {/* Description */}
          {book.description && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{book.description}</p>
            </div>
          )}

          {/* Tags */}
          {book.tags.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex flex-wrap gap-2">
                {book.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="mt-4 pt-4 border-t flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              添加于 {new Date(book.createdAt).toLocaleDateString()}
            </span>
            {book.completedAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                完成于 {new Date(book.completedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Annotations Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            批注 ({book.annotations.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Annotation */}
          <div className="space-y-2">
            <Textarea
              placeholder="添加新的批注..."
              value={newAnnotation}
              onChange={(e) => setNewAnnotation(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="页码（可选）"
                value={newAnnotationPage}
                onChange={(e) => setNewAnnotationPage(e.target.value)}
                className="w-32"
              />
              <Button onClick={handleAddAnnotation} disabled={!newAnnotation.trim()} className="gap-2">
                <Plus className="h-4 w-4" />
                添加批注
              </Button>
            </div>
          </div>

          {/* Annotations List */}
          {book.annotations.length > 0 ? (
            <div className="space-y-3">
              {book.annotations.map((annotation) => (
                <div key={annotation.id} className="p-3 bg-muted rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {editingAnnotation?.id === annotation.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleUpdateAnnotation}>
                              保存
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingAnnotation(null);
                                setEditContent('');
                              }}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm whitespace-pre-wrap">{annotation.content}</p>
                          {annotation.page && (
                            <p className="text-xs text-muted-foreground mt-1">第 {annotation.page} 页</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(annotation.createdAt).toLocaleString()}
                          </p>
                        </>
                      )}
                    </div>
                    {editingAnnotation?.id !== annotation.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingAnnotation(annotation);
                              setEditContent(annotation.content);
                            }}
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteAnnotation(annotation.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">暂无批注，添加第一条笔记吧</p>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑书籍信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>书名 <span className="text-red-500">*</span></Label>
              <Input 
                value={editForm.title} 
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} 
                placeholder="输入书名"
              />
            </div>
            <div className="space-y-2">
              <Label>作者</Label>
              <Input 
                value={editForm.author} 
                onChange={(e) => setEditForm({ ...editForm, author: e.target.value })} 
                placeholder="输入作者"
              />
            </div>
            <div className="space-y-2">
              <Label>简介</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
                placeholder="书籍简介（可选）"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>总页数</Label>
                <Input
                  type="number"
                  value={editForm.totalPages}
                  onChange={(e) => setEditForm({ ...editForm, totalPages: e.target.value })}
                  placeholder="可选"
                />
              </div>
              <div className="space-y-2">
                <Label>当前页</Label>
                <Input
                  type="number"
                  value={editForm.currentPage}
                  onChange={(e) => setEditForm({ ...editForm, currentPage: e.target.value })}
                  placeholder="可选"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              取消
            </Button>
            <Button onClick={handleSaveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除《{book.title}》吗？此操作不可撤销，所有批注和PDF文件也将被删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
