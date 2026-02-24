import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Edit3,
  Download,
  Upload,
  Code2,
  FileCode,
  Settings,
  ChevronLeft,
  X,
  Monitor,
  Save,
  FileText,
  Maximize2,
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
  { value: 'javascript', label: 'JavaScript', icon: 'JS', color: '#f7df1e' },
  { value: 'typescript', label: 'TypeScript', icon: 'TS', color: '#3178c6' },
  { value: 'python', label: 'Python', icon: 'PY', color: '#3776ab' },
  { value: 'java', label: 'Java', icon: 'JV', color: '#b07219' },
  { value: 'cpp', label: 'C++', icon: 'C++', color: '#f34b7d' },
  { value: 'c', label: 'C', icon: 'C', color: '#555555' },
  { value: 'html', label: 'HTML', icon: 'HT', color: '#e34c26' },
  { value: 'css', label: 'CSS', icon: 'CS', color: '#563d7c' },
  { value: 'sql', label: 'SQL', icon: 'SQ', color: '#336791' },
  { value: 'rust', label: 'Rust', icon: 'RS', color: '#dea584' },
  { value: 'go', label: 'Go', icon: 'GO', color: '#00add8' },
  { value: 'other', label: '其他', icon: '..', color: '#888888' },
];

const THEMES = [
  { 
    name: 'Darcula', 
    bg: '#2b2b2b', 
    sidebar: '#3c3f41', 
    text: '#a9b7c6', 
    keyword: '#cc7832',
    string: '#6a8759',
    comment: '#808080',
    number: '#6897bb',
    function: '#ffc66d',
    lineNumber: '#606366',
    selection: '#214283',
  },
  { 
    name: 'Light', 
    bg: '#ffffff', 
    sidebar: '#f5f5f5', 
    text: '#000000', 
    keyword: '#000080',
    string: '#008000',
    comment: '#808080',
    number: '#0000ff',
    function: '#795e26',
    lineNumber: '#237893',
    selection: '#add6ff',
  },
  { 
    name: 'Monokai', 
    bg: '#272822', 
    sidebar: '#3e3d32', 
    text: '#f8f8f2', 
    keyword: '#f92672',
    string: '#e6db74',
    comment: '#75715e',
    number: '#ae81ff',
    function: '#a6e22e',
    lineNumber: '#90908a',
    selection: '#49483e',
  },
  { 
    name: 'Oceanic', 
    bg: '#1e2b35', 
    sidebar: '#263740', 
    text: '#d8dee9', 
    keyword: '#c695c6',
    string: '#99c794',
    comment: '#65737e',
    number: '#f99157',
    function: '#6699cc',
    lineNumber: '#5f7885',
    selection: '#344a55',
  },
];

