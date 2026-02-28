import { useState, useRef, useCallback, useEffect } from 'react';
import { BookOpen, Star, MessageSquare, FileText, Edit2, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // 关闭菜单
  const hideMenu = useCallback(() => {
    setMenuVisible(false);
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    if (menuVisible) {
      const handleClick = () => hideMenu();
      // 延迟一点绑定，避免立即触发关闭
      setTimeout(() => {
        document.addEventListener('click', handleClick);
        document.addEventListener('scroll', hideMenu, true);
      }, 100);
      return () => {
        document.removeEventListener('click', handleClick);
        document.removeEventListener('scroll', hideMenu, true);
      };
    }
  }, [menuVisible, hideMenu]);

  // 显示菜单
  const showMenu = useCallback((clientX: number, clientY: number) => {
    // 计算菜单位置，确保不超出视窗
    const menuWidth = 120;
    const menuHeight = 80;
    const x = Math.min(clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(clientY, window.innerHeight - menuHeight - 10);
    
    setMenuPosition({ x, y });
    setMenuVisible(true);
  }, []);

  // 处理右键菜单（桌面端）
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY);
  }, [showMenu]);

  // 处理长按（移动端）
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isLongPress.current = false;
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      showMenu(touch.clientX, touch.clientY);
    }, 600); // 600ms 长按触发，稍微长一点避免误触
  }, [showMenu]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // 如果是长按，阻止后续的点击事件
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    // 移动手指取消长按
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // 处理编辑
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    hideMenu();
    onEdit?.();
  };

  // 处理删除
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    hideMenu();
    onDelete?.();
  };

  // 处理卡片点击（排除长按情况）
  const handleCardClick = useCallback(() => {
    if (!isLongPress.current && !menuVisible) {
      onClick();
    }
  }, [onClick, menuVisible]);

  return (
    <>
      <Card 
        ref={cardRef}
        className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden select-none relative" 
        onClick={handleCardClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        style={{ 
          WebkitTouchCallout: 'none', 
          WebkitUserSelect: 'none',
          touchAction: 'manipulation'
        }}
      >
        <CardContent className="p-4">
          <div className="flex gap-3">
            {/* Cover */}
            <div className="flex-shrink-0 pointer-events-none">
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
            <div className="flex-1 min-w-0 pointer-events-none">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm line-clamp-2 flex-1">{book.title}</h3>
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

      {/* 右键/长按菜单 - 使用固定定位的 div，不用 DropdownMenu */}
      {menuVisible && (
        <div
          className="fixed z-50 bg-popover border rounded-md shadow-md py-1 min-w-[120px]"
          style={{
            left: menuPosition.x,
            top: menuPosition.y,
          }}
          onClick={(e) => e.stopPropagation()} // 阻止点击菜单时关闭
        >
          <button
            className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
            onClick={handleEdit}
          >
            <Edit2 className="h-4 w-4" />
            编辑
          </button>
          <button
            className="w-full px-3 py-2 text-sm text-left hover:bg-accent text-destructive flex items-center gap-2"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        </div>
      )}
    </>
  );
}