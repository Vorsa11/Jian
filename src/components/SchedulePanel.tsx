import { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  ListTodo,
  Trash2,
  Edit2,
  BookOpen,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
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
import { toast } from 'sonner';
import type { Note } from '@/types';

interface SchedulePanelProps {
  notes: Note[];
  onAddNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'completed' | 'completedAt'>) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onDeleteNote: (id: string) => void;
  onToggleComplete: (id: string) => void;
}

interface Course {
  id: string;
  name: string;
  location: string;
  day: number; // 0-6, 0 is Sunday
  startTime: string; // "08:00"
  endTime: string; // "09:40"
  color: string;
  weekType: 'all' | 'odd' | 'even'; // 每周、单周、双周
}

const DAYS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

const COURSE_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-800' },
  { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-800' },
  { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-800' },
  { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-800' },
  { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-800' },
  { bg: 'bg-pink-100', border: 'border-pink-300', text: 'text-pink-800' },
  { bg: 'bg-indigo-100', border: 'border-indigo-300', text: 'text-indigo-800' },
  { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800' },
];

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00'
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isSameDate(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Load courses from localStorage
function loadCourses(): Course[] {
  try {
    const saved = localStorage.getItem('schedule-courses');
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

// Save courses to localStorage
function saveCourses(courses: Course[]) {
  try {
    localStorage.setItem('schedule-courses', JSON.stringify(courses));
  } catch {}
}

export function SchedulePanel({
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onToggleComplete,
}: SchedulePanelProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [activeTab, setActiveTab] = useState('calendar');
  
  // Course schedule state
  const [courses, setCourses] = useState<Course[]>(loadCourses());
  const [currentWeek, setCurrentWeek] = useState(1); // 当前周数
  const [isCourseDialogOpen, setIsCourseDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseForm, setCourseForm] = useState({
    name: '',
    location: '',
    day: 1,
    startTime: '08:00',
    endTime: '09:40',
    color: '0',
    weekType: 'all' as 'all' | 'odd' | 'even',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Save courses when changed
  useEffect(() => {
    saveCourses(courses);
  }, [courses]);

  // Calendar data
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInPrevMonth = getDaysInMonth(year, month - 1);

  // Group notes by date
  const notesByDate = useMemo(() => {
    const grouped: Record<string, Note[]> = {};
    notes.forEach(note => {
      if (note.dueDate) {
        const date = new Date(note.dueDate);
        const key = formatDateKey(date);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(note);
      }
    });
    return grouped;
  }, [notes]);

  // Selected date notes
  const selectedDateNotes = useMemo(() => {
    if (!selectedDate) return [];
    const key = formatDateKey(selectedDate);
    return notesByDate[key] || [];
  }, [selectedDate, notesByDate]);

  // Pending notes
  const pendingNotes = useMemo(() => {
    return notes.filter(note => !note.completed && note.type === 'todo');
  }, [notes]);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'todo' as 'todo' | 'note',
    dueDate: '',
    dueTime: '',
  });

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(year, month + direction, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const handleAddNote = () => {
    if (!formData.title.trim()) {
      toast.error('请输入标题');
      return;
    }

    onAddNote({
      title: formData.title,
      content: formData.content,
      type: formData.type,
      dueDate: formData.dueDate || undefined,
      dueTime: formData.dueTime || undefined,
      tags: [],
      priority: 'medium',
    });

    setFormData({ title: '', content: '', type: 'todo', dueDate: '', dueTime: '' });
    setIsAddDialogOpen(false);
    toast.success('添加成功');
  };

  const handleEditNote = () => {
    if (!editingNote || !formData.title.trim()) return;

    onUpdateNote(editingNote.id, {
      title: formData.title,
      content: formData.content,
      type: formData.type as 'todo' | 'note',
      dueDate: formData.dueDate || undefined,
      dueTime: formData.dueTime || undefined,
    });

    setIsEditDialogOpen(false);
    setEditingNote(null);
    toast.success('更新成功');
  };

  const openEditDialog = (note: Note) => {
    setEditingNote(note);
    setFormData({
      title: note.title,
      content: note.content,
      type: (note.type === 'todo' || note.type === 'note') ? note.type : 'todo',
      dueDate: note.dueDate || '',
      dueTime: note.dueTime || '',
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteNote = (id: string) => {
    onDeleteNote(id);
    toast.success('删除成功');
  };

  // Course handlers
  const handleAddCourse = () => {
    if (!courseForm.name.trim()) {
      toast.error('请输入课程名称');
      return;
    }

    const newCourse: Course = {
      id: Date.now().toString(),
      name: courseForm.name,
      location: courseForm.location,
      day: courseForm.day,
      startTime: courseForm.startTime,
      endTime: courseForm.endTime,
      color: courseForm.color,
      weekType: courseForm.weekType,
    };

    setCourses([...courses, newCourse]);
    setCourseForm({ name: '', location: '', day: 1, startTime: '08:00', endTime: '09:40', color: '0', weekType: 'all' });
    setIsCourseDialogOpen(false);
    toast.success('课程添加成功');
  };

  const handleEditCourse = () => {
    if (!editingCourse || !courseForm.name.trim()) return;

    setCourses(courses.map(c => 
      c.id === editingCourse.id 
        ? { ...c, ...courseForm }
        : c
    ));
    setIsCourseDialogOpen(false);
    setEditingCourse(null);
    toast.success('课程更新成功');
  };

  const handleDeleteCourse = (id: string) => {
    setCourses(courses.filter(c => c.id !== id));
    toast.success('课程删除成功');
  };

  const openEditCourseDialog = (course: Course) => {
    setEditingCourse(course);
    setCourseForm({
      name: course.name,
      location: course.location,
      day: course.day,
      startTime: course.startTime,
      endTime: course.endTime,
      color: course.color,
      weekType: course.weekType,
    });
    setIsCourseDialogOpen(true);
  };

  const openAddCourseDialog = () => {
    setEditingCourse(null);
    setCourseForm({ name: '', location: '', day: 1, startTime: '08:00', endTime: '09:40', color: '0', weekType: 'all' });
    setIsCourseDialogOpen(true);
  };

  // Get courses for a specific day and current week
  const getCoursesForDay = (day: number) => {
    return courses
      .filter(c => c.day === day)
      .filter(c => {
        if (c.weekType === 'all') return true;
        if (c.weekType === 'odd') return currentWeek % 2 === 1;
        if (c.weekType === 'even') return currentWeek % 2 === 0;
        return true;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  // Calculate course position in schedule
  const getCourseStyle = (course: Course) => {
    const startIndex = TIME_SLOTS.findIndex(t => t >= course.startTime);
    const endIndex = TIME_SLOTS.findIndex(t => t >= course.endTime);
    const top = startIndex >= 0 ? startIndex * 32 : 0;
    const height = Math.max(32, (endIndex - startIndex) * 32);
    const colorSet = COURSE_COLORS[parseInt(course.color) % COURSE_COLORS.length];
    
    return {
      top: `${top}px`,
      height: `${height}px`,
      colorSet,
    };
  };

  // Render calendar grid
  const renderCalendarGrid = () => {
    const days = [];
    const today = new Date();

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      days.push(
        <div key={`prev-${day}`} className="p-2 text-center text-muted-foreground opacity-50">
          {day}
        </div>
      );
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const key = formatDateKey(date);
      const dayNotes = notesByDate[key] || [];
      const hasNotes = dayNotes.length > 0;
      const isToday = isSameDate(date, today);
      const isSelected = selectedDate && isSameDate(date, selectedDate);

      days.push(
        <button
          key={`current-${day}`}
          onClick={() => setSelectedDate(date)}
          className={`p-2 text-center rounded-lg transition-all relative ${
            isSelected
              ? 'bg-primary text-primary-foreground'
              : isToday
              ? 'bg-primary/20 text-primary font-semibold'
              : 'hover:bg-muted'
          }`}
        >
          <span>{day}</span>
          {hasNotes && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
              {dayNotes.slice(0, 3).map((note, i) => (
                <div
                  key={i}
                  className={`w-1 h-1 rounded-full ${
                    note.completed ? 'bg-green-500' : 'bg-orange-500'
                  }`}
                />
              ))}
            </div>
          )}
        </button>
      );
    }

    // Next month days
    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      days.push(
        <div key={`next-${day}`} className="p-2 text-center text-muted-foreground opacity-50">
          {day}
        </div>
      );
    }

    return days;
  };

  return (
    <div className="space-y-4 pb-20">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="calendar" className="flex items-center gap-1.5">
            <CalendarIcon className="h-4 w-4" />
            日历
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            课程表
          </TabsTrigger>
          <TabsTrigger value="todos" className="flex items-center gap-1.5">
            <ListTodo className="h-4 w-4" />
            待办
          </TabsTrigger>
        </TabsList>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-4">
          {/* Calendar Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-semibold min-w-[120px] text-center">
                {year}年 {MONTHS[month]}
              </span>
              <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToToday}>
              今天
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map(day => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                周{day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {renderCalendarGrid()}
          </div>

          {/* Selected Date Notes */}
          {selectedDate && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">
                    {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日
                  </h3>
                  <Button
                    size="sm"
                    onClick={() => {
                      setFormData({ ...formData, dueDate: formatDateKey(selectedDate) });
                      setIsAddDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    添加
                  </Button>
                </div>
                <div className="space-y-2">
                  {selectedDateNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      暂无事项
                    </p>
                  ) : (
                    selectedDateNotes.map(note => (
                      <div
                        key={note.id}
                        className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted group"
                      >
                        <Checkbox
                          checked={note.completed}
                          onCheckedChange={() => onToggleComplete(note.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${note.completed ? 'line-through text-muted-foreground' : ''}`}>
                            {note.title}
                          </p>
                          {note.dueTime && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {note.dueTime}
                            </p>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(note)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteNote(note.id)} className="text-red-600">
                              <Trash2 className="h-4 w-4 mr-2" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Course Schedule Tab */}
        <TabsContent value="schedule" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">课程表</h2>
              {/* Week Switcher */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <button
                  onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}
                  className="p-1.5 rounded hover:bg-background transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="px-3 py-1 text-sm font-medium min-w-[80px] text-center">
                  第 {currentWeek} 周
                </div>
                <button
                  onClick={() => setCurrentWeek(currentWeek + 1)}
                  className="p-1.5 rounded hover:bg-background transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">
                {currentWeek % 2 === 1 ? '单周' : '双周'}
              </span>
            </div>
            <Button size="sm" onClick={openAddCourseDialog}>
              <Plus className="h-4 w-4 mr-1" />
              添加课程
            </Button>
          </div>

          {/* Weekly Schedule Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header */}
              <div className="grid grid-cols-8 gap-1 mb-1">
                <div className="text-center text-sm font-medium text-muted-foreground py-2">时间</div>
                {WEEKDAYS.map((day) => (
                  <div key={day} className="text-center text-sm font-medium py-2 bg-muted rounded">
                    {day}
                  </div>
                ))}
              </div>

              {/* Time Grid */}
              <div className="grid grid-cols-8 gap-1 relative">
                {/* Time labels */}
                <div className="space-y-0">
                  {TIME_SLOTS.map((time, i) => (
                    <div key={time} className="h-8 text-xs text-muted-foreground text-right pr-2 flex items-center justify-end">
                      {i % 2 === 0 ? time : ''}
                    </div>
                  ))}
                </div>

                {/* Days columns */}
                {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                  <div key={day} className="relative bg-muted/30 rounded min-h-[832px]">
                    {/* Time slot lines */}
                    {TIME_SLOTS.map((_, i) => (
                      <div
                        key={i}
                        className="h-8 border-b border-dashed border-border/50"
                      />
                    ))}
                    
                    {/* Courses */}
                    {getCoursesForDay(day).map(course => {
                      const style = getCourseStyle(course);
                      const colorSet = style.colorSet;
                      return (
                        <div
                          key={course.id}
                          onClick={() => openEditCourseDialog(course)}
                          className={`absolute left-1 right-1 rounded px-2 py-1 cursor-pointer hover:brightness-95 transition-all border ${colorSet.bg} ${colorSet.border}`}
                          style={{ top: style.top, height: style.height }}
                        >
                          <p className={`text-xs font-medium truncate ${colorSet.text}`}>{course.name}</p>
                          <p className={`text-[10px] truncate ${colorSet.text} opacity-80`}>{course.location}</p>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Course List */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground">课程列表</h3>
            {courses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无课程，点击上方按钮添加</p>
            ) : (
              <div className="space-y-2">
                {courses.map(course => {
                  const colorSet = COURSE_COLORS[parseInt(course.color) % COURSE_COLORS.length];
                  const weekTypeLabel = { all: '每周', odd: '单周', even: '双周' }[course.weekType || 'all'];
                  return (
                    <div
                      key={course.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${colorSet.bg.replace('bg-', 'bg-').replace('100', '400')}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{course.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {weekTypeLabel}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {WEEKDAYS[course.day === 0 ? 6 : course.day - 1]} {course.startTime}-{course.endTime} · {course.location}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCourseDialog(course)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDeleteCourse(course.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Todos Tab */}
        <TabsContent value="todos" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              待办事项
              {pendingNotes.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({pendingNotes.length})
                </span>
              )}
            </h2>
            <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>

          <div className="space-y-2">
            {pendingNotes.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                <p className="text-muted-foreground">太棒了！所有待办都完成了</p>
              </div>
            ) : (
              pendingNotes.map(note => (
                <Card key={note.id} className="group">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={note.completed}
                        onCheckedChange={() => onToggleComplete(note.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{note.title}</p>
                        {note.content && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {note.content}
                          </p>
                        )}
                        {(note.dueDate || note.dueTime) && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {note.dueDate && (
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {note.dueDate}
                              </span>
                            )}
                            {note.dueTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {note.dueTime}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(note)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDeleteNote(note.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Note Dialog */}
      <Dialog open={isAddDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddDialogOpen(false);
          setIsEditDialogOpen(false);
          setEditingNote(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingNote ? '编辑事项' : '添加事项'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="输入标题..."
              />
            </div>
            <div className="space-y-2">
              <Label>内容（可选）</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="输入详细内容..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>日期</Label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>时间（可选）</Label>
                <Input
                  type="time"
                  value={formData.dueTime}
                  onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddDialogOpen(false);
              setIsEditDialogOpen(false);
              setEditingNote(null);
            }}>
              取消
            </Button>
            <Button onClick={editingNote ? handleEditNote : handleAddNote}>
              {editingNote ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Course Dialog */}
      <Dialog open={isCourseDialogOpen} onOpenChange={setIsCourseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCourse ? '编辑课程' : '添加课程'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>课程名称</Label>
              <Input
                value={courseForm.name}
                onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
                placeholder="例如：高等数学"
              />
            </div>
            <div className="space-y-2">
              <Label>上课地点</Label>
              <Input
                value={courseForm.location}
                onChange={(e) => setCourseForm({ ...courseForm, location: e.target.value })}
                placeholder="例如：教学楼 A301"
              />
            </div>
            <div className="space-y-2">
              <Label>星期</Label>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((day, i) => (
                  <button
                    key={day}
                    onClick={() => setCourseForm({ ...courseForm, day: i === 6 ? 0 : i + 1 })}
                    className={`p-2 text-xs rounded transition-colors ${
                      (courseForm.day === 0 ? 6 : courseForm.day - 1) === i
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {day.replace('周', '')}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>开始时间</Label>
                <Input
                  type="time"
                  value={courseForm.startTime}
                  onChange={(e) => setCourseForm({ ...courseForm, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>结束时间</Label>
                <Input
                  type="time"
                  value={courseForm.endTime}
                  onChange={(e) => setCourseForm({ ...courseForm, endTime: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>颜色标记</Label>
              <div className="flex gap-2 flex-wrap">
                {COURSE_COLORS.map((color, i) => (
                  <button
                    key={i}
                    onClick={() => setCourseForm({ ...courseForm, color: i.toString() })}
                    className={`w-8 h-8 rounded-full ${color.bg} border-2 ${color.border} transition-all ${
                      courseForm.color === i.toString() ? 'ring-2 ring-primary ring-offset-2 scale-110' : ''
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>上课周数</Label>
              <div className="flex gap-2">
                {[
                  { value: 'all', label: '每周' },
                  { value: 'odd', label: '单周' },
                  { value: 'even', label: '双周' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCourseForm({ ...courseForm, weekType: option.value as 'all' | 'odd' | 'even' })}
                    className={`flex-1 p-2 text-sm rounded transition-colors ${
                      courseForm.weekType === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            {editingCourse && (
              <Button variant="destructive" onClick={() => {
                handleDeleteCourse(editingCourse.id);
                setIsCourseDialogOpen(false);
                setEditingCourse(null);
              }}>
                删除
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => {
              setIsCourseDialogOpen(false);
              setEditingCourse(null);
            }}>
              取消
            </Button>
            <Button onClick={editingCourse ? handleEditCourse : handleAddCourse}>
              {editingCourse ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
