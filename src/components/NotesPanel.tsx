import { useState, useMemo } from 'react';
import { Plus, Calendar, Clock, Trash2, Edit2, FileText, Lightbulb, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import type { Note, NoteType, NotePriority } from '@/types';

interface NotesPanelProps {
  notes: Note[];
  onAddNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'completed' | 'completedAt'>) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onDeleteNote: (id: string) => void;
  onToggleComplete: (id: string) => void;
}

const priorityLabels: Record<NotePriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

const priorityColors: Record<NotePriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};



export function NotesPanel({
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onToggleComplete,
}: NotesPanelProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'todo' as NoteType,
    priority: 'medium' as NotePriority,
    dueDate: '',
    dueTime: '',
    tags: [] as string[],
    newTag: '',
  });

  const filteredNotes = useMemo(() => {
    switch (activeTab) {
      case 'todo':
        return notes.filter((n) => n.type === 'todo');
      case 'note':
        return notes.filter((n) => n.type === 'note');
      case 'schedule':
        return notes.filter((n) => n.type === 'schedule');
      default:
        return notes;
    }
  }, [notes, activeTab]);

  const pendingTodos = useMemo(() => notes.filter((n) => n.type === 'todo' && !n.completed), [notes]);
  const recentNotes = useMemo(() => notes.filter((n) => n.type === 'note').slice(0, 5), [notes]);
  const upcomingSchedules = useMemo(() => {
    const now = new Date();
    return notes
      .filter((n) => n.type === 'schedule' && n.dueDate && new Date(n.dueDate) >= now)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 5);
  }, [notes]);

  const handleAdd = () => {
    if (!formData.title.trim()) {
      toast.error('请输入标题');
      return;
    }
    onAddNote({
      title: formData.title.trim(),
      content: formData.content.trim(),
      type: formData.type,
      priority: formData.priority,
      dueDate: formData.dueDate || undefined,
      dueTime: formData.dueTime || undefined,
      tags: formData.tags,
    });
    resetForm();
    setIsAddOpen(false);
    toast.success('已添加');
  };

  const handleEdit = () => {
    if (!editingNote || !formData.title.trim()) return;
    onUpdateNote(editingNote.id, {
      title: formData.title.trim(),
      content: formData.content.trim(),
      type: formData.type,
      priority: formData.priority,
      dueDate: formData.dueDate || undefined,
      dueTime: formData.dueTime || undefined,
      tags: formData.tags,
    });
    setIsEditOpen(false);
    setEditingNote(null);
    toast.success('已更新');
  };

  const openEdit = (note: Note) => {
    setEditingNote(note);
    setFormData({
      title: note.title,
      content: note.content,
      type: note.type,
      priority: note.priority,
      dueDate: note.dueDate || '',
      dueTime: note.dueTime || '',
      tags: note.tags,
      newTag: '',
    });
    setIsEditOpen(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      type: 'todo',
      priority: 'medium',
      dueDate: '',
      dueTime: '',
      tags: [],
      newTag: '',
    });
  };

  const renderNoteCard = (note: Note) => (
    <Card key={note.id} className={`${note.completed ? 'opacity-60' : ''} transition-all hover:shadow-md`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {note.type === 'todo' && (
            <Checkbox
              checked={note.completed}
              onCheckedChange={() => onToggleComplete(note.id)}
              className="mt-1"
            />
          )}
          {note.type === 'note' && <FileText className="h-5 w-5 text-blue-500 mt-0.5" />}
          {note.type === 'schedule' && <Calendar className="h-5 w-5 text-green-500 mt-0.5" />}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className={`font-medium ${note.completed ? 'line-through text-muted-foreground' : ''}`}>
                {note.title}
              </h4>
              <Badge className={priorityColors[note.priority]}>{priorityLabels[note.priority]}</Badge>
            </div>
            
            {note.content && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{note.content}</p>
            )}
            
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {(note.dueDate || note.dueTime) && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {note.dueDate && new Date(note.dueDate).toLocaleDateString()}
                  {note.dueTime && ` ${note.dueTime}`}
                </span>
              )}
              {note.tags.length > 0 && (
                <div className="flex gap-1">
                  {note.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><Edit2 className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(note)}><Edit2 className="h-4 w-4 mr-2" />编辑</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDeleteNote(note.id)}>
                <Trash2 className="h-4 w-4 mr-2" />删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-blue-50">
          <CardContent className="p-3 text-center">
            <ListTodo className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-lg font-bold">{pendingTodos.length}</p>
            <p className="text-xs text-muted-foreground">待办</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50">
          <CardContent className="p-3 text-center">
            <Lightbulb className="h-5 w-5 mx-auto text-yellow-600 mb-1" />
            <p className="text-lg font-bold">{recentNotes.length}</p>
            <p className="text-xs text-muted-foreground">笔记</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardContent className="p-3 text-center">
            <Calendar className="h-5 w-5 mx-auto text-green-600 mb-1" />
            <p className="text-lg font-bold">{upcomingSchedules.length}</p>
            <p className="text-xs text-muted-foreground">日程</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">笔记 & 日程</h2>
        <Button size="sm" onClick={() => setIsAddOpen(true)}><Plus className="h-4 w-4 mr-1" />新建</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="todo">待办</TabsTrigger>
          <TabsTrigger value="note">笔记</TabsTrigger>
          <TabsTrigger value="schedule">日程</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-3 mt-4">
          {filteredNotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>还没有内容</p>
            </div>
          ) : (
            filteredNotes.map(renderNoteCard)
          )}
        </TabsContent>
      </Tabs>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新建</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as NoteType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">待办事项</SelectItem>
                  <SelectItem value="note">空白笔记</SelectItem>
                  <SelectItem value="schedule">日程安排</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>标题</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="输入标题" />
            </div>
            <div className="space-y-2">
              <Label>内容</Label>
              <Textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={3} placeholder="详细内容" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>优先级</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as NotePriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formData.type === 'schedule' || formData.type === 'todo') && (
                <div className="space-y-2">
                  <Label>日期</Label>
                  <Input type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} />
                </div>
              )}
            </div>
            {formData.type === 'schedule' && (
              <div className="space-y-2">
                <Label>时间</Label>
                <Input type="time" value={formData.dueTime} onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>取消</Button>
            <Button onClick={handleAdd}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>编辑</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>内容</Label>
              <Textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>优先级</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as NotePriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>日期</Label>
                <Input type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>取消</Button>
            <Button onClick={handleEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