function loadProjects(): CodeProject[] {
  try {
    const saved = localStorage.getItem('coding-projects-v2');
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

function saveProjects(projects: CodeProject[]) {
  try {
    localStorage.setItem('coding-projects-v2', JSON.stringify(projects));
  } catch {}
}

function loadEditorSettings(): { theme: number; fontSize: number } {
  try {
    const saved = localStorage.getItem('coding-editor-settings');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { theme: 0, fontSize: 14 };
}

function saveEditorSettings(settings: { theme: number; fontSize: number }) {
  try {
    localStorage.setItem('coding-editor-settings', JSON.stringify(settings));
  } catch {}
}

export function CodingPanel() {
  const [projects, setProjects] = useState<CodeProject[]>(loadProjects());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<CodeProject | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editorSettings, setEditorSettings] = useState(loadEditorSettings());
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    language: 'javascript',
    code: '',
  });

  const currentTheme = THEMES[editorSettings.theme];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    saveEditorSettings(editorSettings);
  }, [editorSettings]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      p.language.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

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

    const updated = projects.map(p => 
      p.id === selectedProject.id 
        ? { ...p, ...formData, updatedAt: Date.now() }
        : p
    );
    setProjects(updated);
    
    const updatedProject = { ...selectedProject, ...formData, updatedAt: Date.now() };
    setSelectedProject(updatedProject);
    setIsEditDialogOpen(false);
    setUnsavedChanges(false);
    toast.success('项目信息已更新');
  };

  const handleDeleteProject = (id: string) => {
    setProjects(projects.filter(p => p.id !== id));
    if (selectedProject?.id === id) {
      setSelectedProject(null);
      setIsImmersive(false);
    }
    toast.success('项目已删除');
  };

  const handleCodeChange = (newCode: string) => {
    if (!selectedProject) return;
    setSelectedProject({ ...selectedProject, code: newCode });
    setUnsavedChanges(true);
  };

  const handleSaveCode = () => {
    if (!selectedProject) return;
    setProjects(projects.map(p => 
      p.id === selectedProject.id 
        ? { ...p, code: selectedProject.code, updatedAt: Date.now() }
        : p
    ));
    setUnsavedChanges(false);
    toast.success('代码已保存');
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
      javascript: 'js', typescript: 'ts', python: 'py', java: 'java',
      cpp: 'cpp', c: 'c', html: 'html', css: 'css', sql: 'sql',
      rust: 'rs', go: 'go',
    };
    return extMap[language] || 'txt';
  };

  const detectLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      js: 'javascript', ts: 'typescript', py: 'python', java: 'java',
      cpp: 'cpp', c: 'c', h: 'c', html: 'html', htm: 'html',
      css: 'css', sql: 'sql', rs: 'rust', go: 'go',
    };
    return langMap[ext] || 'other';
  };

  const getLanguageInfo = (value: string) => LANGUAGES.find(l => l.value === value) || LANGUAGES[11];

  // Immersive Mode - Full IDE-like experience
  if (isImmersive && selectedProject) {
    return (
      <div 
        className="fixed inset-0 z-[100] flex flex-col animate-in fade-in duration-200"
        style={{ backgroundColor: currentTheme.bg }}
      >
        {/* IDE Toolbar */}
        <div 
          className="flex items-center justify-between px-3 py-2 border-b select-none"
          style={{ backgroundColor: currentTheme.sidebar, borderColor: `${currentTheme.text}15` }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (unsavedChanges) {
                  handleSaveCode();
                }
                setIsImmersive(false);
              }}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-all hover:brightness-110"
              style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
            >
              <ChevronLeft className="h-4 w-4" />
              返回
            </button>
            
            <div className="flex items-center gap-2 px-3 py-1.5 rounded"
              style={{ backgroundColor: `${currentTheme.text}08` }}
            >
              <FileCode className="h-4 w-4" style={{ color: getLanguageInfo(selectedProject.language).color }} />
              <span style={{ color: currentTheme.text, fontSize: '13px' }}>{selectedProject.name}</span>
              {unsavedChanges && <span className="text-amber-400 text-xs">●</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-all hover:brightness-110"
              style={{ 
                backgroundColor: unsavedChanges ? '#365880' : `${currentTheme.text}15`,
                color: unsavedChanges ? '#fff' : currentTheme.text 
              }}
            >
              <Save className="h-4 w-4" />
              保存
            </button>
            
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded transition-all hover:brightness-110"
              style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
            >
              <Settings className="h-4 w-4" />
            </button>
            
            <button
              onClick={() => {
                if (unsavedChanges) handleSaveCode();
                setIsImmersive(false);
              }}
              className="p-2 rounded transition-all hover:brightness-110"
              style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* IDE Main Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Line Numbers */}
          <div 
            className="w-12 flex-shrink-0 py-4 text-right pr-2 select-none overflow-hidden"
            style={{ 
              backgroundColor: currentTheme.bg,
              color: currentTheme.lineNumber,
              fontSize: `${editorSettings.fontSize}px`,
              lineHeight: '1.6',
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            }}
          >
            {selectedProject.code.split('\n').map((_, i) => (
              <div key={i} className="h-[1.6em]">{i + 1}</div>
            ))}
          </div>

          {/* Code Editor */}
          <div className="flex-1 relative overflow-auto" ref={codeContainerRef}>
            <textarea
              ref={textareaRef}
              value={selectedProject.code}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="w-full min-h-full p-4 resize-none outline-none border-0"
              style={{ 
                backgroundColor: currentTheme.bg,
                color: currentTheme.text,
                fontSize: `${editorSettings.fontSize}px`,
                lineHeight: '1.6',
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                tabSize: 2,
              }}
              spellCheck={false}
              placeholder="// 在此输入代码..."
            />
          </div>
        </div>

        {/* Status Bar */}
        <div 
          className="flex items-center justify-between px-3 py-1 text-xs select-none"
          style={{ backgroundColor: currentTheme.sidebar, color: currentTheme.text }}
        >
          <div className="flex items-center gap-4">
            <span>{getLanguageInfo(selectedProject.language).label}</span>
            <span>UTF-8</span>
            <span>{selectedProject.code.length} 字符</span>
            <span>{selectedProject.code.split('\n').length} 行</span>
          </div>
          <div className="flex items-center gap-4">
            <span>字体: {editorSettings.fontSize}px</span>
            <span>主题: {currentTheme.name}</span>
          </div>
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div 
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 animate-in fade-in duration-150"
            onClick={() => setShowSettings(false)}
          >
            <div 
              className="w-full max-w-sm rounded-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
              style={{ backgroundColor: currentTheme.sidebar }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between"
                style={{ borderColor: `${currentTheme.text}15` }}
              >
                <h3 className="font-semibold" style={{ color: currentTheme.text }}>编辑器设置</h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-1.5 rounded hover:brightness-110 transition-all"
                  style={{ color: currentTheme.text }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 space-y-5">
                {/* Theme Selection */}
                <div className="space-y-2">
                  <Label style={{ color: currentTheme.text }}>编辑器主题</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {THEMES.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => setEditorSettings({ ...editorSettings, theme: i })}
                        className={`p-3 rounded-lg text-sm font-medium transition-all ${
                          editorSettings.theme === i ? 'ring-2 ring-primary scale-[1.02]' : 'hover:scale-[1.02]'
                        }`}
                        style={{ 
                          backgroundColor: t.bg,
                          color: t.text,
                          border: `1px solid ${editorSettings.theme === i ? 'var(--primary)' : 'transparent'}`,
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label style={{ color: currentTheme.text }}>字体大小</Label>
                    <span className="text-sm font-mono px-2 py-0.5 rounded"
                      style={{ backgroundColor: `${currentTheme.text}15`, color: currentTheme.text }}
                    >
                      {editorSettings.fontSize}px
                    </span>
                  </div>
                  <Slider 
                    value={[editorSettings.fontSize]} 
                    onValueChange={(v) => setEditorSettings({ ...editorSettings, fontSize: v[0] })} 
                    min={10} 
                    max={24} 
                    step={1} 
                  />
                </div>

                {/* Preview */}
                <div className="space-y-2">
                  <Label style={{ color: currentTheme.text }}>预览</Label>
                  <div 
                    className="p-3 rounded-lg font-mono text-sm"
                    style={{ 
                      backgroundColor: currentTheme.bg,
                      color: currentTheme.text,
                      fontSize: `${editorSettings.fontSize}px`,
                    }}
                  >
                    <span style={{ color: currentTheme.keyword }}>function</span>
                    <span> hello</span>
                    <span style={{ color: currentTheme.function }}>()</span>
                    <span> {'{'}</span>
                    <br/>
                    <span>  </span>
                    <span style={{ color: currentTheme.keyword }}>return</span>
                    <span style={{ color: currentTheme.string }}> "Hello World"</span>
                    <span>;</span>
                    <br/>
                    <span>{'}'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Project Editor View (Non-immersive)
  if (selectedProject) {
    return (
      <div className="h-full flex flex-col animate-in fade-in duration-200">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => {
              if (unsavedChanges) handleSaveCode();
              setSelectedProject(null);
            }}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              返回
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <FileCode 
                className="h-5 w-5" 
                style={{ color: getLanguageInfo(selectedProject.language).color }} 
              />
              <span className="font-medium">{selectedProject.name}</span>
              {unsavedChanges && <span className="text-amber-500 text-xs">● 未保存</span>}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleSaveCode} title="保存">
              <Save className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsImmersive(true)} title="沉浸模式">
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={openEditDialog} title="编辑信息">
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleExport(selectedProject)} title="导出">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDeleteProject(selectedProject.id)} 
              title="删除" className="text-red-500 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Code Editor */}
        <div className="flex-1 flex overflow-hidden">
          <div className="w-10 flex-shrink-0 py-4 text-right pr-2 select-none bg-muted/20 text-muted-foreground text-sm font-mono">
            {selectedProject.code.split('\n').map((_, i) => (
              <div key={i} className="h-6">{i + 1}</div>
            ))}
          </div>
          <textarea
            value={selectedProject.code}
            onChange={(e) => handleCodeChange(e.target.value)}
            className="flex-1 w-full p-4 resize-none outline-none font-mono text-sm"
            style={{ 
              lineHeight: '1.5',
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
            }}
            placeholder="// 在此输入代码..."
            spellCheck={false}
          />
        </div>
      </div>
    );
  }

  // Project List View
  return (
    <div className="space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">代码项目</h2>
          <p className="text-sm text-muted-foreground">{projects.length} 个项目</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="import-file" className="cursor-pointer">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 transition-all text-sm">
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
        <div className="text-center py-16 animate-in fade-in duration-500">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Code2 className="h-10 w-10 text-primary" />
          </div>
          <p className="text-muted-foreground mb-1">还没有代码项目</p>
          <p className="text-sm text-muted-foreground">点击右上角按钮创建新项目</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">没有找到匹配的项目</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(projectsByLanguage).map(([language, langProjects]) => {
            const langInfo = getLanguageInfo(language);
            return (
              <div key={language} className="animate-in fade-in slide-in-from-left-4 duration-300">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <span 
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: `${langInfo.color}20`, color: langInfo.color }}
                  >
                    {langInfo.icon}
                  </span>
                  {langInfo.label}
                  <span className="text-xs">({langProjects.length})</span>
                </h3>
                <div className="grid gap-2">
                  {langProjects.map((project, index) => (
                    <Card 
                      key={project.id} 
                      className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all duration-200 group animate-in fade-in slide-in-from-bottom-2"
                      style={{ animationDelay: `${index * 50}ms` }}
                      onClick={() => setSelectedProject(project)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary" />
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
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
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
                                <Edit3 className="h-4 w-4 mr-2" />
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
            );
          })}
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
                    className={`p-2 rounded-md text-xs font-medium transition-all ${
                      formData.language === lang.value
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
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
