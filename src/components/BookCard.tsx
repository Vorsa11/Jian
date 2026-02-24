import { BookOpen, MoreVertical, Star, MessageSquare, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { Book, Category } from '@/types';

interface BookCardProps {
  book: Book;
  category?: Category;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const statusLabels = {
  unread: '未读',
  reading: '阅读中',
  completed: '已读完',
};

const statusColors = {
  unread: 'bg-slate-100 text-slate-700',
  reading: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
};

const typeLabels = {
  book: '书籍',
  paper: '论文',
  article: '文章',
  other: '其他',
};

export function BookCard({ book, category, onClick, onEdit, onDelete }: BookCardProps) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Cover */}
          <div className="flex-shrink-0">
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={book.title}
                className="w-20 h-28 object-cover rounded-md bg-muted"
              />
            ) : (
              <div className="w-20 h-28 rounded-md bg-muted flex items-center justify-center relative">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
                {book.fileId && (
                  <div className="absolute bottom-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                    <FileText className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm line-clamp-2 flex-1">{book.title}</h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 -mr-2 -mt-1 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
                    编辑
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                  >
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="text-xs text-muted-foreground mt-1">{book.author}</p>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary" className={`text-xs ${statusColors[book.status]}`}>
                {statusLabels[book.status]}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {typeLabels[book.type]}
              </Badge>
              {category && (
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{ borderColor: category.color, color: category.color }}
                >
                  {category.name}
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1">
                {book.rating ? (
                  <>
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs">{book.rating}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">未评分</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                {book.fileId && (
                  <FileText className="h-3 w-3 text-primary" />
                )}
                <div className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  <span className="text-xs">{book.annotations.length}</span>
                </div>
              </div>
            </div>

            {book.currentPage && book.totalPages && (
              <div className="mt-2">
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(book.currentPage / book.totalPages) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {book.currentPage} / {book.totalPages} 页
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
