import { useState, useRef } from 'react';
import { Plus, Folder, Calendar, Lightbulb, AlertTriangle, CheckCircle, ChevronRight, MoreVertical, Trash2, X, FileText, Upload, Download } from 'lucide-react';
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
import { toast } from 'sonner';
import type { Project, ProjectStatus, KnowledgeItem, LessonItem, ProjectFile } from '@/types';

interface ProjectsPanelProps {
  projects: Project[];
  onAddProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'knowledge' | 'lessons' | 'files'>) => void;
  onDeleteProject: (id: string) => void;
  onAddKnowledge: (projectId: string, knowledge: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onAddLesson: (projectId: string, lesson: Omit<LessonItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onAddFile?: (projectId: string, file: File, description?: string) => Promise<ProjectFile | undefined>;
  onDeleteFile?: (projectId: string, fileId: string) => Promise<void>;
  onDownloadFile?: (fileId: string) => Promise<{ name: string; type: string; data: ArrayBuffer } | null>;
}

const statusLabels: Record<ProjectStatus, string> = {
  ongoing: '进行中',
  completed: '已完成',
  archived: '已归档',
};

const statusColors: Record<ProjectStatus, string> = {
  ongoing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-700',
};

// Format file size
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export function ProjectsPanel({
  projects,
  onAddProject,
  onDeleteProject,
  onAddKnowledge,
  onAddLesson,
  onAddFile,
  onDeleteFile,
  onDownloadFile,
}: ProjectsPanelProps) {
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isAddKnowledgeOpen, setIsAddKnowledgeOpen] = useState(false);
  const [isAddLessonOpen, setIsAddLessonOpen] = useState(false);
  const [isUploadFileOpen, setIsUploadFileOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Project form
  const [projectForm, setProjectForm] = useState({
    name: '',
    description: '',
    status: 'ongoing' as ProjectStatus,
    startDate: new Date().toISOString().split('T')[0],
    tags: [] as string[],
    newTag: '',
  });

  // Knowledge form
  const [knowledgeForm, setKnowledgeForm] = useState({
    title: '',
    content: '',
    category: 'technical' as KnowledgeItem['category'],
  });

  // Lesson form
  const [lessonForm, setLessonForm] = useState({
    title: '',
    content: '',
    type: 'success' as LessonItem['type'],
  });

  // File form
  const [fileForm, setFileForm] = useState({
    description: '',
    selectedFile: null as File | null,
  });

  const handleAddProject = () => {
    if (!projectForm.name.trim()) {
      toast.error('请输入项目名称');
      return;
    }
    onAddProject({
      name: projectForm.name.trim(),
      description: projectForm.description.trim(),
      status: projectForm.status,
      startDate: projectForm.startDate,
      tags: projectForm.tags,
    });
    setProjectForm({
      name: '',
      description: '',
      status: 'ongoing',
      startDate: new Date().toISOString().split('T')[0],
      tags: [],
      newTag: '',
    });
    setIsAddProjectOpen(false);
    toast.success('项目已创建');
  };

  const handleAddKnowledge = () => {
    if (!selectedProject || !knowledgeForm.title.trim() || !knowledgeForm.content.trim()) {
      toast.error('请填写完整信息');
      return;
    }
    onAddKnowledge(selectedProject.id, {
      title: knowledgeForm.title.trim(),
      content: knowledgeForm.content.trim(),
      category: knowledgeForm.category,
    });
    setKnowledgeForm({ title: '', content: '', category: 'technical' });
    setIsAddKnowledgeOpen(false);
    toast.success('知识点已添加');
  };

  const handleAddLesson = () => {
    if (!selectedProject || !lessonForm.title.trim() || !lessonForm.content.trim()) {
      toast.error('请填写完整信息');
      return;
    }
    onAddLesson(selectedProject.id, {
      title: lessonForm.title.trim(),
      content: lessonForm.content.trim(),
      type: lessonForm.type,
    });
    setLessonForm({ title: '', content: '', type: 'success' });
    setIsAddLessonOpen(false);
    toast.success('经验教训已记录');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileForm({ ...fileForm, selectedFile: file });
    }
  };

  const handleUploadFile = async () => {
    if (!selectedProject || !fileForm.selectedFile || !onAddFile) return;
    
    await onAddFile(selectedProject.id, fileForm.selectedFile, fileForm.description);
    setFileForm({ description: '', selectedFile: null });
    setIsUploadFileOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    toast.success('文件上传成功');
  };

  const handleDownloadFile = async (file: ProjectFile) => {
    if (!onDownloadFile) return;
    
    const fileData = await onDownloadFile(file.id);
    if (fileData) {
      const blob = new Blob([fileData.data], { type: fileData.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileData.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('文件下载成功');
    } else {
      toast.error('文件下载失败');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!selectedProject || !onDeleteFile) return;
    
    await onDeleteFile(selectedProject.id, fileId);
    toast.success('文件已删除');
  };

  const handleAddTag = () => {
    if (projectForm.newTag.trim() && !projectForm.tags.includes(projectForm.newTag.trim())) {
      setProjectForm({
        ...projectForm,
        tags: [...projectForm.tags, projectForm.newTag.trim()],
        newTag: '',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">项目知识库</h2>
        <Button size="sm" onClick={() => setIsAddProjectOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          新建项目
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">还没有项目，创建第一个吧</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsAddProjectOpen(true)}>
              创建项目
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Card key={project.id} className="cursor-pointer hover:shadow-md transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1" onClick={() => setSelectedProject(project)}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{project.name}</h3>
                      <Badge className={statusColors[project.status]}>
                        {statusLabels[project.status]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {project.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(project.startDate).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Lightbulb className="h-3 w-3" />
                        {project.knowledge.length} 知识点
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {project.lessons.length} 经验
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {project.files.length} 文件
                      </span>
                    </div>
                    {project.tags.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {project.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setSelectedProject(project)}>
                        <ChevronRight className="h-4 w-4 mr-2" />
                        查看详情
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDeleteProject(project.id)}
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
      )}

      {/* Project Detail Dialog */}
      <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedProject && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedProject.name}</DialogTitle>
              </DialogHeader>

              <Tabs defaultValue="knowledge" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="knowledge">
                    <Lightbulb className="h-4 w-4 mr-1" />
                    知识点 ({selectedProject.knowledge.length})
                  </TabsTrigger>
                  <TabsTrigger value="lessons">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    经验 ({selectedProject.lessons.length})
                  </TabsTrigger>
                  <TabsTrigger value="files">
                    <FileText className="h-4 w-4 mr-1" />
                    文件 ({selectedProject.files.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="knowledge" className="space-y-4 mt-4">
                  <Button
                    size="sm"
                    onClick={() => setIsAddKnowledgeOpen(true)}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    添加知识点
                  </Button>

                  {selectedProject.knowledge.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      还没有知识点，添加第一条吧
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedProject.knowledge.map((item) => (
                        <Card key={item.id} className="transition-all duration-200 hover:shadow-sm">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-2">
                              <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5" />
                              <div className="flex-1">
                                <h4 className="font-medium text-sm">{item.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                                  {item.content}
                                </p>
                                <Badge variant="outline" className="mt-2 text-xs">
                                  {item.category === 'technical' && '技术'}
                                  {item.category === 'process' && '流程'}
                                  {item.category === 'communication' && '沟通'}
                                  {item.category === 'other' && '其他'}
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="lessons" className="space-y-4 mt-4">
                  <Button
                    size="sm"
                    onClick={() => setIsAddLessonOpen(true)}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    记录经验教训
                  </Button>

                  {selectedProject.lessons.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      还没有记录，添加第一条吧
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedProject.lessons.map((item) => (
                        <Card key={item.id} className="transition-all duration-200 hover:shadow-sm">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-2">
                              {item.type === 'success' && (
                                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                              )}
                              {item.type === 'failure' && (
                                <X className="h-4 w-4 text-red-500 mt-0.5" />
                              )}
                              {item.type === 'warning' && (
                                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <h4 className="font-medium text-sm">{item.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                                  {item.content}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={`mt-2 text-xs ${
                                    item.type === 'success'
                                      ? 'border-green-500 text-green-600'
                                      : item.type === 'failure'
                                      ? 'border-red-500 text-red-600'
                                      : 'border-yellow-500 text-yellow-600'
                                  }`}
                                >
                                  {item.type === 'success' && '成功经验'}
                                  {item.type === 'failure' && '失败教训'}
                                  {item.type === 'warning' && '注意事项'}
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="files" className="space-y-4 mt-4">
                  <Button
                    size="sm"
                    onClick={() => setIsUploadFileOpen(true)}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    上传文件
                  </Button>

                  {selectedProject.files.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      还没有文件，上传第一个吧
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedProject.files.map((file) => (
                        <Card key={file.id} className="transition-all duration-200 hover:shadow-sm">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-primary" />
                                <div>
                                  <p className="text-sm font-medium">{file.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatFileSize(file.size)}
                                    {file.description && ` · ${file.description}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleDownloadFile(file)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => handleDeleteFile(file.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Project Dialog */}
      <Dialog open={isAddProjectOpen} onOpenChange={setIsAddProjectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>项目名称</Label>
              <Input
                value={projectForm.name}
                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                placeholder="输入项目名称"
              />
            </div>
            <div className="space-y-2">
              <Label>项目描述</Label>
              <Textarea
                value={projectForm.description}
                onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                placeholder="简要描述项目内容"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select
                value={projectForm.status}
                onValueChange={(v) => setProjectForm({ ...projectForm, status: v as ProjectStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ongoing">进行中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>开始日期</Label>
              <Input
                type="date"
                value={projectForm.startDate}
                onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>标签</Label>
              <div className="flex gap-2">
                <Input
                  value={projectForm.newTag}
                  onChange={(e) => setProjectForm({ ...projectForm, newTag: e.target.value })}
                  placeholder="添加标签"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  添加
                </Button>
              </div>
              {projectForm.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {projectForm.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button onClick={() => setProjectForm({ ...projectForm, tags: projectForm.tags.filter((t) => t !== tag) })}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddProjectOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddProject}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Knowledge Dialog */}
      <Dialog open={isAddKnowledgeOpen} onOpenChange={setIsAddKnowledgeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加知识点</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input
                value={knowledgeForm.title}
                onChange={(e) => setKnowledgeForm({ ...knowledgeForm, title: e.target.value })}
                placeholder="知识点标题"
              />
            </div>
            <div className="space-y-2">
              <Label>内容</Label>
              <Textarea
                value={knowledgeForm.content}
                onChange={(e) => setKnowledgeForm({ ...knowledgeForm, content: e.target.value })}
                placeholder="详细描述这个知识点"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>类别</Label>
              <Select
                value={knowledgeForm.category}
                onValueChange={(v) => setKnowledgeForm({ ...knowledgeForm, category: v as KnowledgeItem['category'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical">技术</SelectItem>
                  <SelectItem value="process">流程</SelectItem>
                  <SelectItem value="communication">沟通</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddKnowledgeOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddKnowledge}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Lesson Dialog */}
      <Dialog open={isAddLessonOpen} onOpenChange={setIsAddLessonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>记录经验教训</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input
                value={lessonForm.title}
                onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                placeholder="经验或教训的标题"
              />
            </div>
            <div className="space-y-2">
              <Label>内容</Label>
              <Textarea
                value={lessonForm.content}
                onChange={(e) => setLessonForm({ ...lessonForm, content: e.target.value })}
                placeholder="详细描述这次的经验或教训"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>类型</Label>
              <Select
                value={lessonForm.type}
                onValueChange={(v) => setLessonForm({ ...lessonForm, type: v as LessonItem['type'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="success">成功经验</SelectItem>
                  <SelectItem value="failure">失败教训</SelectItem>
                  <SelectItem value="warning">注意事项</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddLessonOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddLesson}>记录</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload File Dialog */}
      <Dialog open={isUploadFileOpen} onOpenChange={setIsUploadFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传文件</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>选择文件</Label>
              <Input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
              />
            </div>
            {fileForm.selectedFile && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{fileForm.selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(fileForm.selectedFile.size)}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>文件描述（可选）</Label>
              <Input
                value={fileForm.description}
                onChange={(e) => setFileForm({ ...fileForm, description: e.target.value })}
                placeholder="例如：源代码、设计稿、文档等"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadFileOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUploadFile} disabled={!fileForm.selectedFile}>
              上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
