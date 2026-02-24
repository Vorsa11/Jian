import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Edit2,
  Download,
  Upload,
  Code2,
  FileCode,
  Settings,
  ChevronLeft,
  X,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
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
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

interface CodeProject {
  id: string;
  name: string;
  description: string;
  language: string;
  code: string;
  createdAt: number;
  updatedAt: number;
}

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript', icon: 'JS' },
  { value: 'typescript', label: 'TypeScript', icon: 'TS' },
  { value: 'python', label: 'Python', icon: 'PY' },
  { value: 'java', label: 'Java', icon: 'JV' },
  { value: 'cpp', label: 'C++', icon: 'C++' },
  { value: 'c', label: 'C', icon: 'C' },
  { value: 'html', label: 'HTML', icon: 'HT' },
  { value: 'css', label: 'CSS', icon: 'CS' },
  { value: 'sql', label: 'SQL', icon: 'SQ' },
  { value: 'rust', label: 'Rust', icon: 'RS' },
  { value: 'go', label: 'Go', icon: 'GO' },
  { value: 'other', label: '其他', icon: '..' },
];

const THEMES = [
  { name: '深色', bg: '#1e1e1e', text: '#d4d4d4', sidebar: '#252526', accent: '#007acc' },
  { name: '浅色', bg: '#ffffff', text: '#333333', sidebar: '#f3f3f3', accent: '#0078d4' },
  { name: '护眼', bg: '#c7edcc', text: '#2d5a27', sidebar: '#d4edda', accent: '#28a745' },
  { name: '深夜', bg: '#0d1117', text: '#c9d1d9', sidebar: '#161b22', accent: '#58a6ff' },
];

