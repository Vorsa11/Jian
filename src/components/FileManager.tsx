import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

// ✅ Cloudflare Worker 代理地址（解决 CORS）
const WORKER_URL = 'https://jian-proxy.849828099.workers.dev'

// ✅ Supabase 配置（确保没有空格）
const SUPABASE_URL = 'https://qgchjazbxtdnezjlwtrh.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnY2hqYXpieHRkbmV6amx3dHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzQwNDEsImV4cCI6MjA4Nzg1MDA0MX0.bWte3zs3LApyxVKLKIwjCjJa-M0KpJwPnQzjfkEerxs'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ✅ GitHub Releases 硬性限制：单个文件 2GB
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB in bytes
const CHUNK_SIZE = 2 * 1024 * 1024 * 1024 // 分块大小（2GB）

interface FileRecord {
  id: string
  user_id: string
  name: string
  url: string
  size: number
  type: string
  created_at: string
  is_chunked?: boolean
  total_chunks?: number
  chunk_index?: number
  original_name?: string
}

interface GithubConfig {
  user: string
  token: string
  repo: string
}

interface UploadProgress {
  loaded: number
  total: number
  percentage: number
  speed: string
  timeLeft: string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatSpeed(bytesPerSecond: number): string {
  return formatFileSize(bytesPerSecond) + '/s'
}

export default function FileManager() {
  const [user, setUser] = useState<User | null>(null)
  const [files, setFiles] = useState<FileRecord[]>([])
  const [githubConfig, setGithubConfig] = useState<GithubConfig>(() => ({
    user: localStorage.getItem('githubUser') || '',
    token: localStorage.getItem('githubToken') || '',
    repo: localStorage.getItem('repoName') || ''
  }))
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [message, setMessage] = useState('')
  const [uploadController, setUploadController] = useState<AbortController | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const startTimeRef = useRef<number>(0)

  const loadFiles = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setFiles(data || [])
    } catch (err: any) {
      console.error('加载文件失败:', err)
      setMessage('❌ 加载文件列表失败：' + err.message)
    }
  }, [])

  useEffect(() => {
    checkUser()
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        setTimeout(() => loadFiles(currentUser.id), 0)
      } else {
        setFiles([])
      }
    })
    
    return () => subscription.unsubscribe()
  }, [loadFiles])

  async function checkUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error) {
        if (error.name === 'AuthSessionMissingError' || 
            error.message?.includes('Auth session missing')) {
          console.log('用户未登录')
          setUser(null)
          return
        }
        throw error
      }
      
      setUser(user)
      if (user) loadFiles(user.id)
    } catch (err: any) {
      console.error('获取用户失败:', err)
      if (err.message?.includes('Failed to fetch') || err.message?.includes('Network')) {
        setMessage('❌ 网络连接失败，请检查网络或Supabase服务状态')
      } else {
        setMessage('❌ 会话验证失败：' + err.message)
      }
    }
  }

  async function login() {
    const email = prompt('请输入邮箱（三端用同一个）：')?.trim()
    const password = prompt('请输入密码（三端必须一样）：')?.trim()
    
    if (!email || !password) {
      setMessage('❌ 邮箱和密码不能为空')
      return
    }

    setMessage('正在连接服务器...')
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      
      if (error) {
        if (error.message.includes('Invalid login')) {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ 
            email, 
            password,
            options: { data: { email_confirmed: true } }
          })
          
          if (signUpError) {
            setMessage('❌ 注册失败：' + signUpError.message)
          } else {
            setUser(signUpData.user)
            setMessage('✅ 新账号已创建！')
          }
        } else {
          throw error
        }
      } else {
        setUser(data.user)
        setMessage('✅ 登录成功！')
      }
    } catch (err: any) {
      console.error('登录错误:', err)
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        setMessage('❌ 无法连接到服务器')
      } else if (err.message?.includes('Invalid login')) {
        setMessage('❌ 邮箱或密码错误')
      } else {
        setMessage('❌ 登录失败：' + err.message)
      }
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setFiles([])
    setMessage('✅ 已退出登录')
  }

  function saveGithubConfig() {
    const user = prompt('GitHub用户名：', githubConfig.user)?.trim()
    const token = prompt('GitHub Token（ghp_ 或 github_pat_ 开头）：', githubConfig.token)?.trim()
    const repo = prompt('仓库名：', githubConfig.repo)?.trim()
    
    if (!user || !token || !repo) {
      setMessage('❌ 三个信息都必须填写！')
      return
    }
    
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      setMessage('⚠️ 警告：Token格式不正确')
      return
    }
    
    localStorage.setItem('githubUser', user)
    localStorage.setItem('githubToken', token)
    localStorage.setItem('repoName', repo)
    
    setGithubConfig({ user, token, repo })
    setMessage('✅ GitHub配置已保存！')
    setTimeout(() => setMessage(''), 3000)
  }

  async function uploadWithProgress(
    url: string, 
    file: File | Blob, 
    headers: HeadersInit,
    onProgress: (progress: UploadProgress) => void,
    signal: AbortSignal
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const now = Date.now()
          const elapsed = (now - startTimeRef.current) / 1000
          const speed = elapsed > 0 ? event.loaded / elapsed : 0
          const remaining = event.loaded > 0 ? (event.total - event.loaded) / speed : 0
          
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
            speed: formatSpeed(speed),
            timeLeft: remaining > 60 ? `${Math.round(remaining/60)}分钟` : `${Math.round(remaining)}秒`
          })
        }
      })
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            resolve(xhr.responseText)
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            reject(new Error(error.message || `HTTP ${xhr.status}`))
          } catch {
            reject(new Error(`上传失败: ${xhr.status}`))
          }
        }
      })
      
      xhr.addEventListener('error', () => reject(new Error('网络错误，请检查连接')))
      xhr.addEventListener('abort', () => reject(new Error('上传已取消')))
      
      signal.addEventListener('abort', () => xhr.abort())
      
      xhr.open('POST', url)
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value as string)
      })
      
      startTimeRef.current = Date.now()
      xhr.send(file)
    })
  }

  // ✅ 通过 Cloudflare Worker 获取或创建 Release
  async function getOrCreateRelease(tagName: string): Promise<number | null> {
    // 先尝试获取已存在的 Release
    const getRes = await fetch(
      `${WORKER_URL}/api/release?owner=${githubConfig.user}&repo=${githubConfig.repo}&tag=${tagName}&token=${githubConfig.token}`
    );
    
    if (getRes.ok) {
      const release = await getRes.json();
      return release.id;
    }
    
    // 不存在则创建新的
    const createRes = await fetch(`${WORKER_URL}/api/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: githubConfig.user,
        repo: githubConfig.repo,
        tag: tagName,
        token: githubConfig.token,
        name: `文件集 ${tagName}`,
        body: '自动上传的文件集合'
      })
    });
    
    if (!createRes.ok) {
      const errData = await createRes.json();
      throw new Error(errData.message || `创建 Release 失败: ${createRes.status}`);
    }
    
    const release = await createRes.json();
    return release.id;
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) {
      setMessage('请先登录！')
      return
    }

    if (!githubConfig.user || !githubConfig.token || !githubConfig.repo) {
      setMessage('❌ 请先配置 GitHub 信息！')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      const shouldChunk = confirm(
        `文件大小为 ${formatFileSize(file.size)}，超过 GitHub Releases 单文件 2GB 限制。\n\n` +
        `是否自动分块上传？`
      )
      if (shouldChunk) {
        await uploadChunkedFile(file)
        e.target.value = ''
        return
      } else {
        setMessage(`❌ 已取消上传`)
        return
      }
    }

    await uploadSingleFile(file)
    e.target.value = ''
  }

  // ✅ 上传单文件（<2GB）- 使用 Worker 代理
  async function uploadSingleFile(file: File) {
    setUploading(true)
    setProgress({ loaded: 0, total: file.size, percentage: 0, speed: '0 KB/s', timeLeft: '计算中...' })
    setMessage('准备上传...')
    
    const controller = new AbortController()
    setUploadController(controller)

    try {
      const today = new Date().toISOString().split('T')[0]
      const tagName = `files-${today}`
      
      const releaseId = await getOrCreateRelease(tagName)
      if (!releaseId) throw new Error('无法获取 Release ID')

      // ✅ 通过 Worker 上传（解决 CORS）
      const uploadUrl = `${WORKER_URL}/api/upload?release_id=${releaseId}&owner=${githubConfig.user}&repo=${githubConfig.repo}&token=${githubConfig.token}&name=${encodeURIComponent(file.name)}`
      
      setMessage('正在上传，请勿关闭页面...')
      
      const githubData = await uploadWithProgress(
        uploadUrl,
        file,
        {
          'Content-Type': file.type || 'application/octet-stream'
        },
        (prog) => setProgress(prog),
        controller.signal
      )

      const { error: dbError } = await supabase.from('files').insert({
        user_id: user!.id,
        name: file.name,
        url: githubData.browser_download_url,
        size: file.size,
        type: file.name.split('.').pop()?.toLowerCase() || 'unknown',
        created_at: new Date().toISOString(),
        is_chunked: false
      })

      if (dbError) throw dbError

      await loadFiles(user!.id)
      setMessage(`✅ 上传成功！${formatFileSize(file.size)}`)
      setTimeout(() => setMessage(''), 5000)
    } catch (err: any) {
      if (err.message === '上传已取消') {
        setMessage('⚠️ 上传已取消')
      } else {
        console.error('上传错误:', err)
        setMessage('❌ 上传失败：' + err.message)
      }
    } finally {
      setUploading(false)
      setProgress(null)
      setUploadController(null)
    }
  }

  // ✅ 分块上传（>2GB 文件）- 使用 Worker 代理
  async function uploadChunkedFile(file: File) {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
    setUploading(true)
    setMessage(`开始分块上传：共 ${totalChunks} 个分块...`)

    try {
      const today = new Date().toISOString().split('T')[0]
      const tagName = `files-${today}`
      const releaseId = await getOrCreateRelease(tagName)
      if (!releaseId) throw new Error('无法获取 Release ID')

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = file.slice(start, end)
        const chunkName = `${file.name}.part${i + 1}`
        
        setMessage(`正在上传分块 ${i + 1}/${totalChunks} (${formatFileSize(chunk.size)})...`)
        setProgress({ 
          loaded: 0, 
          total: chunk.size, 
          percentage: 0, 
          speed: '0 KB/s', 
          timeLeft: '计算中...' 
        })

        const controller = new AbortController()
        setUploadController(controller)

        // ✅ 通过 Worker 上传分块
        const uploadUrl = `${WORKER_URL}/api/upload?release_id=${releaseId}&owner=${githubConfig.user}&repo=${githubConfig.repo}&token=${githubConfig.token}&name=${encodeURIComponent(chunkName)}`
        
        const githubData = await uploadWithProgress(
          uploadUrl,
          chunk,
          {
            'Content-Type': 'application/octet-stream'
          },
          (prog) => setProgress({ ...prog, percentage: Math.round(((i * CHUNK_SIZE + prog.loaded) / file.size) * 100) }),
          controller.signal
        )

        await supabase.from('files').insert({
          user_id: user!.id,
          name: chunkName,
          url: githubData.browser_download_url,
          size: chunk.size,
          type: 'part',
          created_at: new Date().toISOString(),
          is_chunked: true,
          total_chunks: totalChunks,
          chunk_index: i + 1,
          original_name: file.name
        })
      }

      await loadFiles(user!.id)
      setMessage(`✅ 分块上传完成！`)
      setTimeout(() => setMessage(''), 5000)
    } catch (err: any) {
      console.error('分块上传错误:', err)
      setMessage('❌ 分块上传失败：' + err.message)
    } finally {
      setUploading(false)
      setProgress(null)
      setUploadController(null)
    }
  }

  function cancelUpload() {
    if (uploadController) {
      uploadController.abort()
      setUploadController(null)
    }
  }

  async function deleteFile(id: string, name: string) {
    if (!confirm(`确定要删除 "${name}"？`)) return
    
    try {
      const { error } = await supabase.from('files').delete().eq('id', id)
      if (error) throw error
      
      if (user) loadFiles(user.id)
      setMessage('✅ 已删除记录')
    } catch (err: any) {
      setMessage('❌ 删除失败：' + err.message)
    }
  }

  const isConfigured = githubConfig.user && githubConfig.token && githubConfig.repo

  return (
    <div className="space-y-4 p-2 max-w-2xl mx-auto">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="font-semibold text-amber-900 mb-2">⚙️ 第一步：配置 GitHub（只需一次）</h4>
        {!isConfigured ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">状态：<span className="font-bold text-red-600">未配置</span></p>
            <button onClick={saveGithubConfig} className="w-full py-2 bg-amber-500 text-white rounded-lg">点击配置 GitHub</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">状态：<span className="font-bold text-green-600">已配置</span> ({githubConfig.user}/{githubConfig.repo})</p>
            <button onClick={saveGithubConfig} className="text-xs text-amber-700 underline">修改配置</button>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="font-semibold text-blue-900 mb-2">🔐 第二步：登录账号</h4>
        {!user ? (
          <div className="space-y-2">
            <p className="text-sm text-blue-800">三端请使用同一个邮箱和密码</p>
            <button onClick={login} className="w-full py-2 bg-blue-500 text-white rounded-lg">登录 / 注册</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-blue-800">已登录：<span className="font-bold">{user.email}</span></p>
            <button onClick={logout} className="text-xs text-blue-700 underline">切换账号</button>
          </div>
        )}
      </div>

      {message && (
        <div className={`text-sm p-3 rounded-lg text-center border ${
          message.startsWith('✅') ? 'bg-green-100 text-green-800' : 
          message.startsWith('❌') ? 'bg-red-100 text-red-800' : 
          'bg-blue-100 text-blue-800'
        }`}>
          {message}
        </div>
      )}

      {user && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">📤 上传文件（最大支持 2GB）</h4>
          <input ref={fileInputRef} type="file" onChange={uploadFile} disabled={uploading} className="w-full text-sm mb-3" />
          <p className="text-xs text-gray-500">单文件最大 2GB，超过会自动分块</p>
          
          {uploading && progress && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-600">
                <span>{progress.percentage}% ({formatFileSize(progress.loaded)} / {formatFileSize(progress.total)})</span>
                <span>{progress.speed} • 剩余 {progress.timeLeft}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress.percentage}%` }}></div>
              </div>
              <button onClick={cancelUpload} className="w-full py-1.5 bg-red-100 text-red-700 rounded text-xs">取消上传</button>
            </div>
          )}
        </div>
      )}

      {user && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900">📋 我的文件 ({files.length})</h4>
            <button onClick={() => loadFiles(user.id)} className="text-xs text-blue-600">刷新</button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {files.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">还没有文件</p>
            ) : (
              files.map(file => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="truncate font-medium">{file.is_chunked ? `📦 ${file.original_name} (分块 ${file.chunk_index}/${file.total_chunks})` : file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  <div className="flex gap-2">
                    <a href={file.url} target="_blank" className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-xs">下载</a>
                    <button onClick={() => deleteFile(file.id, file.name)} className="px-3 py-1.5 bg-red-100 text-red-700 rounded text-xs">删除</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}