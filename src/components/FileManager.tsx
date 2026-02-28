import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// 配置（改成你的！）
const SUPABASE_URL = 'https://eppgffcwmqawegngstqq.supabase.co'  // 【改成你的URL】
const SUPABASE_KEY = 'sb_publishable_lIjp2miQNKJQQuyzrJJWjQ_2xBTet9O'  // 【改成你的Publishable key】

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function FileManager() {
  const [user, setUser] = useState<any>(null)
  const [files, setFiles] = useState<any[]>([])
  const [githubConfig, setGithubConfig] = useState({
    user: localStorage.getItem('githubUser') || '',
    token: localStorage.getItem('githubToken') || '',
    repo: localStorage.getItem('repoName') || ''
  })
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  // 检查登录状态
  useEffect(() => {
    checkUser()
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadFiles(session.user.id)
    })
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    if (user) loadFiles(user.id)
  }

  // 保存 GitHub 配置
  function saveGithubConfig() {
    const user = prompt('GitHub用户名：', githubConfig.user)
    const token = prompt('GitHub钥匙（ghp_开头）：', githubConfig.token)
    const repo = prompt('仓库名：', githubConfig.repo)
    
    if (!user || !token || !repo) {
      setMessage('❌ 三个信息都必须填写！')
      return
    }
    
    localStorage.setItem('githubUser', user)
    localStorage.setItem('githubToken', token)
    localStorage.setItem('repoName', repo)
    
    setGithubConfig({ user, token, repo })
    setMessage('✅ GitHub配置已保存！现在可以登录了')
    setTimeout(() => setMessage(''), 3000)
  }

  async function login() {
    const email = prompt('请输入邮箱（三端用同一个）：')
    const password = prompt('请输入密码（三端必须一样）：')
    if (!email || !password) return

    setMessage('正在登录...')
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // 登录失败，自动注册
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) {
        setMessage('❌ 失败：' + signUpError.message)
      } else {
        setUser(signUpData.user)
        setMessage('✅ 新账号已创建！')
      }
    } else {
      setUser(data.user)
      setMessage('✅ 登录成功！')
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setFiles([])
    setMessage('已退出')
  }

  async function loadFiles(userId: string) {
    const { data } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setFiles(data || [])
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) {
      setMessage('请先登录！')
      return
    }

    if (!githubConfig.user || !githubConfig.token) {
      setMessage('❌ 请先配置 GitHub 信息！')
      return
    }

    setUploading(true)
    setMessage('正在上传...')
    
    try {
      // 创建 Release
      const today = new Date().toISOString().split('T')[0]
      const tagName = `files-${today}`
      const releaseId = await getOrCreateRelease(tagName)
      
      // 上传文件到 GitHub
      const uploadUrl = `https://uploads.github.com/repos/${githubConfig.user}/${githubConfig.repo}/releases/${releaseId}/assets?name=${encodeURIComponent(file.name)}`
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubConfig.token}`,
          'Content-Type': file.type || 'application/octet-stream',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: file
      })

      if (!response.ok) throw new Error('上传失败')
      
      const githubData = await response.json()
      
      // 保存到 Supabase
      await supabase.from('files').insert({
        user_id: user.id,
        name: file.name,
        url: githubData.browser_download_url,
        size: file.size,
        type: file.name.split('.').pop()?.toLowerCase(),
        created_at: new Date().toISOString()
      })

      loadFiles(user.id)
      setMessage('✅ 上传成功！已同步到所有设备')
      e.target.value = '' // 清空输入
    } catch (err: any) {
      setMessage('❌ 错误：' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function getOrCreateRelease(tagName: string) {
    const { user, token, repo } = githubConfig
    
    // 尝试获取现有的
    const getRes = await fetch(`https://api.github.com/repos/${user}/${repo}/releases/tags/${tagName}`, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    })
    
    if (getRes.ok) {
      const release = await getRes.json()
      return release.id
    }
    
    // 创建新的
    const createRes = await fetch(`https://api.github.com/repos/${user}/${repo}/releases`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        tag_name: tagName,
        name: `文件集 ${tagName}`,
        body: '自动上传的文件集合'
      })
    })
    
    if (!createRes.ok) throw new Error('创建存储位置失败')
    const release = await createRes.json()
    return release.id
  }

  async function deleteFile(id: string) {
    if (!confirm('确定删除这个文件记录？')) return
    await supabase.from('files').delete().eq('id', id)
    if (user) loadFiles(user.id)
  }

  // 检查配置状态
  const isConfigured = githubConfig.user && githubConfig.token && githubConfig.repo

  return (
    <div className="space-y-4 p-2">
      {/* 第一步：GitHub 配置（始终显示在最上面） */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
          ⚙️ 第一步：配置 GitHub（只需一次）
        </h4>
        
        {!isConfigured ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">
              状态：<span className="font-bold text-red-600">未配置</span>
            </p>
            <p className="text-xs text-amber-700">
              需要填写：GitHub用户名、Token（ghp_开头）、仓库名
            </p>
            <button 
              onClick={saveGithubConfig}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              点击配置 GitHub
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">
              状态：<span className="font-bold text-green-600">已配置</span> ({githubConfig.user})
            </p>
            <button 
              onClick={saveGithubConfig}
              className="text-xs text-amber-700 underline hover:text-amber-900"
            >
              修改配置
            </button>
          </div>
        )}
      </div>

      {/* 第二步：登录 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          🔐 第二步：登录账号
        </h4>
        
        {!user ? (
          <div className="space-y-2">
            <p className="text-sm text-blue-800">
              三端请使用同一个邮箱和密码
            </p>
            <button 
              onClick={login}
              className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              登录 / 注册
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-blue-800">
              已登录：<span className="font-bold">{user.email}</span>
            </p>
            <button 
              onClick={logout}
              className="text-xs text-blue-700 underline hover:text-blue-900"
            >
              切换账号
            </button>
          </div>
        )}
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`text-sm p-2 rounded-lg text-center ${
          message.startsWith('✅') ? 'bg-green-100 text-green-800' : 
          message.startsWith('❌') ? 'bg-red-100 text-red-800' : 
          'bg-gray-100 text-gray-800'
        }`}>
          {message}
        </div>
      )}

      {/* 第三步：上传文件（只有登录后才显示） */}
      {user && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">
            📤 上传文件
          </h4>
          <input 
            type="file" 
            onChange={uploadFile}
            disabled={uploading || !isConfigured}
            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
          />
          {uploading && <p className="text-xs text-gray-600 mt-2">上传中...</p>}
          {!isConfigured && <p className="text-xs text-red-500 mt-2">请先完成第一步配置</p>}
        </div>
      )}

      {/* 文件列表（只有登录后才显示） */}
      {user && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900">
              📋 我的文件 ({files.length})
            </h4>
            <button 
              onClick={() => loadFiles(user.id)}
              className="text-xs text-primary hover:underline"
            >
              刷新
            </button>
          </div>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {files.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">还没有文件</p>
            ) : (
              files.map(file => (
                <div key={file.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <a 
                      href={file.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                    >
                      查看
                    </a>
                    <button 
                      onClick={() => deleteFile(file.id)}
                      className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                    >
                      删除
                    </button>
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