// Load projects from localStorage
function loadProjects(): CodeProject[] {
  try {
    const saved = localStorage.getItem('coding-projects');
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

// Save projects to localStorage
function saveProjects(projects: CodeProject[]) {
  try {
    localStorage.setItem('coding-projects', JSON.stringify(projects));
  } catch {}
}

export function CodingPanel() {
  const [projects, setProjects] = useState<CodeProject[]>(loadProjects());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<CodeProject | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [theme, setTheme] = useState(0);
  const [fontSize, setFontSize] = useState(14);
  const [showSettings, setShowSettings] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    language: 'javascript',
    code: '',
  });

  const currentTheme = THEMES[theme];
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Save projects when changed
  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      p.language.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  // Group by language
  const projectsByLanguage = useMemo(() => {
    const grouped: Record<string, CodeProject[]> = {};
    filteredProjects.forEach(p => {
      if (!grouped[p.language]) grouped[p.language] = [];
      grouped[p.language].push(p);
    });
    return grouped;
  }, [filteredProjects]);

  const handleAddProject = () => {
    if (!formData.name.trim()) {
      toast.error('请输入项目名称');
      return;
    }

    const newProject: CodeProject = {
      id: Date.now().toString(),
      name: formData.name,
      description: formData.description,
      language: formData.language,
      code: formData.code,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setProjects([newProject, ...projects]);
    setFormData({ name: '', description: '', language: 'javascript', code: '' });
    setIsAddDialogOpen(false);
    toast.success('项目创建成功');
  };

  const handleEditProject = () => {
    if (!selectedProject || !formData.name.trim()) return;

    setProjects(projects.map(p => 
      p.id === selectedProject.id 
        ? { ...p, ...formData, updatedAt: Date.now() }
        : p
    ));
    
    setSelectedProject({ ...selectedProject, ...formData, updatedAt: Date.now() });
    setIsEditDialogOpen(false);
    toast.success('项目更新成功');
  };

  const handleDeleteProject = (id: string) => {
    setProjects(projects.filter(p => p.id !== id));
    if (selectedProject?.id === id) {
      setSelectedProject(null);
    }
    toast.success('项目删除成功');
  };

  const openEditDialog = () => {
    if (!selectedProject) return;
    setFormData({
      name: selectedProject.name,
      description: selectedProject.description,
      language: selectedProject.language,
      code: selectedProject.code,
    });
    setIsEditDialogOpen(true);
  };

  const openAddDialog = () => {
    setFormData({ name: '', description: '', language: 'javascript', code: '' });
    setIsAddDialogOpen(true);
  };

  const handleExport = (project: CodeProject) => {
    const blob = new Blob([project.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.${getFileExtension(project.language)}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('导出成功');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const code = event.target?.result as string;
      const language = detectLanguage(file.name);
      
      setFormData({
        name: file.name.replace(/\.[^/.]+$/, ''),
        description: `从 ${file.name} 导入`,
        language,
        code,
      });
      setIsAddDialogOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getFileExtension = (language: string): string => {
    const extMap: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      html: 'html',
      css: 'css',
      sql: 'sql',
      rust: 'rs',
      go: 'go',
    };
    return extMap[language] || 'txt';
  };

  const detectLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      html: 'html',
      htm: 'html',
      css: 'css',
      sql: 'sql',
      rs: 'rust',
      go: 'go',
    };
    return langMap[ext] || 'other';
  };

  const getLanguageLabel = (value: string) => {
    return LANGUAGES.find(l => l.value === value)?.label || value;
  };

  const getLanguageIcon = (value: string) => {
    return LANGUAGES.find(l => l.value === value)?.icon || '..';
  };

  // Immersive mode
  if (isImmersive && selectedProject) {
    return (
      <div 
        className="fixed inset-0 z-[100] flex flex-col"
        style={{ backgroundColor: currentTheme.bg }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ backgroundColor: currentTheme.sidebar, borderColor: `${currentTheme.text}15` }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsImmersive(false)}
              className="w-8 h-8 rounded flex items-center justify-center transition-colors"
              style={{ 
                backgroundColor: `${currentTheme.text}15`,
                color: currentTheme.text 
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="font-medium" style={{ color: currentTheme.text }}>{selectedProject.name}</p>
              <p className="text-xs opacity-60" style={{ color: currentTheme.text }}>
                {getLanguageLabel(selectedProject.language)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 rounded flex items-center justify-center transition-colors"
              style={{ 
                backgroundColor: `${currentTheme.text}15`,
                color: currentTheme.text 
              }}
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsImmersive(false)}
              className="w-8 h-8 rounded flex items-center justify-center transition-colors"
              style={{ 
                backgroundColor: `${currentTheme.text}15`,
                color: currentTheme.text 
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Code Editor */}
        <div className="flex-1 flex">
          <textarea
            ref={textareaRef}
            value={selectedProject.code}
            onChange={(e) => {
              const newCode = e.target.value;
              setSelectedProject({ ...selectedProject, code: newCode });
              setProjects(projects.map(p => 
                p.id === selectedProject.id 
                  ? { ...p, code: newCode, updatedAt: Date.now() }
                  : p
              ));
            }}
            className="flex-1 w-full h-full p-4 resize-none outline-none font-mono"
            style={{ 
              backgroundColor: currentTheme.bg,
              color: currentTheme.text,
              fontSize: `${fontSize}px`,
              lineHeight: '1.6',
            }}
            spellCheck={false}
          />
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div 
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
            onClick={() => setShowSettings(false)}
          >
            <div 
              className="w-full max-w-sm rounded-lg p-4 shadow-xl"
              style={{ backgroundColor: currentTheme.sidebar }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold" style={{ color: currentTheme.text }}>编辑器设置</h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-8 h-8 rounded flex items-center justify-center"
                  style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label style={{ color: currentTheme.text }}>主题</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {THEMES.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => setTheme(i)}
                        className={`p-2 rounded text-xs transition-all ${
                          theme === i ? 'ring-2 ring-primary' : ''
                        }`}
                        style={{ 
                          backgroundColor: t.bg,
                          color: t.text,
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label style={{ color: currentTheme.text }}>字体大小</Label>
                    <span className="text-sm" style={{ color: currentTheme.text }}>{fontSize}px</span>
                  </div>
                  <Slider 
                    value={[fontSize]} 
                    onValueChange={(v) => setFontSize(v[0])} 
                    min={10} 
                    max={24} 
                    step={1} 
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Project selected - show editor
  if (selectedProject) {
    return (
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedProject(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              返回
            </Button>
            <span className="text-sm font-medium">{selectedProject.name}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
              {getLanguageLabel(selectedProject.language)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setIsImmersive(true)} title="沉浸模式">
              <Monitor className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={openEditDialog} title="编辑信息">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleExport(selectedProject)} title="导出">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDeleteProject(selectedProject.id)} title="删除" className="text-red-500">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Code Editor */}
        <textarea
          value={selectedProject.code}
          onChange={(e) => {
            const newCode = e.target.value;
            setSelectedProject({ ...selectedProject, code: newCode });
            setProjects(projects.map(p => 
              p.id === selectedProject.id 
                ? { ...p, code: newCode, updatedAt: Date.now() }
                : p
            ));
          }}
          className="flex-1 w-full p-4 resize-none outline-none font-mono text-sm"
          style={{ 
            lineHeight: '1.6',
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
          }}
          placeholder="在此输入代码..."
          spellCheck={false}
        />
      </div>
    );
  }

  // Project list view
  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">代码项目</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="import-file" className="cursor-pointer">
            <div className="flex items-center gap-1 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 transition-colors text-sm">
              <Upload className="h-4 w-4" />
              导入
            </div>
            <Input
              id="import-file"
              type="file"
              accept=".js,.ts,.py,.java,.cpp,.c,.html,.css,.sql,.rs,.go,.txt"
              className="hidden"
              onChange={handleImport}
            />
          </Label>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索项目..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Projects List */}
      {projects.length === 0 ? (
        <div className="text-center py-12">
          <Code2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-2">还没有代码项目</p>
          <p className="text-sm text-muted-foreground">点击右上角按钮创建新项目</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">没有找到匹配的项目</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(projectsByLanguage).map(([language, langProjects]) => (
            <div key={language}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-primary/10 text-primary text-xs flex items-center justify-center font-mono">
                  {getLanguageIcon(language)}
                </span>
                {getLanguageLabel(language)}
                <span className="text-xs">({langProjects.length})</span>
              </h3>
              <div className="grid gap-2">
                {langProjects.map(project => (
                  <Card 
                    key={project.id} 
                    className="cursor-pointer hover:border-primary/50 transition-colors group"
                    onClick={() => setSelectedProject(project)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileCode className="h-4 w-4 text-primary" />
                            <p className="font-medium truncate">{project.name}</p>
                          </div>
                          {project.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {project.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            更新于 {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 opacity-0 group-hover:opacity-100"
                              onClick={e => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProject(project);
                              setIsImmersive(true);
                            }}>
                              <Monitor className="h-4 w-4 mr-2" />
                              沉浸模式
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProject(project);
                              openEditDialog();
                            }}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleExport(project);
                            }}>
                              <Download className="h-4 w-4 mr-2" />
                              导出
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProject(project.id);
                              }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isAddDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddDialogOpen(false);
          setIsEditDialogOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditDialogOpen ? '编辑项目' : '新建项目'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>项目名称</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：我的算法库"
              />
            </div>
            <div className="space-y-2">
              <Label>描述（可选）</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="项目的简要描述..."
              />
            </div>
            <div className="space-y-2">
              <Label>编程语言</Label>
              <div className="grid grid-cols-4 gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => setFormData({ ...formData, language: lang.value })}
                    className={`p-2 rounded text-xs transition-all ${
                      formData.language === lang.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>初始代码（可选）</Label>
              <Textarea
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="可以在此输入初始代码..."
                rows={5}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddDialogOpen(false);
              setIsEditDialogOpen(false);
            }}>
              取消
            </Button>
            <Button onClick={isEditDialogOpen ? handleEditProject : handleAddProject}>
              {isEditDialogOpen ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
