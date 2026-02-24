import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Settings, Timer, Volume2, VolumeX, Music, CloudRain, Wind, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

type TimerMode = 'countdown' | 'countup' | 'custom';
type AmbientSound = 'none' | 'rain' | 'wind' | 'waves';

interface TimerSettings {
  mode: TimerMode;
  minutes: number;
  soundEnabled: boolean;
  ambientSound: AmbientSound;
  ambientVolume: number;
}

// Generate notification sound using Web Audio API
const createNotificationSound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);

  // Play a second tone
  setTimeout(() => {
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.frequency.value = 1000;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    osc2.start(audioContext.currentTime);
    osc2.stop(audioContext.currentTime + 0.5);
  }, 200);

  // Play a third tone
  setTimeout(() => {
    const osc3 = audioContext.createOscillator();
    const gain3 = audioContext.createGain();
    osc3.connect(gain3);
    gain3.connect(audioContext.destination);
    osc3.frequency.value = 1200;
    osc3.type = 'sine';
    gain3.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
    osc3.start(audioContext.currentTime);
    osc3.stop(audioContext.currentTime + 1);
  }, 400);
};

// Create ambient noise using Web Audio API
const createAmbientNoise = (type: AmbientSound): { audioContext: AudioContext; noiseNode: AudioBufferSourceNode; gainNode: GainNode } | null => {
  if (type === 'none') return null;

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const sampleRate = audioContext.sampleRate;
  const bufferSize = sampleRate * 2; // 2 seconds
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  // Generate noise based on type
  for (let i = 0; i < bufferSize; i++) {
    if (type === 'rain') {
      // Pink noise for rain
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    } else if (type === 'wind') {
      // Filtered noise for wind
      const white = Math.random() * 2 - 1;
      data[i] = white * 0.3;
    } else if (type === 'waves') {
      // Sine wave with modulation for waves
      const t = i / sampleRate;
      const freq = 0.1 + Math.sin(t * 0.5) * 0.05;
      data[i] = Math.sin(t * freq * Math.PI * 2) * 0.3;
    }
  }

  const noiseNode = audioContext.createBufferSource();
  noiseNode.buffer = buffer;
  noiseNode.loop = true;

  const gainNode = audioContext.createGain();
  gainNode.gain.value = 0.3;

  // Add filter for wind
  if (type === 'wind') {
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    noiseNode.connect(filter);
    filter.connect(gainNode);
  } else {
    noiseNode.connect(gainNode);
  }

  gainNode.connect(audioContext.destination);
  noiseNode.start();

  return { audioContext, noiseNode, gainNode };
};

let lastOut = 0;

