import { BookOpen, CheckCircle, MessageSquare, PlayCircle, FolderKanban, ClipboardList, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Category } from '@/types';

interface Stats {
  total: number;
  completed: number;
  reading: number;
  unread: number;
  totalAnnotations: number;
  categoryStats: (Category & { count: number })[];
  typeStats?: {
    book: number;
    paper: number;
    article: number;
    other: number;
  };
  projectCount: number;
  noteCount: number;
  pendingNotes: number;
}

interface StatsPanelProps {
  stats: Stats;
}

export function StatsPanel({ stats }: StatsPanelProps) {
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">阅读统计</h2>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">总书籍</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completed}</p>
                <p className="text-xs text-muted-foreground">已读完</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <PlayCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.reading}</p>
                <p className="text-xs text-muted-foreground">阅读中</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MessageSquare className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalAnnotations}</p>
                <p className="text-xs text-muted-foreground">批注数</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Other Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <FolderKanban className="h-5 w-5 mx-auto text-orange-500 mb-2" />
            <p className="text-xl font-bold">{stats.projectCount}</p>
            <p className="text-xs text-muted-foreground">项目</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ClipboardList className="h-5 w-5 mx-auto text-yellow-500 mb-2" />
            <p className="text-xl font-bold">{stats.pendingNotes}</p>
            <p className="text-xs text-muted-foreground">待办</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CalendarDays className="h-5 w-5 mx-auto text-cyan-500 mb-2" />
            <p className="text-xl font-bold">{stats.noteCount}</p>
            <p className="text-xs text-muted-foreground">笔记</p>
          </CardContent>
        </Card>
      </div>

      {/* Completion Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">完成率</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{completionRate}%</span>
              <span className="text-muted-foreground">
                {stats.completed} / {stats.total}
              </span>
            </div>
            <Progress value={completionRate} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Category Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">分类分布</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.categoryStats
              .filter((cat) => cat.count > 0)
              .sort((a, b) => b.count - a.count)
              .map((cat) => (
                <div key={cat.id} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm flex-1">{cat.name}</span>
                  <span className="text-sm font-medium">{cat.count}</span>
                </div>
              ))}
            {stats.categoryStats.filter((cat) => cat.count > 0).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">暂无数据</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">类型分布</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.typeStats ? (
              [
                { key: 'book', label: '书籍', count: stats.typeStats.book },
                { key: 'paper', label: '论文', count: stats.typeStats.paper },
                { key: 'article', label: '文章', count: stats.typeStats.article },
                { key: 'other', label: '其他', count: stats.typeStats.other },
              ]
                .filter((item) => item.count > 0)
                .map((item) => (
                  <div key={item.key} className="flex items-center gap-3">
                    <span className="text-sm flex-1">{item.label}</span>
                    <span className="text-sm font-medium">{item.count}</span>
                  </div>
                ))
            ) : null}
            {(!stats.typeStats || stats.total === 0) && <p className="text-sm text-muted-foreground text-center py-2">暂无数据</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
