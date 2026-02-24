import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookCard } from './BookCard';
import type { Book, Category, FilterCriteria, ReadingStatus, BookType } from '@/types';

interface BookListProps {
  books: Book[];
  categories: Category[];
  filter: FilterCriteria;
  onFilterChange: (filter: Partial<FilterCriteria>) => void;
  onBookClick: (book: Book) => void;
  allTags: string[];
  onEditBook?: (book: Book) => void;
  onDeleteBook?: (bookId: string) => void;
}

const statusOptions: { value: ReadingStatus; label: string }[] = [
  { value: 'unread', label: '未读' },
  { value: 'reading', label: '阅读中' },
  { value: 'completed', label: '已读完' },
];

const typeOptions: { value: BookType; label: string }[] = [
  { value: 'book', label: '书籍' },
  { value: 'paper', label: '论文' },
  { value: 'article', label: '文章' },
  { value: 'other', label: '其他' },
];

export function BookList({
  books,
  categories,
  filter,
  onFilterChange,
  onBookClick,
  allTags,
  onEditBook,
  onDeleteBook,
}: BookListProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const getCategory = (categoryId: string) => categories.find(c => c.id === categoryId);

  const hasActiveFilters =
    filter.categoryId || filter.status || filter.type || (filter.tags && filter.tags.length > 0);

  const clearFilters = () => {
    onFilterChange({
      categoryId: undefined,
      status: undefined,
      type: undefined,
      tags: undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-2">
        <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              筛选
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1">
                 !
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>筛选条件</SheetTitle>
            </SheetHeader>
            <div className="space-y-6 py-6">
              {/* Category Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">分类</label>
                <Select
                  value={filter.categoryId || 'all'}
                  onValueChange={(value) =>
                    onFilterChange({ categoryId: value === 'all' ? undefined : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部分类</SelectItem>
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

              {/* Status Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">阅读状态</label>
                <Select
                  value={filter.status || 'all'}
                  onValueChange={(value) =>
                    onFilterChange({ status: value === 'all' ? undefined : (value as ReadingStatus) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">类型</label>
                <Select
                  value={filter.type || 'all'}
                  onValueChange={(value) =>
                    onFilterChange({ type: value === 'all' ? undefined : (value as BookType) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    {typeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags Filter */}
              {allTags.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">标签</label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={filter.tags?.includes(tag) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const currentTags = filter.tags || [];
                          const newTags = currentTags.includes(tag)
                            ? currentTags.filter((t) => t !== tag)
                            : [...currentTags, tag];
                          onFilterChange({ tags: newTags.length > 0 ? newTags : undefined });
                        }}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {hasActiveFilters && (
                <Button variant="outline" className="w-full" onClick={clearFilters}>
                  清除筛选
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Active Filter Tags */}
        {filter.categoryId && (
          <Badge variant="secondary" className="gap-1">
            {getCategory(filter.categoryId)?.name}
            <X
              className="h-3 w-3 cursor-pointer"
              onClick={() => onFilterChange({ categoryId: undefined })}
            />
          </Badge>
        )}
        {filter.status && (
          <Badge variant="secondary" className="gap-1">
            {statusOptions.find((o) => o.value === filter.status)?.label}
            <X
              className="h-3 w-3 cursor-pointer"
              onClick={() => onFilterChange({ status: undefined })}
            />
          </Badge>
        )}
        {filter.type && (
          <Badge variant="secondary" className="gap-1">
            {typeOptions.find((o) => o.value === filter.type)?.label}
            <X
              className="h-3 w-3 cursor-pointer"
              onClick={() => onFilterChange({ type: undefined })}
            />
          </Badge>
        )}
      </div>

      {/* Results Count */}
      <div className="text-sm text-muted-foreground">
        共 {books.length} 本书籍
      </div>

      {/* Book Grid */}
      {books.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              category={getCategory(book.categoryId)}
              onClick={() => onBookClick(book)}
              onEdit={() => onEditBook?.(book)}
              onDelete={() => onDeleteBook?.(book.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">没有找到匹配的书籍</p>
          {hasActiveFilters && (
            <Button variant="link" onClick={clearFilters}>
              清除筛选条件
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