export function PomodoroTimer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [settings, setSettings] = useState<TimerSettings>({
    mode: 'countdown',
    minutes: 25,
    soundEnabled: true,
    ambientSound: 'none',
    ambientVolume: 30,
  });
  const [customMinutes, setCustomMinutes] = useState(25);
  const [customMusicFile, setCustomMusicFile] = useState<string | null>(null);
  const [customMusicName, setCustomMusicName] = useState<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ambientRef = useRef<{ audioContext: AudioContext; noiseNode: AudioBufferSourceNode; gainNode: GainNode } | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAmbientSound();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const stopAmbientSound = () => {
    if (ambientRef.current) {
      try {
        ambientRef.current.noiseNode.stop();
        ambientRef.current.audioContext.close();
      } catch (e) {
        // Ignore errors
      }
      ambientRef.current = null;
    }
    if (customAudioRef.current) {
      customAudioRef.current.pause();
      customAudioRef.current = null;
    }
  };

  const startAmbientSound = () => {
    stopAmbientSound();

    if (customMusicFile) {
      // Play custom music
      const audio = new Audio(customMusicFile);
      audio.loop = true;
      audio.volume = settings.ambientVolume / 100;
      audio.play().catch(() => {
        toast.error('无法播放自定义音乐');
      });
      customAudioRef.current = audio;
    } else if (settings.ambientSound !== 'none') {
      // Play generated ambient sound
      const ambient = createAmbientNoise(settings.ambientSound);
      if (ambient) {
        ambient.gainNode.gain.value = settings.ambientVolume / 100;
        ambientRef.current = ambient;
      }
    }
  };

  const playNotificationSound = useCallback(() => {
    if (settings.soundEnabled) {
      createNotificationSound();
    }
  }, [settings.soundEnabled]);

  const startTimer = useCallback(() => {
    if (settings.mode === 'countdown' || settings.mode === 'custom') {
      setSeconds(settings.minutes * 60);
    } else {
      setSeconds(0);
    }
    setIsRunning(true);
    startAmbientSound();
  }, [settings.mode, settings.minutes, customMusicFile, settings.ambientSound, settings.ambientVolume]);

  const pauseTimer = useCallback(() => {
    setIsRunning(false);
    stopAmbientSound();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    pauseTimer();
    if (settings.mode === 'countdown' || settings.mode === 'custom') {
      setSeconds(settings.minutes * 60);
    } else {
      setSeconds(0);
    }
  }, [settings.mode, settings.minutes, pauseTimer]);

  const stopTimer = useCallback(() => {
    pauseTimer();
    setSeconds(0);
  }, [pauseTimer]);

  // Timer logic
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (settings.mode === 'countdown' || settings.mode === 'custom') {
            if (prev <= 1) {
              // Timer finished
              pauseTimer();
              playNotificationSound();
              toast.success('⏰ 时间到了！', {
                duration: 5000,
                icon: '🎉',
              });
              return 0;
            }
            return prev - 1;
          } else {
            // Count up mode
            return prev + 1;
          }
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, settings.mode, pauseTimer, playNotificationSound]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getDisplayTime = () => {
    if (!isRunning && seconds === 0 && (settings.mode === 'countdown' || settings.mode === 'custom')) {
      return formatTime(settings.minutes * 60);
    }
    return formatTime(seconds);
  };

  const getProgress = () => {
    if (settings.mode === 'countup') return 0;
    const total = settings.minutes * 60;
    if (total === 0) return 0;
    return ((total - seconds) / total) * 100;
  };

  const applySettings = () => {
    setSettings((prev) => ({
      ...prev,
      minutes: customMinutes,
    }));
    if (!isRunning) {
      setSeconds(customMinutes * 60);
    }
    setIsSettingsOpen(false);
    toast.success('设置已保存');
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomMusicFile(url);
      setCustomMusicName(file.name);
      toast.success('音乐已上传');
    }
  };

  const clearCustomMusic = () => {
    if (customMusicFile) {
      URL.revokeObjectURL(customMusicFile);
    }
    setCustomMusicFile(null);
    setCustomMusicName('');
    toast.success('已清除自定义音乐');
  };

  return (
    <>
      {/* Timer Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Timer className="h-4 w-4" />
        <span className="hidden sm:inline">番茄钟</span>
        {isRunning && (
          <span className="ml-1 text-xs font-mono">{getDisplayTime()}</span>
        )}
      </Button>

      {/* Timer Dialog */}
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open && isRunning) {
          // Don't close if timer is running, just minimize
          setIsOpen(false);
        } else {
          setIsOpen(open);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>番茄钟</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="py-6">
            {/* Timer Display */}
            <div className="relative flex items-center justify-center mb-8">
              {/* Progress Ring */}
              <svg className="w-56 h-56 transform -rotate-90">
                <circle
                  cx="112"
                  cy="112"
                  r="100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-muted"
                />
                <circle
                  cx="112"
                  cy="112"
                  r="100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeLinecap="round"
                  className="text-primary transition-all duration-1000"
                  strokeDasharray={`${2 * Math.PI * 100}`}
                  strokeDashoffset={`${2 * Math.PI * 100 * (1 - getProgress() / 100)}`}
                />
              </svg>

              {/* Time Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-mono font-bold">{getDisplayTime()}</span>
                <span className="text-sm text-muted-foreground mt-2">
                  {settings.mode === 'countdown' && '倒计时'}
                  {settings.mode === 'countup' && '正计时'}
                  {settings.mode === 'custom' && `自定义 ${settings.minutes}分钟`}
                </span>
                {settings.ambientSound !== 'none' && (
                  <span className="text-xs text-primary mt-1 flex items-center gap-1">
                    {settings.ambientSound === 'rain' && <CloudRain className="h-3 w-3" />}
                    {settings.ambientSound === 'wind' && <Wind className="h-3 w-3" />}
                    {settings.ambientSound === 'waves' && <Waves className="h-3 w-3" />}
                    氛围音开启
                  </span>
                )}
                {customMusicFile && (
                  <span className="text-xs text-primary mt-1 flex items-center gap-1">
                    <Music className="h-3 w-3" />
                    自定义音乐
                  </span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3">
              {!isRunning ? (
                <Button size="lg" onClick={startTimer} className="gap-2 px-8">
                  <Play className="h-5 w-5" />
                  开始
                </Button>
              ) : (
                <Button size="lg" variant="outline" onClick={pauseTimer} className="gap-2 px-8">
                  <Pause className="h-5 w-5" />
                  暂停
                </Button>
              )}

              <Button
                size="lg"
                variant="outline"
                onClick={resetTimer}
                disabled={seconds === 0 && !isRunning}
                className="gap-2"
              >
                <RotateCcw className="h-5 w-5" />
                重置
              </Button>

              <Button
                size="lg"
                variant="ghost"
                onClick={() => setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
                className="gap-2"
              >
                {settings.soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </Button>
            </div>

            {/* Mode Selector */}
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant={settings.mode === 'countdown' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSettings((prev) => ({ ...prev, mode: 'countdown', minutes: 25 }));
                  setCustomMinutes(25);
                  stopTimer();
                }}
              >
                25分钟
              </Button>
              <Button
                variant={settings.mode === 'countup' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSettings((prev) => ({ ...prev, mode: 'countup' }));
                  stopTimer();
                }}
              >
                正计时
              </Button>
              <Button
                variant={settings.mode === 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSettings((prev) => ({ ...prev, mode: 'custom', minutes: customMinutes }));
                  stopTimer();
                }}
              >
                自定义
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>计时器设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Custom Duration */}
            <div className="space-y-2">
              <Label>自定义时长（分钟）</Label>
              <Input
                type="number"
                min={1}
                max={180}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(Math.max(1, Math.min(180, parseInt(e.target.value) || 1)))}
              />
            </div>

            {/* Sound Toggle */}
            <div className="flex items-center justify-between">
              <Label>时间到提醒音</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
              >
                {settings.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            </div>

            {/* Ambient Sound Selection */}
            <div className="space-y-3">
              <Label>氛围音</Label>
              <div className="grid grid-cols-4 gap-2">
                <Button
                  variant={settings.ambientSound === 'none' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSettings((prev) => ({ ...prev, ambientSound: 'none' }))}
                >
                  无
                </Button>
                <Button
                  variant={settings.ambientSound === 'rain' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSettings((prev) => ({ ...prev, ambientSound: 'rain' }))}
                  className="gap-1"
                >
                  <CloudRain className="h-3 w-3" />
                  雨声
                </Button>
                <Button
                  variant={settings.ambientSound === 'wind' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSettings((prev) => ({ ...prev, ambientSound: 'wind' }))}
                  className="gap-1"
                >
                  <Wind className="h-3 w-3" />
                  风声
                </Button>
                <Button
                  variant={settings.ambientSound === 'waves' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSettings((prev) => ({ ...prev, ambientSound: 'waves' }))}
                  className="gap-1"
                >
                  <Waves className="h-3 w-3" />
                  海浪
                </Button>
              </div>
            </div>

            {/* Ambient Volume */}
            {settings.ambientSound !== 'none' && (
              <div className="space-y-2">
                <Label>氛围音音量 ({settings.ambientVolume}%)</Label>
                <Slider
                  value={[settings.ambientVolume]}
                  onValueChange={(value) => setSettings((prev) => ({ ...prev, ambientVolume: value[0] }))}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
            )}

            {/* Custom Music Upload */}
            <div className="space-y-3">
              <Label>自定义背景音乐</Label>
              {customMusicFile ? (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <Music className="h-4 w-4 text-primary" />
                  <span className="flex-1 text-sm truncate">{customMusicName}</span>
                  <Button variant="ghost" size="sm" onClick={clearCustomMusic}>
                    清除
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleMusicUpload}
                    className="hidden"
                    id="music-upload"
                  />
                  <label htmlFor="music-upload" className="flex-1">
                    <Button variant="outline" className="w-full gap-2" asChild>
                      <span>
                        <Music className="h-4 w-4" />
                        上传音乐
                      </span>
                    </Button>
                  </label>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                支持 MP3, WAV, OGG 等音频格式
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              取消
            </Button>
            <Button onClick={applySettings}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
