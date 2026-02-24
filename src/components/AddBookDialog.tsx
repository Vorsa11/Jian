import { useState } from 'react';
import { BookOpen, FileText, Newspaper, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Book, Category, BookType, ReadingStatus } from '@/types';

interface AddBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onAdd: (book: Omit<Book, 'id' | 'createdAt' | 'updatedAt' | 'annotations'>) => void;
  allTags: string[];
}

const bookTypes: { value: BookType; label: string; icon: React.ReactNode }[] = [
  { value: 'book', label: '书籍', icon: <BookOpen className="h-4 w-4" /> },
  { value: 'paper', label: '论文', icon: <FileText className="h-4 w-4" /> },
  { value: 'article', label: '文章', icon: <Newspaper className="h-4 w-4" /> },
  { value: 'other', label: '其他', icon: <Folder className="h-4 w-4" /> },
];

export function AddBookDialog({
  open,
  onOpenChange,
  categories,
  onAdd,
  allTags,
}: AddBookDialogProps) {
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    description: '',
    type: 'book' as BookType,
    categoryId: categories[0]?.id || '',
    status: 'unread' as ReadingStatus,
    totalPages: '',
    tags: [] as string[],
    newTag: '',
  });

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.author.trim()) {
      toast.error('请填写书名和作者');
      return;
    }

    onAdd({
      title: formData.title.trim(),
      author: formData.author.trim(),
      description: formData.description.trim() || undefined,
      type: formData.type,
      categoryId: formData.categoryId,
      status: formData.status,
      totalPages: formData.totalPages ? parseInt(formData.totalPages) : undefined,
      tags: formData.tags,
      rating: undefined,
      coverUrl: undefined,
      currentPage: undefined,
      completedAt: undefined,
    });

    toast.success('书籍添加成功');
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      author: '',
      description: '',
      type: 'book',
      categoryId: categories[0]?.id || '',
      status: 'unread',
      totalPages: '',
      tags: [],
      newTag: '',
    });
  };

  const handleAddTag = () => {
    if (formData.newTag.trim() && !formData.tags.includes(formData.newTag.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, formData.newTag.trim()],
        newTag: '',
      });
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t) => t !== tag),
    });
  };

  const handleSelectExistingTag = (tag: string) => {
    if (!formData.tags.includes(tag)) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tag],
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加书籍/文献</DialogTitle>
          <DialogDescription>记录你新阅读的书籍或文献</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Type Selection */}
          <div className="space-y-2">
            <Label>类型</Label>
            <div className="grid grid-cols-4 gap-2">
              {bookTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setFormData({ ...formData, type: type.value })}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                    formData.type === type.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {type.icon}
                  <span className="text-xs">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>
              书名/标题 <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="输入书名或标题"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          {/* Author */}
          <div className="space-y-2">
            <Label>
              作者 <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="输入作者姓名"
              value={formData.author}
              onChange={(e) => setFormData({ ...formData, author: e.target.value })}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>分类</Label>
            <Select
              value={formData.categoryId}
              onValueChange={(value) =>
                setFormData({ ...formData, categoryId: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>阅读状态</Label>
            <Select
              value={formData.status}
              onValueChange={(value) =>
                setFormData({ ...formData, status: value as ReadingStatus })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unread">未读</SelectItem>
                <SelectItem value="reading">阅读中</SelectItem>
                <SelectItem value="completed">已读完</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Total Pages */}
          <div className="space-y-2">
            <Label>总页数</Label>
            <Input
              type="number"
              placeholder="可选"
              value={formData.totalPages}
              onChange={(e) =>
                setFormData({ ...formData, totalPages: e.target.value })
              }
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>简介</Label>
            <Textarea
              placeholder="简要描述内容（可选）"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>标签</Label>
            <div className="flex gap-2">
              <Input
                placeholder="添加标签"
                value={formData.newTag}
                onChange={(e) =>
                  setFormData({ ...formData, newTag: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <Button type="button" onClick={handleAddTag} variant="outline">
                添加
              </Button>
            </div>

            {/* Existing Tags */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="text-xs text-muted-foreground mr-1">已有标签:</span>
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={
                      formData.tags.includes(tag) ? 'default' : 'outline'
                    }
                    className="cursor-pointer text-xs"
                    onClick={() => handleSelectExistingTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Selected Tags */}
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
