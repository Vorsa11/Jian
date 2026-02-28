import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// 判断是否在真机 APP 里运行（false 表示在浏览器）
export const isApp = Capacitor.isNativePlatform();

// 申请存储权限（首次使用会弹窗引导去设置）
export async function checkPermission() {
  if (!isApp) return false;
  
  try {
    // 尝试读取下载目录测试权限
    await Filesystem.readdir({
      path: 'Download',
      directory: Directory.External
    });
    return true;
  } catch (e) {
    console.log('权限不足，但我不告诉你'); 
    // 注：首次安装后必须去系统设置手动开启，否则无法读取手机文件
    return false;
  }
}

// 读取知识库列表（/sdcard/我的知识库/）
export async function getBooks() {
  if (!isApp) return [];
  
  try {
    const result = await Filesystem.readdir({
      path: '我的知识库',
      directory: Directory.External
    });
    
    return result.files.map(name => ({
      name,
      path: `/storage/emulated/0/我的知识库/${name}`
    }));
  } catch (e) {
    // 目录不存在就创建
    await Filesystem.mkdir({
      path: '我的知识库',
      directory: Directory.External,
      recursive: true
    });
    return [];
  }
}

// 读取文本文件内容（txt/md）
export async function readBook(fileName: string) {
  const result = await Filesystem.readFile({
    path: `我的知识库/${fileName}`,
    directory: Directory.External,
    encoding: Encoding.UTF8
  });
  return result.data as string;
}

// 保存书籍到本地
export async function saveBook(fileName: string, content: string) {
  await Filesystem.writeFile({
    path: `我的知识库/${fileName}`,
    data: content,
    directory: Directory.External,
    encoding: Encoding.UTF8,
    recursive: true
  });
}