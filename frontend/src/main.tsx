import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  Calculator,
  CheckCircle,
  CloudDownload,
  Clock3,
  Database,
  Download,
  FileVideo,
  FolderDown,
  Image as ImageIcon,
  Layers,
  Loader2,
  Music,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  ZoomIn
} from 'lucide-react';
import './styles.css';

type FormatInfo = {
  key: string;
  label: string;
  kind: 'video' | 'audio';
  extension: string;
  supports_audio: boolean;
};

type FilterInfo = {
  key: string;
  label: string;
  css: string;
};

type MediaInfo = {
  duration?: number;
  resolution?: string;
  width?: number;
  height?: number;
  video_codec?: string;
  audio_codec?: string;
  format_name?: string;
  size?: number;
  fps?: number;
  frame_count?: number;
  sample_rate?: number;
  channels?: number;
  channel_layout?: string;
  bit_rate?: number;
  audio_streams?: AudioStreamInfo[];
};

type AudioStreamInfo = {
  index: number;
  codec?: string;
  language?: string;
  title?: string;
  sample_rate?: number;
  channels?: number;
  channel_layout?: string;
  bit_rate?: number;
  default?: boolean;
};

type UploadResponse = {
  file_id: string;
  filename: string;
  info: MediaInfo;
};

type JobResponse = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  message: string;
  error?: string;
  download_url?: string;
  output_name?: string;
  meta?: WatermarkMeta | null;
};

type WatermarkMeta = {
  applied?: boolean;
  skipReason?: string | null;
  size?: number | null;
  alphaGain?: number;
  passCount?: number;
  decisionTier?: string | null;
  source?: string | null;
};

type ModelJobResponse = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  message: string;
  error?: string;
  repo_id: string;
  revision: string;
  endpoint: string;
  local_dir: string;
  file_count: number;
  size: number;
  current_file?: string | null;
  current_file_index: number;
  current_file_progress: number;
  current_file_downloaded: number;
  current_file_size: number;
  files: ModelFileProgress[];
};

type ModelFileProgress = {
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  progress: number;
  downloaded: number;
  size: number;
};

type MergeVideoItem = {
  id: string;
  fileId?: string;
  filename: string;
  localUrl: string;
  info?: MediaInfo;
  status: 'uploading' | 'ready' | 'failed';
  error?: string;
};

type SynchronizedVideoItem = {
  id: string;
  filename: string;
  localUrl: string;
  duration: number;
  muted: boolean;
  status: 'loading' | 'ready' | 'failed';
};

type AudioSilenceSegment = {
  id: string;
  insertAt: string;
  duration: string;
};

type PageView = 'home' | 'clipper' | 'merge' | 'syncPlay' | 'calculator' | 'audio' | 'audioSpeed' | 'extractAudio' | 'downloader' | 'model' | 'watermark' | 'imageResize';

const pagePaths: Record<PageView, string> = {
  home: '/',
  clipper: '/video',
  merge: '/merge',
  syncPlay: '/sync-play',
  calculator: '/calculator',
  audio: '/audio',
  audioSpeed: '/audio-speed',
  extractAudio: '/extract-audio',
  downloader: '/downloader',
  model: '/model',
  watermark: '/watermark',
  imageResize: '/image-resize'
};

function pageFromPath(pathname: string): PageView {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/sync-play')) return 'syncPlay';
  if (pathname.startsWith('/merge')) return 'merge';
  if (pathname.startsWith('/calculator')) return 'calculator';
  if (pathname.startsWith('/extract-audio')) return 'extractAudio';
  if (pathname.startsWith('/audio-speed')) return 'audioSpeed';
  if (pathname.startsWith('/audio')) return 'audio';
  if (pathname.startsWith('/downloader')) return 'downloader';
  if (pathname.startsWith('/model')) return 'model';
  if (pathname.startsWith('/watermark')) return 'watermark';
  if (pathname.startsWith('/image-resize')) return 'imageResize';
  return 'clipper';
}

const fallbackFormats: FormatInfo[] = [
  { key: 'mp4', label: 'MP4 - H.264 + AAC', kind: 'video', extension: '.mp4', supports_audio: true },
  { key: 'mkv', label: 'MKV - H.264 + AAC', kind: 'video', extension: '.mkv', supports_audio: true },
  { key: 'mov', label: 'MOV - H.264 + AAC', kind: 'video', extension: '.mov', supports_audio: true },
  { key: 'webm', label: 'WebM - VP9 + Opus', kind: 'video', extension: '.webm', supports_audio: true },
  { key: 'avi', label: 'AVI - MPEG4 + MP3', kind: 'video', extension: '.avi', supports_audio: true },
  { key: 'gif', label: 'GIF - silent animation', kind: 'video', extension: '.gif', supports_audio: false },
  { key: 'mp3', label: 'MP3 - audio only', kind: 'audio', extension: '.mp3', supports_audio: true },
  { key: 'wav', label: 'WAV - audio only', kind: 'audio', extension: '.wav', supports_audio: true },
  { key: 'aac', label: 'AAC - audio only', kind: 'audio', extension: '.aac', supports_audio: true },
  { key: 'flac', label: 'FLAC - audio only', kind: 'audio', extension: '.flac', supports_audio: true },
  { key: 'ogg', label: 'OGG - Vorbis audio only', kind: 'audio', extension: '.ogg', supports_audio: true }
];

const fallbackFilters: FilterInfo[] = [
  { key: 'none', label: '原图', css: 'none' },
  { key: 'grayscale', label: '黑白', css: 'grayscale(100%)' },
  { key: 'sepia', label: '复古棕', css: 'sepia(80%)' },
  { key: 'vintage', label: '胶片', css: 'sepia(25%) contrast(108%) saturate(120%)' },
  { key: 'high-contrast', label: '高对比', css: 'contrast(135%) saturate(110%)' },
  { key: 'warm', label: '暖阳', css: 'sepia(16%) saturate(115%) hue-rotate(4deg)' },
  { key: 'cool', label: '冷调', css: 'hue-rotate(180deg) saturate(90%) brightness(105%)' },
  { key: 'invert', label: '反色', css: 'invert(100%)' }
];

function App() {
  const [activeView, setActiveView] = useState<PageView>(() => pageFromPath(window.location.pathname));
  const [formats, setFormats] = useState<FormatInfo[]>(fallbackFormats);
  const [filters, setFilters] = useState<FilterInfo[]>(fallbackFilters);
  const [fileId, setFileId] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [metadata, setMetadata] = useState<MediaInfo | null>(null);
  const [startTime, setStartTime] = useState('00:00.000');
  const [endTime, setEndTime] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [format, setFormat] = useState('mp4');
  const [scale, setScale] = useState(1);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [exportRange, setExportRange] = useState<'trim' | 'full'>('trim');
  const [filter, setFilter] = useState('none');
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('拖入视频或点击选择文件');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isThumbnailing, setIsThumbnailing] = useState(false);
  const [zoomRange, setZoomRange] = useState({ start: 0, end: 0 });
  const [zoomHistory, setZoomHistory] = useState<Array<{ start: number; end: number }>>([]);
  const [inspectAudioInfo, setInspectAudioInfo] = useState<MediaInfo | null>(null);
  const [inspectAudioFileId, setInspectAudioFileId] = useState('');
  const [inspectAudioName, setInspectAudioName] = useState('');
  const [inspectAudioUrl, setInspectAudioUrl] = useState('');
  const [inspectAudioError, setInspectAudioError] = useState('');
  const [isInspectAudioUploading, setIsInspectAudioUploading] = useState(false);
  const [silenceSegments, setSilenceSegments] = useState<AudioSilenceSegment[]>(() => [createSilenceSegment()]);
  const [silenceFormat, setSilenceFormat] = useState('mp3');
  const [silenceProgress, setSilenceProgress] = useState(0);
  const [silenceStatus, setSilenceStatus] = useState('上传音频后即可插入静音');
  const [silenceDownloadUrl, setSilenceDownloadUrl] = useState('');
  const [silenceDownloadName, setSilenceDownloadName] = useState('');
  const [silenceError, setSilenceError] = useState('');
  const [isInsertingSilence, setIsInsertingSilence] = useState(false);
  const [trimStart, setTrimStart] = useState('00:00.000');
  const [trimEnd, setTrimEnd] = useState('');
  const [trimFormat, setTrimFormat] = useState('mp3');
  const [trimProgress, setTrimProgress] = useState(0);
  const [trimStatus, setTrimStatus] = useState('上传音频后即可裁剪导出');
  const [trimDownloadUrl, setTrimDownloadUrl] = useState('');
  const [trimDownloadName, setTrimDownloadName] = useState('');
  const [trimError, setTrimError] = useState('');
  const [isTrimmingAudio, setIsTrimmingAudio] = useState(false);
  const [audioInfo, setAudioInfo] = useState<MediaInfo | null>(null);
  const [audioFileId, setAudioFileId] = useState('');
  const [audioName, setAudioName] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFormat, setAudioFormat] = useState('mp3');
  const [audioStreamIndex, setAudioStreamIndex] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioStatus, setAudioStatus] = useState('上传视频文件后即可提取音频');
  const [audioDownloadUrl, setAudioDownloadUrl] = useState('');
  const [audioDownloadName, setAudioDownloadName] = useState('');
  const [audioError, setAudioError] = useState('');
  const [isAudioUploading, setIsAudioUploading] = useState(false);
  const [isAudioExtracting, setIsAudioExtracting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pollRef = useRef<number | null>(null);
  const audioPollRef = useRef<number | null>(null);
  const silencePollRef = useRef<number | null>(null);
  const trimPollRef = useRef<number | null>(null);

  const duration = metadata?.duration || videoRef.current?.duration || 0;
  const selectedFormat = useMemo(() => formats.find((item) => item.key === format) ?? fallbackFormats[0], [formats, format]);
  const selectedFilter = useMemo(() => filters.find((item) => item.key === filter) ?? fallbackFilters[0], [filters, filter]);
  const startSeconds = clamp(parseTimecode(startTime) ?? 0, 0, duration || 0);
  const endSeconds = clamp(parseTimecode(endTime) ?? duration, startSeconds + 0.05, duration || startSeconds + 0.05);
  const outputResolution = getScaledResolution(metadata, scale);
  const canExport = Boolean(fileId) && !isUploading && !isExporting;

  const navigate = (view: PageView) => {
    const path = pagePaths[view];
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setActiveView(view);
  };

  useEffect(() => {
    const onPopState = () => setActiveView(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    fetch('/api/formats')
      .then((response) => response.json())
      .then((data: FormatInfo[]) => {
        if (Array.isArray(data) && data.length > 0) setFormats(data);
      })
      .catch(() => setFormats(fallbackFormats));

    fetch('/api/filters')
      .then((response) => response.json())
      .then((data: FilterInfo[]) => {
        if (Array.isArray(data) && data.length > 0) setFilters(data);
      })
      .catch(() => setFilters(fallbackFilters));
  }, []);

  useEffect(() => {
    const isAudioOnly = selectedFormat.kind === 'audio';
    if (isAudioOnly || !selectedFormat.supports_audio) {
      setIncludeAudio(false);
    }
  }, [selectedFormat]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, fileUrl]);

  useEffect(() => {
    if (!fileId || !duration || zoomRange.end <= zoomRange.start) {
      setThumbnails([]);
      return;
    }

    let cancelled = false;
    setIsThumbnailing(true);
    fetch(`/api/uploads/${fileId}/thumbnails?count=10&start=${zoomRange.start}&end=${zoomRange.end}`)
      .then((response) => response.json())
      .then((payload: { thumbnails?: string[] }) => {
        if (!cancelled) setThumbnails(payload.thumbnails || []);
      })
      .catch(() => {
        if (!cancelled) setThumbnails([]);
      })
      .finally(() => {
        if (!cancelled) setIsThumbnailing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileId, duration, zoomRange.start, zoomRange.end]);

  useEffect(() => {
    return () => {
      if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl);
      stopPolling();
    };
  }, [fileUrl]);

  useEffect(() => {
    return () => {
      if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
      stopAudioPolling();
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (inspectAudioUrl.startsWith('blob:')) URL.revokeObjectURL(inspectAudioUrl);
      stopSilencePolling();
      stopTrimPolling();
    };
  }, [inspectAudioUrl]);

  const applyUploadPayload = (payload: UploadResponse, previewUrl: string) => {
    if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl);
    const nextDuration = payload.info.duration || 0;
    setFileId(payload.file_id);
    setFileName(payload.filename);
    setFileUrl(previewUrl);
    setMetadata(payload.info);
    setVideoOrientation(
      payload.info.width && payload.info.height && payload.info.height > payload.info.width
        ? 'portrait'
        : 'landscape'
    );
    setStartTime('00:00.000');
    setEndTime(nextDuration ? formatTime(nextDuration) : '');
    setCurrentTime(0);
    setZoomRange({ start: 0, end: nextDuration });
    setZoomHistory([]);
    setThumbnails([]);
    setStatus('视频已就绪，可以开始裁剪');
    setError('');
    setDownloadUrl('');
    setDownloadName('');
    setProgress(0);
  };

  const uploadFile = async (file: File) => {
    stopPolling();
    setError('');
    setDownloadUrl('');
    setDownloadName('');
    setProgress(0);
    setIsUploading(true);
    setStatus('正在上传并读取视频信息...');

    const localUrl = URL.createObjectURL(file);
    const body = new FormData();
    body.append('video', file);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body });
      const payload = (await response.json()) as UploadResponse | { error: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error : '上传失败');
      if (!('file_id' in payload)) throw new Error('上传响应格式不正确');
      applyUploadPayload(payload, localUrl);
    } catch (err) {
      URL.revokeObjectURL(localUrl);
      setError(err instanceof Error ? err.message : '上传失败');
      setStatus('上传失败');
      setFileId('');
      setMetadata(null);
    } finally {
      setIsUploading(false);
    }
  };

  const startExport = async () => {
    if (!fileId) return;
    stopPolling();
    setError('');
    setDownloadUrl('');
    setDownloadName('');
    setProgress(0);
    setIsExporting(true);
    setStatus('正在创建转码任务...');

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: fileId,
          start: startTime,
          end: endTime,
          range: exportRange,
          format,
          scale,
          filter,
          include_audio: includeAudio
        })
      });
      const payload = (await response.json()) as { job_id: string } | { error: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error : '任务创建失败');
      if (!('job_id' in payload)) throw new Error('任务响应格式不正确');
      pollJob(payload.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '任务创建失败');
      setStatus('处理失败');
      setIsExporting(false);
    }
  };

  const pollJob = (jobId: string) => {
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = (await response.json()) as JobResponse | { error: string };
        if (!response.ok) throw new Error('error' in job ? job.error : '读取任务失败');
        const nextJob = job as JobResponse;
        setProgress(nextJob.progress || 0);
        setStatus(nextJob.message || '处理中...');

        if (nextJob.status === 'done') {
          stopPolling();
          setProgress(100);
          setStatus('处理完成，可以下载');
          setDownloadUrl(nextJob.download_url || '');
          setDownloadName(nextJob.output_name || '');
          setIsExporting(false);
        }

        if (nextJob.status === 'failed') {
          stopPolling();
          setError(nextJob.error || '处理失败');
          setStatus('处理失败');
          setIsExporting(false);
        }
      } catch (err) {
        stopPolling();
        setError(err instanceof Error ? err.message : '读取任务失败');
        setIsExporting(false);
      }
    }, 700);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const stopAudioPolling = () => {
    if (audioPollRef.current) {
      window.clearInterval(audioPollRef.current);
      audioPollRef.current = null;
    }
  };

  const stopSilencePolling = () => {
    if (silencePollRef.current) {
      window.clearInterval(silencePollRef.current);
      silencePollRef.current = null;
    }
  };

  const stopTrimPolling = () => {
    if (trimPollRef.current) {
      window.clearInterval(trimPollRef.current);
      trimPollRef.current = null;
    }
  };

  const startTrimAudio = async () => {
    if (!inspectAudioFileId) return;
    stopTrimPolling();
    setTrimError('');
    setTrimDownloadUrl('');
    setTrimDownloadName('');
    setTrimProgress(0);
    setIsTrimmingAudio(true);
    setTrimStatus('正在创建音频裁剪任务...');

    try {
      const response = await fetch('/api/audio/trim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: inspectAudioFileId,
          start: trimStart,
          end: trimEnd,
          format: trimFormat
        })
      });
      const payload = (await response.json()) as { job_id: string } | { error: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error : '任务创建失败');
      if (!('job_id' in payload)) throw new Error('任务响应格式不正确');
      pollTrimJob(payload.job_id);
    } catch (err) {
      setTrimError(err instanceof Error ? err.message : '任务创建失败');
      setTrimStatus('音频裁剪失败');
      setIsTrimmingAudio(false);
    }
  };

  const pollTrimJob = (jobId: string) => {
    trimPollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = (await response.json()) as JobResponse | { error: string };
        if (!response.ok) throw new Error('error' in job ? job.error : '读取任务失败');
        const nextJob = job as JobResponse;
        setTrimProgress(nextJob.progress || 0);
        setTrimStatus(nextJob.message || '正在裁剪音频...');

        if (nextJob.status === 'done') {
          stopTrimPolling();
          setTrimProgress(100);
          setTrimStatus('音频裁剪完成，可以下载');
          setTrimDownloadUrl(nextJob.download_url || '');
          setTrimDownloadName(nextJob.output_name || '');
          setIsTrimmingAudio(false);
        }

        if (nextJob.status === 'failed') {
          stopTrimPolling();
          setTrimError(nextJob.error || '音频裁剪失败');
          setTrimStatus('音频裁剪失败');
          setIsTrimmingAudio(false);
        }
      } catch (err) {
        stopTrimPolling();
        setTrimError(err instanceof Error ? err.message : '读取任务失败');
        setTrimStatus('音频裁剪失败');
        setIsTrimmingAudio(false);
      }
    }, 700);
  };

  const startInsertSilence = async () => {
    if (!inspectAudioFileId) return;
    stopSilencePolling();
    setSilenceError('');
    setSilenceDownloadUrl('');
    setSilenceDownloadName('');
    setSilenceProgress(0);
    setIsInsertingSilence(true);
    setSilenceStatus('正在创建静音插入任务...');

    try {
      const response = await fetch('/api/audio/silence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: inspectAudioFileId,
          segments: silenceSegments.map((segment) => ({
            insert_at: segment.insertAt,
            duration: segment.duration
          })),
          format: silenceFormat
        })
      });
      const payload = (await response.json()) as { job_id: string } | { error: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error : '任务创建失败');
      if (!('job_id' in payload)) throw new Error('任务响应格式不正确');
      pollSilenceJob(payload.job_id);
    } catch (err) {
      setSilenceError(err instanceof Error ? err.message : '任务创建失败');
      setSilenceStatus('静音插入失败');
      setIsInsertingSilence(false);
    }
  };

  const pollSilenceJob = (jobId: string) => {
    silencePollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = (await response.json()) as JobResponse | { error: string };
        if (!response.ok) throw new Error('error' in job ? job.error : '读取任务失败');
        const nextJob = job as JobResponse;
        setSilenceProgress(nextJob.progress || 0);
        setSilenceStatus(nextJob.message || '正在插入静音...');

        if (nextJob.status === 'done') {
          stopSilencePolling();
          setSilenceProgress(100);
          setSilenceStatus('静音插入完成，可以下载');
          setSilenceDownloadUrl(nextJob.download_url || '');
          setSilenceDownloadName(nextJob.output_name || '');
          setIsInsertingSilence(false);
        }

        if (nextJob.status === 'failed') {
          stopSilencePolling();
          setSilenceError(nextJob.error || '静音插入失败');
          setSilenceStatus('静音插入失败');
          setIsInsertingSilence(false);
        }
      } catch (err) {
        stopSilencePolling();
        setSilenceError(err instanceof Error ? err.message : '读取任务失败');
        setSilenceStatus('静音插入失败');
        setIsInsertingSilence(false);
      }
    }, 700);
  };

  const startAudioExtract = async () => {
    if (!audioFileId) return;
    stopAudioPolling();
    setAudioError('');
    setAudioDownloadUrl('');
    setAudioDownloadName('');
    setAudioProgress(0);
    setIsAudioExtracting(true);
    setAudioStatus('正在创建音频提取任务...');

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: audioFileId,
          range: 'full',
          format: audioFormat,
          include_audio: true,
          audio_stream_index: audioStreamIndex
        })
      });
      const payload = (await response.json()) as { job_id: string } | { error: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error : '任务创建失败');
      if (!('job_id' in payload)) throw new Error('任务响应格式不正确');
      pollAudioJob(payload.job_id);
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : '任务创建失败');
      setAudioStatus('音频提取失败');
      setIsAudioExtracting(false);
    }
  };

  const pollAudioJob = (jobId: string) => {
    audioPollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = (await response.json()) as JobResponse | { error: string };
        if (!response.ok) throw new Error('error' in job ? job.error : '读取任务失败');
        const nextJob = job as JobResponse;
        setAudioProgress(nextJob.progress || 0);
        setAudioStatus(nextJob.message || '正在提取音频...');

        if (nextJob.status === 'done') {
          stopAudioPolling();
          setAudioProgress(100);
          setAudioStatus('音频提取完成，可以下载');
          setAudioDownloadUrl(nextJob.download_url || '');
          setAudioDownloadName(nextJob.output_name || '');
          setIsAudioExtracting(false);
        }

        if (nextJob.status === 'failed') {
          stopAudioPolling();
          setAudioError(nextJob.error || '音频提取失败');
          setAudioStatus('音频提取失败');
          setIsAudioExtracting(false);
        }
      } catch (err) {
        stopAudioPolling();
        setAudioError(err instanceof Error ? err.message : '读取任务失败');
        setAudioStatus('音频提取失败');
        setIsAudioExtracting(false);
      }
    }, 700);
  };

  const reset = () => {
    stopPolling();
    if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl);
    setFileId('');
    setFileName('');
    setFileUrl('');
    setMetadata(null);
    setStartTime('00:00.000');
    setEndTime('');
    setCurrentTime(0);
    setProgress(0);
    setStatus('拖入视频或点击选择文件');
    setError('');
    setDownloadUrl('');
    setDownloadName('');
    setIsExporting(false);
    setIsPlaying(false);
    setThumbnails([]);
    setZoomRange({ start: 0, end: 0 });
    setZoomHistory([]);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const end = parseTimecode(endTime) ?? video.duration;
      const start = parseTimecode(startTime) ?? 0;
      if (video.currentTime >= end || video.currentTime < start) video.currentTime = start;
      video.playbackRate = playbackRate;
      void video.play();
    } else {
      video.pause();
    }
  };

  const seekTo = (time: number) => {
    const nextTime = clamp(time, 0, duration || time);
    if (videoRef.current) videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const updateStart = (seconds: number) => {
    const next = clamp(seconds, 0, Math.max(0, endSeconds - 0.05));
    setStartTime(formatTime(next));
    seekTo(next);
  };

  const updateEnd = (seconds: number) => {
    const next = clamp(seconds, Math.min(duration, startSeconds + 0.05), duration);
    setEndTime(formatTime(next));
    seekTo(next);
  };

  const stepStart = (amount: number) => updateStart(startSeconds + amount);
  const stepEnd = (amount: number) => updateEnd(endSeconds + amount);

  const zoomIntoSelection = () => {
    if (!duration || endSeconds <= startSeconds) return;
    setZoomHistory((prev) => [...prev, zoomRange]);
    setZoomRange({ start: startSeconds, end: endSeconds });
  };

  const zoomBack = () => {
    setZoomHistory((prev) => {
      const next = [...prev];
      const last = next.pop();
      if (last) setZoomRange(last);
      return next;
    });
  };

  const showHeaderDetails = activeView !== 'home';

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon"><Scissors size={23} /></div>
          <div>
            <h1>Web Video Clipper</h1>
            {showHeaderDetails && (
              <p>Python + FFmpeg 后端，多格式本地视频裁剪</p>
            )}
          </div>
        </div>
        {showHeaderDetails && (
          <div className="header-actions">
            <button type="button" onClick={() => navigate('home')}>
              <Layers size={15} /> 首页
            </button>
            <button type="button" className={activeView === 'clipper' ? 'active' : ''} onClick={() => navigate('clipper')}>
              <Scissors size={15} /> 裁剪工具
            </button>
            <button type="button" className={activeView === 'merge' ? 'active' : ''} onClick={() => navigate('merge')}>
              <Layers size={15} /> 视频合并
            </button>
            <button type="button" className={activeView === 'syncPlay' ? 'active' : ''} onClick={() => navigate('syncPlay')}>
              <Play size={15} /> 同步播放
            </button>
            <button type="button" className={activeView === 'calculator' ? 'active' : ''} onClick={() => navigate('calculator')}>
              <Calculator size={15} /> 比例计算器
            </button>
            <button type="button" className={activeView === 'audio' ? 'active' : ''} onClick={() => navigate('audio')}>
              <Music size={15} /> 音频信息
            </button>
            <button type="button" className={activeView === 'extractAudio' ? 'active' : ''} onClick={() => navigate('extractAudio')}>
              <Music size={15} /> 音频提取
            </button>
            <button type="button" className={activeView === 'audioSpeed' ? 'active' : ''} onClick={() => navigate('audioSpeed')}>
              <SlidersHorizontal size={15} /> 音频变速
            </button>
            <button type="button" className={activeView === 'watermark' ? 'active' : ''} onClick={() => navigate('watermark')}>
              <ImageIcon size={15} /> 图片去水印
            </button>
            <button type="button" className={activeView === 'imageResize' ? 'active' : ''} onClick={() => navigate('imageResize')}>
              <ImageIcon size={15} /> 图片改尺寸
            </button>
            <button type="button" className={activeView === 'downloader' ? 'active' : ''} onClick={() => navigate('downloader')}>
              <CloudDownload size={15} /> 视频下载
            </button>
            <button type="button" className={activeView === 'model' ? 'active' : ''} onClick={() => navigate('model')}>
              <CloudDownload size={15} /> 模型下载
            </button>
          </div>
        )}
        {showHeaderDetails && (
          <div className="header-badges">
            <span><ShieldCheck size={15} /> 本地处理</span>
            <span><Video size={15} /> {formats.length} 种格式</span>
          </div>
        )}
      </header>

      {activeView === 'home' ? (
        <HomePage onNavigate={navigate} />
      ) : activeView === 'calculator' ? (
        <RatioCalculator metadata={metadata} onBack={() => navigate('clipper')} />
      ) : activeView === 'merge' ? (
        <MergePage />
      ) : activeView === 'syncPlay' ? (
        <SynchronizedPlaybackPage />
      ) : activeView === 'watermark' ? (
        <WatermarkPage />
      ) : activeView === 'imageResize' ? (
        <ImageResizePage />
      ) : activeView === 'model' ? (
        <ModelDownloader />
      ) : activeView === 'downloader' ? (
        <VideoDownloader />
      ) : activeView === 'audioSpeed' ? (
        <AudioSpeedPage audioFormats={formats.filter((item) => item.kind === 'audio')} />
      ) : activeView === 'audio' ? (
        <AudioInspector
          audioFileId={inspectAudioFileId}
          audioName={inspectAudioName}
          audioUrl={inspectAudioUrl}
          audioInfo={inspectAudioInfo}
          audioFormats={formats.filter((item) => item.kind === 'audio')}
          silenceFormat={silenceFormat}
          silenceSegments={silenceSegments}
          silenceProgress={silenceProgress}
          silenceStatus={silenceStatus}
          silenceDownloadUrl={silenceDownloadUrl}
          silenceDownloadName={silenceDownloadName}
          silenceError={silenceError}
          trimStart={trimStart}
          trimEnd={trimEnd}
          trimFormat={trimFormat}
          trimProgress={trimProgress}
          trimStatus={trimStatus}
          trimDownloadUrl={trimDownloadUrl}
          trimDownloadName={trimDownloadName}
          trimError={trimError}
          error={inspectAudioError}
          isUploading={isInspectAudioUploading}
          isInsertingSilence={isInsertingSilence}
          isTrimmingAudio={isTrimmingAudio}
          onSilenceFormatChange={setSilenceFormat}
          onSilenceSegmentsChange={setSilenceSegments}
          onInsertSilence={() => void startInsertSilence()}
          onTrimStartChange={setTrimStart}
          onTrimEndChange={setTrimEnd}
          onTrimFormatChange={setTrimFormat}
          onTrimAudio={() => void startTrimAudio()}
          onUpload={async (file) => {
            stopSilencePolling();
            stopTrimPolling();
            setInspectAudioError('');
            setInspectAudioInfo(null);
            setInspectAudioFileId('');
            setInspectAudioName(file.name);
            setSilenceError('');
            setSilenceDownloadUrl('');
            setSilenceDownloadName('');
            setSilenceProgress(0);
            setSilenceStatus('正在上传并读取音频信息...');
            setSilenceSegments([createSilenceSegment()]);
            setTrimError('');
            setTrimDownloadUrl('');
            setTrimDownloadName('');
            setTrimProgress(0);
            setTrimStart('00:00.000');
            setTrimEnd('');
            setTrimStatus('正在上传并读取音频信息...');
            if (inspectAudioUrl.startsWith('blob:')) URL.revokeObjectURL(inspectAudioUrl);
            const previewUrl = URL.createObjectURL(file);
            setInspectAudioUrl(previewUrl);
            setIsInspectAudioUploading(true);
            const body = new FormData();
            body.append('audio', file);
            try {
              const response = await fetch('/api/audio', { method: 'POST', body });
              const payload = (await response.json()) as UploadResponse | { error: string };
              if (!response.ok) throw new Error('error' in payload ? payload.error : '读取音频失败');
              if (!('info' in payload)) throw new Error('音频响应格式不正确');
              setInspectAudioName(payload.filename);
              setInspectAudioInfo(payload.info);
              setInspectAudioFileId(payload.file_id);
              setTrimEnd(payload.info.duration ? formatTime(payload.info.duration) : '');
              setTrimStatus(payload.info.audio_codec ? '音频已就绪，可以裁剪导出' : '未检测到音轨，无法裁剪');
              setSilenceStatus(payload.info.audio_codec ? '音频已就绪，可以插入静音' : '未检测到音轨，无法插入静音');
            } catch (err) {
              setInspectAudioError(err instanceof Error ? err.message : '读取音频失败');
              setInspectAudioFileId('');
              setInspectAudioUrl('');
              setTrimStatus('音频读取失败');
              setSilenceStatus('音频读取失败');
            } finally {
              setIsInspectAudioUploading(false);
            }
          }}
        />
      ) : activeView === 'extractAudio' ? (
        <ExtractAudioPage
          audioName={audioName}
          audioUrl={audioUrl}
          audioInfo={audioInfo}
          audioFormats={formats.filter((item) => item.kind === 'audio')}
          audioFormat={audioFormat}
          audioStreamIndex={audioStreamIndex}
          audioProgress={audioProgress}
          audioStatus={audioStatus}
          audioDownloadUrl={audioDownloadUrl}
          audioDownloadName={audioDownloadName}
          error={audioError}
          isUploading={isAudioUploading}
          isExtracting={isAudioExtracting}
          onFormatChange={setAudioFormat}
          onAudioStreamChange={setAudioStreamIndex}
          onExtract={() => void startAudioExtract()}
          onUpload={async (file) => {
            stopAudioPolling();
            setAudioError('');
            setAudioInfo(null);
            setAudioStreamIndex(0);
            setAudioFileId('');
            setAudioName(file.name);
            setAudioDownloadUrl('');
            setAudioDownloadName('');
            setAudioProgress(0);
            setAudioStatus('正在上传并读取视频信息...');
            if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
            const previewUrl = URL.createObjectURL(file);
            setAudioUrl(previewUrl);
            setIsAudioUploading(true);
            const body = new FormData();
            body.append('video', file);
            try {
              const response = await fetch('/api/extract-audio/upload', { method: 'POST', body });
              const payload = (await response.json()) as UploadResponse | { error: string };
              if (!response.ok) throw new Error('error' in payload ? payload.error : '读取视频失败');
              if (!('file_id' in payload)) throw new Error('视频响应格式不正确');
              setAudioFileId(payload.file_id);
              setAudioName(payload.filename);
              setAudioInfo(payload.info);
              setAudioStatus(payload.info.audio_codec ? '视频已就绪，可以提取音频' : '未检测到音轨，提取时可能会失败');
            } catch (err) {
              setAudioError(err instanceof Error ? err.message : '读取视频失败');
              setAudioUrl('');
              setAudioStatus('视频读取失败');
            } finally {
              setIsAudioUploading(false);
            }
          }}
        />
      ) : (
        <main className="main-grid">
          <section className="left-column">
            {!fileUrl ? (
              <UploadCard
                onPick={() => inputRef.current?.click()}
                onFile={uploadFile}
                isBusy={isUploading}
              />
            ) : (
              <div className="video-card">
                <div className={`video-frame ${videoOrientation === 'portrait' ? 'is-portrait' : 'is-landscape'}`}>
                  <video
                    ref={videoRef}
                    src={fileUrl}
                    controls={false}
                    playsInline
                    onClick={togglePlay}
                    style={{
                      filter: selectedFilter.css,
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      objectPosition: 'center'
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={(event) => {
                      const nextTime = event.currentTarget.currentTime;
                      const start = parseTimecode(startTime) ?? 0;
                      const end = parseTimecode(endTime) ?? event.currentTarget.duration;
                      if (!event.currentTarget.paused && nextTime >= end) {
                        event.currentTarget.currentTime = start;
                        setCurrentTime(start);
                        return;
                      }
                      setCurrentTime(nextTime);
                    }}
                    onLoadedMetadata={(event) => {
                      setVideoOrientation(
                        event.currentTarget.videoHeight > event.currentTarget.videoWidth
                          ? 'portrait'
                          : 'landscape'
                      );
                      if (!endTime) setEndTime(formatTime(event.currentTarget.duration));
                    }}
                  />
                  <div className="video-toolbar">
                    <button type="button" onClick={togglePlay}>{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
                    <span>{fileName}</span>
                    <strong>{playbackRate.toFixed(1)}x</strong>
                  </div>
                </div>

                <div className="timeline-card">
                  <TrimTimeline
                    duration={duration}
                    currentTime={currentTime}
                    startSeconds={startSeconds}
                    endSeconds={endSeconds}
                    thumbnails={thumbnails}
                    isThumbnailing={isThumbnailing}
                    zoomRange={zoomRange}
                    zoomHistory={zoomHistory}
                    onStartChange={updateStart}
                    onEndChange={updateEnd}
                    onSeek={seekTo}
                    onZoom={zoomIntoSelection}
                    onZoomBack={zoomBack}
                  />
                  <AudioWaveform
                    src={fileUrl}
                    mediaRef={videoRef}
                    duration={duration}
                    visibleRange={zoomRange}
                    peaksUrl={fileId ? `/api/uploads/${fileId}/waveform` : undefined}
                    title="音频波形"
                    ariaLabel="视频播放位置"
                  />
                  <div className="time-row">
                    <label>
                      <span>起点</span>
                      <input value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                    </label>
                    <label>
                      <span>终点</span>
                      <input value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                    </label>
                  </div>
                  <div className="mark-actions">
                    <button type="button" onClick={() => updateStart(videoRef.current?.currentTime || 0)}><Clock3 size={16} /> 当前设为起点</button>
                    <button type="button" onClick={() => updateEnd(videoRef.current?.currentTime || 0)}><Clock3 size={16} /> 当前设为终点</button>
                  </div>
                  <div className="step-grid">
                    <MicroStepper title="起点微调" value={formatTime(startSeconds)} steps={[-1, -0.1, 0.05, 0.5]} onStep={stepStart} />
                    <MicroStepper title="终点微调" value={formatTime(endSeconds)} steps={[-0.5, -0.05, 0.1, 1]} onStep={stepEnd} />
                  </div>
                </div>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
                event.currentTarget.value = '';
              }}
            />

            <section className="panel info-panel">
              <div className="panel-title">
                <FileVideo size={18} />
                <h2>视频信息</h2>
              </div>
              <div className="info-grid">
                <InfoItem label="文件名" value={fileName || '-'} />
                <InfoItem label="原始时长" value={metadata?.duration ? formatTime(metadata.duration, false) : '-'} />
                <InfoItem label="原始分辨率" value={metadata?.resolution || '-'} />
                <InfoItem label="视频编码" value={metadata?.video_codec || '-'} />
                <InfoItem label="音频编码" value={metadata?.audio_codec || '无'} />
                <InfoItem label="帧率" value={metadata?.fps ? `${metadata.fps} FPS` : '-'} />
                <InfoItem label="总帧数" value={metadata?.frame_count ? String(metadata.frame_count) : '-'} />
                <InfoItem label="文件大小" value={metadata?.size ? formatSize(metadata.size) : '-'} />
              </div>
            </section>
          </section>

          <aside className="right-column">
            <section className="panel export-panel">
              <div className="panel-title">
                <Layers size={18} />
                <h2>导出设置</h2>
                {fileId && <button className="ghost-icon" type="button" onClick={reset} title="重新选择"><Trash2 size={16} /></button>}
              </div>

              <label className="field">
                <span>导出格式</span>
                <select value={format} onChange={(event) => setFormat(event.target.value)}>
                  {formats.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>

              <div className="field">
                <span>导出范围</span>
                <div className="segmented-control">
                  <button type="button" className={exportRange === 'trim' ? 'active' : ''} onClick={() => setExportRange('trim')}>
                    选中区间
                  </button>
                  <button type="button" className={exportRange === 'full' ? 'active' : ''} onClick={() => setExportRange('full')}>
                    完整视频
                  </button>
                </div>
              </div>

              <div className="field">
                <span>播放速度</span>
                <div className="segmented-control four">
                  {[0.5, 1, 1.5, 2].map((item) => (
                    <button key={item} type="button" className={playbackRate === item ? 'active' : ''} onClick={() => setPlaybackRate(item)}>
                      {item.toFixed(1)}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>分辨率缩放</span>
                <div className="scale-grid">
                  {[1, 0.75, 0.5, 0.25].map((item) => (
                    <button key={item} type="button" className={scale === item ? 'active' : ''} onClick={() => setScale(item)}>
                      <strong>{Math.round(item * 100)}%</strong>
                      <small>{metadata ? getScaledResolution(metadata, item) : '等待视频'}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>创意滤镜</span>
                <div className="filter-list">
                  {filters.map((item) => (
                    <button key={item.key} type="button" className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>
                      <Wand2 size={14} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className={`toggle-card ${selectedFormat.kind === 'audio' || !selectedFormat.supports_audio ? 'disabled' : ''}`}>
                <span><Music size={17} /> 保留视频音频</span>
                <input
                  type="checkbox"
                  checked={includeAudio}
                  disabled={selectedFormat.kind === 'audio' || !selectedFormat.supports_audio}
                  onChange={(event) => setIncludeAudio(event.target.checked)}
                />
              </label>

              <div className="summary-box">
                <span>预计输出</span>
                <strong>{selectedFormat.extension.toUpperCase().replace('.', '')}</strong>
                <span>{selectedFormat.kind === 'audio' ? '音频文件' : outputResolution || '选择视频后计算分辨率'}</span>
                <span>{exportRange === 'trim' ? `区间 ${formatTime(Math.max(0, endSeconds - startSeconds), false)}` : '完整视频'}</span>
              </div>

              {error && (
                <div className="error-box">
                  <AlertCircle size={17} />
                  <span>{error}</span>
                </div>
              )}

              <button className="primary-button" type="button" disabled={!canExport} onClick={() => void startExport()}>
                {isExporting ? <Loader2 size={18} className="spin" /> : <Scissors size={18} />}
                {isExporting ? '正在处理...' : '立即裁剪并转换'}
              </button>

              <div className="progress-panel">
                <div>
                  <span>{status}</span>
                  <strong>{Math.round(progress)}%</strong>
                </div>
                <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
              </div>

              {downloadUrl && (
                <a className="download-button" href={downloadUrl} download={downloadName}>
                  <Download size={18} />
                  下载处理完成的文件
                </a>
              )}
              {downloadUrl && selectedFormat.kind === 'audio' && (
                <AudioResultPreview src={downloadUrl} name={downloadName || '处理后的音频'} />
              )}
            </section>

            <section className="panel helper-panel">
              <div className="panel-title">
                <SlidersHorizontal size={18} />
                <h2>使用提示</h2>
              </div>
              <div className="tip-list">
                <p>可以拖动时间轴左右手柄，也可以直接输入秒数、<code>mm:ss</code> 或 <code>hh:mm:ss</code>。</p>
                <p>点击“放大选区”后，时间轴会聚焦到当前片段，便于精细调整。</p>
                <p>滤镜会同时作用于预览和最终导出；音频格式会只导出音轨。</p>
              </div>
            </section>
          </aside>
        </main>
      )}

      {showHeaderDetails && (
        <footer className="footer">
          <span>FFmpeg powered</span>
          <span>Local uploads are stored under runtime/</span>
          <button type="button" onClick={reset}><RotateCcw size={14} /> 重置</button>
        </footer>
      )}
    </div>
  );
}

function HomePage({ onNavigate }: { onNavigate: (view: PageView) => void }) {
  const tools: Array<{
    view: Exclude<PageView, 'home'>;
    title: string;
    description: string;
    category: string;
    icon: React.ComponentType<{ size?: number }>;
    featured?: boolean;
  }> = [
    { view: 'clipper', title: '视频裁剪', description: '截取片段、转换格式并调整画面。', category: '视频', icon: Scissors, featured: true },
    { view: 'merge', title: '视频合并', description: '按顺序拼接多个视频文件。', category: '视频', icon: Layers, featured: true },
    { view: 'syncPlay', title: '同步播放', description: '并排打开多个视频并同时播放。', category: '视频', icon: Play, featured: true },
    { view: 'extractAudio', title: '提取音频', description: '从视频中导出指定音轨。', category: '音频', icon: Music, featured: true },
    { view: 'audio', title: '音频编辑', description: '查看信息、裁剪并插入静音。', category: '音频', icon: SlidersHorizontal },
    { view: 'audioSpeed', title: '音频变速', description: '调整播放速度并导出新文件。', category: '音频', icon: Clock3 },
    { view: 'watermark', title: '图片去水印', description: '检测并处理图片中的水印。', category: '图片', icon: Wand2 },
    { view: 'imageResize', title: '图片改尺寸', description: '快速缩放图片并保持比例。', category: '图片', icon: ImageIcon },
    { view: 'calculator', title: '比例计算器', description: '计算画面比例与目标分辨率。', category: '辅助', icon: Calculator },
    { view: 'downloader', title: '视频下载', description: '从链接下载在线视频资源。', category: '下载', icon: CloudDownload },
    { view: 'model', title: '模型下载', description: '通过镜像下载 Hugging Face 模型。', category: '下载', icon: Database }
  ];

  return (
    <main className="home-page">
      <section className="tool-directory" aria-label="工具列表">
        <div className="tool-grid">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.view}
                type="button"
                className={`tool-entry${tool.featured ? ' featured' : ''}`}
                onClick={() => onNavigate(tool.view)}
              >
                <span className="tool-icon"><Icon size={22} /></span>
                <span className="tool-copy">
                  <small>{tool.category}</small>
                  <strong>{tool.title}</strong>
                  <span>{tool.description}</span>
                </span>
                <span className="tool-arrow" aria-hidden="true">→</span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function TrimTimeline({
  duration,
  currentTime,
  startSeconds,
  endSeconds,
  thumbnails,
  isThumbnailing,
  zoomRange,
  zoomHistory,
  onStartChange,
  onEndChange,
  onSeek,
  onZoom,
  onZoomBack
}: {
  duration: number;
  currentTime: number;
  startSeconds: number;
  endSeconds: number;
  thumbnails: string[];
  isThumbnailing: boolean;
  zoomRange: { start: number; end: number };
  zoomHistory: Array<{ start: number; end: number }>;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  onSeek: (value: number) => void;
  onZoom: () => void;
  onZoomBack: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = useState<'start' | 'end' | 'playhead' | null>(null);
  const minGap = 0.05;
  const visibleStart = clamp(zoomRange.start, 0, duration || 0);
  const visibleEnd = clamp(zoomRange.end || duration, visibleStart + minGap, duration || visibleStart + minGap);
  const visibleDuration = Math.max(minGap, visibleEnd - visibleStart);
  const playheadSeconds = clamp(currentTime || 0, 0, duration || 0);
  const zoomEpsilon = Math.max(0.001, visibleDuration * 0.0001);
  const canZoom = duration > 0
    && endSeconds - startSeconds >= minGap
    && (startSeconds > visibleStart + zoomEpsilon || endSeconds < visibleEnd - zoomEpsilon);

  const toPercent = (seconds: number) => clamp(((seconds - visibleStart) / visibleDuration) * 100, 0, 100);

  const timeFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return visibleStart;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return visibleStart + ratio * visibleDuration;
  };

  const applyDrag = (type: 'start' | 'end' | 'playhead', clientX: number) => {
    const pointerTime = timeFromPointer(clientX);
    if (type === 'start') {
      onStartChange(clamp(pointerTime, visibleStart, Math.max(visibleStart, endSeconds - minGap)));
      return;
    }
    if (type === 'end') {
      onEndChange(clamp(pointerTime, Math.min(visibleEnd, startSeconds + minGap), visibleEnd));
      return;
    }
    onSeek(clamp(pointerTime, startSeconds, endSeconds));
  };

  const handlePointerDown = (type: 'start' | 'end' | 'playhead') => (event: React.PointerEvent<HTMLElement>) => {
    if (!duration) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveDrag(type);
    event.currentTarget.setPointerCapture(event.pointerId);
    applyDrag(type, event.clientX);
  };

  const handlePointerMove = (type: 'start' | 'end' | 'playhead') => (event: React.PointerEvent<HTMLElement>) => {
    if (activeDrag !== type) return;
    event.preventDefault();
    applyDrag(type, event.clientX);
  };

  const stopDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!activeDrag) return;
    setActiveDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="trim-timeline">
      <div className="trim-timeline-head">
        <div>
          <span>裁剪区间</span>
          <strong>{formatTime(Math.max(0, endSeconds - startSeconds), false)}</strong>
        </div>
        <div>
          <span>当前显示</span>
          <strong>{formatTime(visibleStart, false)} - {formatTime(visibleEnd, false)}</strong>
        </div>
        <div>
          <span>当前位置</span>
          <strong>{formatTime(playheadSeconds)}</strong>
        </div>
      </div>

      <div
        ref={trackRef}
        className="trim-track"
        onPointerDown={handlePointerDown('playhead')}
        onPointerMove={handlePointerMove('playhead')}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="thumbnail-strip">
          {thumbnails.length > 0 ? (
            thumbnails.map((thumbnail, index) => <img key={`${thumbnail.slice(0, 32)}-${index}`} src={thumbnail} alt="" draggable={false} />)
          ) : (
            <span>{isThumbnailing ? '正在生成缩略图...' : '等待缩略图'}</span>
          )}
        </div>
        <div className="trim-rail" />
        <div className="trim-muted trim-muted-left" style={{ width: `${toPercent(startSeconds)}%` }} />
        <div className="trim-muted trim-muted-right" style={{ left: `${toPercent(endSeconds)}%` }} />
        <div className="trim-selection" style={{ left: `${toPercent(startSeconds)}%`, width: `${Math.max(0, toPercent(endSeconds) - toPercent(startSeconds))}%` }} />

        <button
          type="button"
          className={`trim-handle trim-handle-start ${activeDrag === 'start' ? 'active' : ''}`}
          style={{ left: `${toPercent(startSeconds)}%` }}
          onPointerDown={handlePointerDown('start')}
          onPointerMove={handlePointerMove('start')}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          aria-label="拖动调整起点"
        >
          <span />
          <em>{formatTime(startSeconds)}</em>
        </button>

        <button
          type="button"
          className={`trim-handle trim-handle-end ${activeDrag === 'end' ? 'active' : ''}`}
          style={{ left: `${toPercent(endSeconds)}%` }}
          onPointerDown={handlePointerDown('end')}
          onPointerMove={handlePointerMove('end')}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          aria-label="拖动调整终点"
        >
          <span />
          <em>{formatTime(endSeconds)}</em>
        </button>

        <button
          type="button"
          className={`trim-playhead ${activeDrag === 'playhead' ? 'active' : ''}`}
          style={{ left: `${toPercent(playheadSeconds)}%` }}
          onPointerDown={handlePointerDown('playhead')}
          onPointerMove={handlePointerMove('playhead')}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          aria-label="拖动预览位置"
        >
          <span />
        </button>
      </div>

      <div className="zoom-actions">
        <button type="button" disabled={!canZoom} onClick={onZoom}><ZoomIn size={15} /> 放大选区</button>
        <button type="button" disabled={zoomHistory.length === 0} onClick={onZoomBack}><RotateCcw size={15} /> 返回上一区间</button>
      </div>
    </div>
  );
}

function MicroStepper({ title, value, steps, onStep }: { title: string; value: string; steps: number[]; onStep: (amount: number) => void }) {
  return (
    <div className="micro-stepper">
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
      <div>
        {steps.map((step) => (
          <button key={step} type="button" onClick={() => onStep(step)}>
            {step > 0 ? `+${step}` : step}s
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadCard({
  onPick,
  onFile,
  isBusy
}: {
  onPick: () => void;
  onFile: (file: File) => void;
  isBusy: boolean;
}) {
  const [active, setActive] = useState(false);

  return (
    <div className={`upload-card ${active ? 'active' : ''}`} onDragEnter={(event) => { event.preventDefault(); setActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setActive(false)} onDrop={(event) => {
      event.preventDefault();
      setActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) onFile(file);
    }}>
      <button type="button" className="upload-main" onClick={onPick}>
        <span className="upload-icon">{isBusy ? <Loader2 className="spin" size={32} /> : <Upload size={32} />}</span>
        <strong>{isBusy ? '正在载入视频...' : '导入要裁剪的视频'}</strong>
        <small>拖放视频文件到这里，或点击浏览本地文件</small>
        <em>支持 MP4、WebM、MOV、MKV、AVI、FLV、WMV、TS 等格式</em>
      </button>
    </div>
  );
}

function SynchronizedPlaybackPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const itemsRef = useRef<SynchronizedVideoItem[]>([]);
  const animationRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);
  const clockRef = useRef({ mediaTime: 0, startedAt: 0 });
  const [items, setItems] = useState<SynchronizedVideoItem[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const readyItems = useMemo(() => items.filter((item) => item.status === 'ready'), [items]);
  const maxDuration = useMemo(
    () => readyItems.reduce((maximum, item) => Math.max(maximum, item.duration), 0),
    [readyItems]
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.localUrl));
    };
  }, []);

  const stopAnimation = () => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const pauseAll = () => {
    if (isPlaying) {
      const elapsed = (performance.now() - clockRef.current.startedAt) / 1000;
      const nextTime = Math.min(maxDuration, clockRef.current.mediaTime + elapsed);
      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
    }
    stopAnimation();
    videoRefs.current.forEach((video) => video.pause());
    setIsPlaying(false);
  };

  const setAllCurrentTimes = (nextTime: number) => {
    const safeTime = Math.max(0, Math.min(maxDuration, nextTime));
    currentTimeRef.current = safeTime;
    setCurrentTime(safeTime);
    videoRefs.current.forEach((video) => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(safeTime, Math.max(0, video.duration - 0.01));
      }
    });
    if (isPlaying) {
      clockRef.current = { mediaTime: safeTime, startedAt: performance.now() };
    }
  };

  const runClock = () => {
    const tick = () => {
      const elapsed = (performance.now() - clockRef.current.startedAt) / 1000;
      const targetTime = Math.min(maxDuration, clockRef.current.mediaTime + elapsed);
      currentTimeRef.current = targetTime;
      setCurrentTime(targetTime);

      videoRefs.current.forEach((video) => {
        if (
          Number.isFinite(video.duration)
          && targetTime < video.duration - 0.03
          && Math.abs(video.currentTime - targetTime) > 0.16
        ) {
          video.currentTime = targetTime;
        }
      });

      if (targetTime >= maxDuration) {
        videoRefs.current.forEach((video) => video.pause());
        animationRef.current = null;
        setIsPlaying(false);
        return;
      }
      animationRef.current = window.requestAnimationFrame(tick);
    };
    stopAnimation();
    animationRef.current = window.requestAnimationFrame(tick);
  };

  const playAll = async () => {
    if (readyItems.length === 0 || maxDuration <= 0) return;
    let startAt = currentTimeRef.current;
    if (startAt >= maxDuration - 0.04) {
      startAt = 0;
      setAllCurrentTimes(0);
    }

    const playableVideos = readyItems
      .map((item) => videoRefs.current.get(item.id))
      .filter((video): video is HTMLVideoElement => video !== undefined && startAt < video.duration - 0.03);
    if (playableVideos.length === 0) return;

    playableVideos.forEach((video) => {
      video.currentTime = Math.min(startAt, Math.max(0, video.duration - 0.01));
    });
    clockRef.current = { mediaTime: startAt, startedAt: performance.now() };
    setIsPlaying(true);
    runClock();
    await Promise.allSettled(playableVideos.map((video) => video.play()));
  };

  const addFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => (
      file.size > 0
      && (file.type.startsWith('video/') || /\.(mp4|mkv|mov|avi|webm|flv|wmv|m4v|mpg|mpeg|3gp|ts|mts|m2ts|ogg|ogv)$/i.test(file.name))
    ));
    if (files.length === 0) return;
    pauseAll();
    const nextItems = files.map((file) => ({
      id: makeClientId(),
      filename: file.name,
      localUrl: URL.createObjectURL(file),
      duration: 0,
      muted: true,
      status: 'loading' as const
    }));
    setItems((previous) => [...previous, ...nextItems]);
  };

  const updateMetadata = (id: string, video: HTMLVideoElement) => {
    setItems((previous) => previous.map((item) => item.id === id
      ? { ...item, duration: Number.isFinite(video.duration) ? video.duration : 0, status: 'ready' }
      : item));
  };

  const markFailed = (id: string) => {
    setItems((previous) => previous.map((item) => item.id === id ? { ...item, status: 'failed' } : item));
  };

  const toggleMuted = (id: string) => {
    setItems((previous) => previous.map((item) => {
      if (item.id !== id) return item;
      const muted = !item.muted;
      const video = videoRefs.current.get(id);
      if (video) video.muted = muted;
      return { ...item, muted };
    }));
  };

  const removeItem = (id: string) => {
    pauseAll();
    setItems((previous) => {
      const target = previous.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.localUrl);
      return previous.filter((item) => item.id !== id);
    });
    videoRefs.current.delete(id);
  };

  const clearItems = () => {
    pauseAll();
    items.forEach((item) => URL.revokeObjectURL(item.localUrl));
    videoRefs.current.clear();
    setItems([]);
    currentTimeRef.current = 0;
    setCurrentTime(0);
  };

  return (
    <main className="sync-page">
      <section
        className={`sync-drop panel ${isDragActive ? 'active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragActive(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.flv,.wmv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.ogg,.ogv"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.currentTarget.value = '';
          }}
        />
        <span className="upload-icon"><Play size={32} /></span>
        <div>
          <h2>同时打开多个视频</h2>
          <p>一次选择多个文件，所有视频默认静音，并从同一时间点同步播放。</p>
        </div>
        <button type="button" className="sample-button" onClick={() => inputRef.current?.click()}>
          <Upload size={16} />
          {items.length > 0 ? '继续添加视频' : '选择多个视频'}
        </button>
      </section>

      {items.length > 0 && (
        <section className="sync-control panel">
          <div className="sync-control-main">
            <button
              type="button"
              className="sync-play-button"
              disabled={readyItems.length === 0}
              onClick={() => isPlaying ? pauseAll() : void playAll()}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              {isPlaying ? '全部暂停' : '开始播放'}
            </button>
            <div className="sync-timeline">
              <div>
                <strong>{formatTime(currentTime, false)}</strong>
                <span>/ {formatTime(maxDuration, false)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={maxDuration || 0}
                step="0.01"
                value={Math.min(currentTime, maxDuration)}
                disabled={maxDuration <= 0}
                aria-label="同步播放进度"
                onChange={(event) => setAllCurrentTimes(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="sync-control-meta">
            <span>{readyItems.length} 个视频已就绪</span>
            <span><VolumeX size={15} /> 默认全部静音</span>
            <button type="button" onClick={clearItems}><Trash2 size={15} /> 清空</button>
          </div>
        </section>
      )}

      {items.length === 0 ? (
        <section className="sync-empty panel">
          <FileVideo size={28} />
          <strong>还没有打开视频</strong>
          <span>可多选文件，也可以把多个视频直接拖到上方区域。</span>
        </section>
      ) : (
        <section className="sync-video-grid" aria-label="同步视频列表">
          {items.map((item, index) => (
            <article className={`sync-video-card panel ${item.status}`} key={item.id}>
              <div className="sync-video-frame">
                <video
                  ref={(element) => {
                    if (element) videoRefs.current.set(item.id, element);
                    else videoRefs.current.delete(item.id);
                  }}
                  src={item.localUrl}
                  muted={item.muted}
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(event) => updateMetadata(item.id, event.currentTarget)}
                  onError={() => markFailed(item.id)}
                />
                {item.status === 'loading' && <span className="sync-video-state"><Loader2 className="spin" size={18} /> 正在读取</span>}
                {item.status === 'failed' && <span className="sync-video-state error"><AlertCircle size={18} /> 无法播放</span>}
                <span className="sync-video-index">{index + 1}</span>
              </div>
              <div className="sync-video-info">
                <div>
                  <strong title={item.filename}>{item.filename}</strong>
                  <span>{item.duration ? formatTime(item.duration, false) : '读取时长中'}</span>
                </div>
                <div className="sync-video-actions">
                  <button
                    type="button"
                    className={item.muted ? '' : 'sound-on'}
                    disabled={item.status !== 'ready'}
                    onClick={() => toggleMuted(item.id)}
                    title={item.muted ? '打开这个视频的声音' : '将这个视频静音'}
                  >
                    {item.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                    {item.muted ? '打开声音' : '声音已开启'}
                  </button>
                  <button type="button" className="remove" onClick={() => removeItem(item.id)} title="移除视频">
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function MergePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);
  const itemsRef = useRef<MergeVideoItem[]>([]);
  const [items, setItems] = useState<MergeVideoItem[]>([]);
  const [active, setActive] = useState(false);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [isMerging, setIsMerging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('添加至少两个视频后即可合并');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');

  const readyItems = useMemo(() => items.filter((item) => item.status === 'ready' && item.fileId), [items]);
  const isUploading = items.some((item) => item.status === 'uploading');
  const canMerge = readyItems.length >= 2 && !isUploading && !isMerging;
  const totalDuration = readyItems.reduce((sum, item) => sum + (item.info?.duration || 0), 0);
  const outputResolution = readyItems[0]?.info?.resolution && readyItems[0].info?.resolution !== 'unknown'
    ? readyItems[0].info?.resolution
    : '-';

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      itemsRef.current.forEach((item) => {
        if (item.localUrl.startsWith('blob:')) URL.revokeObjectURL(item.localUrl);
      });
    };
  }, []);

  const stopMergePolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const addFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => file.size > 0);
    if (files.length === 0) return;

    stopMergePolling();
    setError('');
    setDownloadUrl('');
    setDownloadName('');
    setProgress(0);
    setStatus('正在上传并读取视频信息...');

    const queued = files.map((file) => ({
      file,
      item: {
        id: makeClientId(),
        filename: file.name,
        localUrl: URL.createObjectURL(file),
        status: 'uploading' as const
      }
    }));

    setItems((prev) => [...prev, ...queued.map(({ item }) => item)]);
    queued.forEach(({ file, item }) => {
      void uploadMergeVideo(file, item.id);
    });
  };

  const uploadMergeVideo = async (file: File, itemId: string) => {
    const body = new FormData();
    body.append('video', file);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body });
      const payload = await readJsonResponse<UploadResponse>(response, '上传视频失败');
      if (!payload.file_id) throw new Error('视频响应格式不正确');
      setItems((prev) => prev.map((item) => item.id === itemId
        ? {
          ...item,
          fileId: payload.file_id,
          filename: payload.filename,
          info: payload.info,
          status: 'ready',
          error: ''
        }
        : item));
      setStatus('视频已加入队列，可以继续添加或开始合并');
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传视频失败';
      setItems((prev) => prev.map((item) => item.id === itemId
        ? { ...item, status: 'failed', error: message }
        : item));
      setError(message);
      setStatus('部分视频上传失败');
    }
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.localUrl.startsWith('blob:')) URL.revokeObjectURL(target.localUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearItems = () => {
    stopMergePolling();
    items.forEach((item) => {
      if (item.localUrl.startsWith('blob:')) URL.revokeObjectURL(item.localUrl);
    });
    setItems([]);
    setProgress(0);
    setStatus('添加至少两个视频后即可合并');
    setError('');
    setDownloadUrl('');
    setDownloadName('');
    setIsMerging(false);
  };

  const startMerge = async () => {
    const fileIds = readyItems.map((item) => item.fileId).filter(Boolean) as string[];
    if (fileIds.length < 2) {
      setError('请至少添加两个可用视频。');
      return;
    }

    stopMergePolling();
    setError('');
    setDownloadUrl('');
    setDownloadName('');
    setProgress(0);
    setIsMerging(true);
    setStatus('正在创建合并任务...');

    try {
      const response = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_ids: fileIds,
          include_audio: includeAudio
        })
      });
      const payload = await readJsonResponse<{ job_id: string }>(response, '合并任务创建失败');
      if (!payload.job_id) throw new Error('合并任务响应格式不正确');
      pollMergeJob(payload.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '合并任务创建失败');
      setStatus('合并失败');
      setIsMerging(false);
    }
  };

  const pollMergeJob = (jobId: string) => {
    stopMergePolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const nextJob = await readJsonResponse<JobResponse>(response, '读取合并任务失败');
        setProgress(nextJob.progress || 0);
        setStatus(nextJob.message || '正在合并视频...');

        if (nextJob.status === 'done') {
          stopMergePolling();
          setProgress(100);
          setStatus('合并完成，可以下载');
          setDownloadUrl(nextJob.download_url || '');
          setDownloadName(nextJob.output_name || '');
          setIsMerging(false);
        }

        if (nextJob.status === 'failed') {
          stopMergePolling();
          setError(nextJob.error || '合并失败');
          setStatus('合并失败');
          setIsMerging(false);
        }
      } catch (err) {
        stopMergePolling();
        setError(err instanceof Error ? err.message : '读取合并任务失败');
        setStatus('合并失败');
        setIsMerging(false);
      }
    }, 700);
  };

  return (
    <main className="merge-page">
      <section
        className={`merge-drop panel ${active ? 'active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setActive(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.flv,.wmv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.ogg,.ogv"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.currentTarget.value = '';
          }}
        />
        <span className="upload-icon">{isUploading ? <Loader2 className="spin" size={32} /> : <Layers size={32} />}</span>
        <h2>{isUploading ? '正在读取视频...' : '导入多个视频并按顺序合并'}</h2>
        <p>一次选择多个视频，或分批追加。列表顺序就是最终合并顺序。</p>
        <button type="button" className="sample-button" onClick={() => inputRef.current?.click()} disabled={isUploading || isMerging}>
          <Upload size={16} />
          选择视频文件
        </button>
      </section>

      {error && (
        <div className="error-box merge-error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="merge-grid">
        <section className="panel merge-list-panel">
          <div className="panel-title">
            <FileVideo size={18} />
            <h2>合并队列</h2>
            {items.length > 0 && (
              <button className="ghost-link" type="button" onClick={clearItems}>清空</button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="merge-empty">还没有视频。添加两个或更多视频后就可以开始合并。</div>
          ) : (
            <div className="merge-list">
              {items.map((item, index) => (
                <div key={item.id} className={`merge-item ${item.status}`}>
                  <video src={item.localUrl} controls muted preload="metadata" />
                  <div className="merge-item-body">
                    <div className="merge-item-head">
                      <strong title={item.filename}>{index + 1}. {item.filename}</strong>
                      <span>{item.status === 'uploading' ? '读取中' : item.status === 'ready' ? '已就绪' : '失败'}</span>
                    </div>
                    <div className="merge-item-meta">
                      <span>{item.info?.duration ? formatTime(item.info.duration, false) : '-'}</span>
                      <span>{item.info?.resolution && item.info.resolution !== 'unknown' ? item.info.resolution : '-'}</span>
                      <span>{item.info?.audio_codec ? '含音频' : '无音轨'}</span>
                    </div>
                    {item.error && <small>{item.error}</small>}
                  </div>
                  <div className="merge-item-actions">
                    <button type="button" onClick={() => moveItem(item.id, -1)} disabled={index === 0 || isMerging}>上移</button>
                    <button type="button" onClick={() => moveItem(item.id, 1)} disabled={index === items.length - 1 || isMerging}>下移</button>
                    <button type="button" onClick={() => removeItem(item.id)} disabled={isMerging}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="panel merge-settings-panel">
          <div className="panel-title">
            <Download size={18} />
            <h2>合并设置</h2>
          </div>

          <div className="info-grid merge-summary-grid">
            <InfoItem label="可用视频" value={`${readyItems.length} 个`} />
            <InfoItem label="总时长" value={totalDuration ? formatTime(totalDuration, false) : '-'} />
            <InfoItem label="输出格式" value="MP4" />
            <InfoItem label="输出分辨率" value={outputResolution || '-'} />
          </div>

          <label className="toggle-card">
            <span><Music size={17} /> 保留音频</span>
            <input
              type="checkbox"
              checked={includeAudio}
              disabled={isMerging}
              onChange={(event) => setIncludeAudio(event.target.checked)}
            />
          </label>

          <div className="summary-box merge-summary-box">
            <span>合并说明</span>
            <strong>{readyItems.length >= 2 ? `${readyItems.length} 个视频` : '等待视频'}</strong>
            <span>输出使用第一个视频的分辨率，其他视频会等比缩放并补边。</span>
            <span>{includeAudio ? '无音轨片段会自动补静音。' : '最终视频不包含音频。'}</span>
          </div>

          <button className="primary-button" type="button" disabled={!canMerge} onClick={() => void startMerge()}>
            {isMerging ? <Loader2 size={18} className="spin" /> : <Layers size={18} />}
            {isMerging ? '正在合并...' : '开始合并视频'}
          </button>

          <div className="progress-panel">
            <div>
              <span>{status}</span>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
          </div>

          {downloadUrl && (
            <a className="download-button" href={downloadUrl} download={downloadName}>
              <Download size={18} />
              下载合并后的视频
            </a>
          )}
        </aside>
      </div>
    </main>
  );
}

const RATIO_PRESETS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
const CUSTOM_RATIO_KEY = 'custom';

type ParsedRatio = {
  width: number;
  height: number;
  value: number;
  label: string;
};

type ParsedResolution = {
  width: number;
  height: number;
  ratio: string;
  decimal: string;
};

function RatioCalculator({ metadata, onBack }: { metadata: MediaInfo | null; onBack: () => void }) {
  const [selectedRatio, setSelectedRatio] = useState(RATIO_PRESETS[0]);
  const [customRatioWidth, setCustomRatioWidth] = useState('2.35');
  const [customRatioHeight, setCustomRatioHeight] = useState('1');
  const [width, setWidth] = useState(metadata?.width ? String(metadata.width) : '1920');
  const [height, setHeight] = useState(metadata?.height ? String(metadata.height) : '1080');
  const [resolutionWidth, setResolutionWidth] = useState(metadata?.width ? String(metadata.width) : '1920');
  const [resolutionHeight, setResolutionHeight] = useState(metadata?.height ? String(metadata.height) : '1080');

  const presetRatio = parseRatioLabel(selectedRatio);
  const customRatio = parseRatioParts(customRatioWidth, customRatioHeight);
  const activeRatio = selectedRatio === CUSTOM_RATIO_KEY ? customRatio : presetRatio;
  const ratioValue = activeRatio?.value;
  const currentWidth = parsePositiveNumber(width);
  const currentHeight = parsePositiveNumber(height);
  const currentResolutionRatio = currentWidth && currentHeight ? simplifyRatio(currentWidth, currentHeight) : '';
  const parsedResolution = buildParsedResolution(resolutionWidth, resolutionHeight);

  useEffect(() => {
    if (metadata?.width && metadata?.height) {
      setResolutionWidth(String(metadata.width));
      setResolutionHeight(String(metadata.height));
    }
  }, [metadata?.width, metadata?.height]);

  const updateHeightForRatio = (nextRatioValue: number) => {
    const nextWidth = parsePositiveNumber(width);
    if (nextWidth) {
      setHeight(String(Math.round(nextWidth / nextRatioValue)));
    }
  };

  const selectPresetRatio = (item: string) => {
    const nextRatio = parseRatioLabel(item);
    setSelectedRatio(item);
    if (nextRatio) updateHeightForRatio(nextRatio.value);
  };

  const updateCustomRatio = (part: 'width' | 'height', value: string) => {
    const nextWidth = part === 'width' ? value : customRatioWidth;
    const nextHeight = part === 'height' ? value : customRatioHeight;
    setSelectedRatio(CUSTOM_RATIO_KEY);
    if (part === 'width') {
      setCustomRatioWidth(value);
    } else {
      setCustomRatioHeight(value);
    }

    const nextRatio = parseRatioParts(nextWidth, nextHeight);
    if (nextRatio) updateHeightForRatio(nextRatio.value);
  };

  const setWidthAndHeight = (value: string) => {
    setWidth(value);
    const nextWidth = parsePositiveNumber(value);
    if (nextWidth && ratioValue) {
      setHeight(String(Math.round(nextWidth / ratioValue)));
    }
  };

  const setHeightAndWidth = (value: string) => {
    setHeight(value);
    const nextHeight = parsePositiveNumber(value);
    if (nextHeight && ratioValue) {
      setWidth(String(Math.round(nextHeight * ratioValue)));
    }
  };

  const renderResolutionCard = (title: string, resolution: ParsedResolution | null) => (
    <div className="resolution-card">
      <span>{title}</span>
      <strong>{resolution?.ratio || '-'}</strong>
      <small>
        {resolution
          ? `${resolution.width} x ${resolution.height}，宽高比 ${resolution.decimal}`
          : '请输入宽 x 高'}
      </small>
    </div>
  );

  return (
    <main className="calculator-page">
      <section className="panel calculator-panel">
        <div className="panel-title">
          <Calculator size={18} />
          <h2>比例与分辨率计算器</h2>
          <button className="ghost-link" type="button" onClick={onBack}>返回裁剪</button>
        </div>
        <div className="ratio-presets">
          {RATIO_PRESETS.map((item) => (
            <button
              key={item}
              type="button"
              className={selectedRatio === item ? 'active' : ''}
              onClick={() => selectPresetRatio(item)}
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            className={selectedRatio === CUSTOM_RATIO_KEY ? 'active' : ''}
            onClick={() => {
              setSelectedRatio(CUSTOM_RATIO_KEY);
              if (customRatio) updateHeightForRatio(customRatio.value);
            }}
          >
            自定义
          </button>
        </div>
        <div className="custom-ratio-grid">
          <label>
            <span>自定义比例宽</span>
            <input
              inputMode="decimal"
              value={customRatioWidth}
              onChange={(event) => updateCustomRatio('width', event.target.value)}
              onFocus={() => setSelectedRatio(CUSTOM_RATIO_KEY)}
            />
          </label>
          <strong aria-hidden="true">:</strong>
          <label>
            <span>自定义比例高</span>
            <input
              inputMode="decimal"
              value={customRatioHeight}
              onChange={(event) => updateCustomRatio('height', event.target.value)}
              onFocus={() => setSelectedRatio(CUSTOM_RATIO_KEY)}
            />
          </label>
        </div>
        <div className="calculator-grid">
          <label>
            <span>宽度</span>
            <input inputMode="numeric" value={width} onChange={(event) => setWidthAndHeight(event.target.value)} />
          </label>
          <label>
            <span>高度</span>
            <input inputMode="numeric" value={height} onChange={(event) => setHeightAndWidth(event.target.value)} />
          </label>
        </div>
        <div className="calculator-result">
          <span>目标比例</span>
          <strong>{activeRatio?.label || '待填写'}</strong>
          <span>{width || '-'} x {height || '-'}</span>
          {currentResolutionRatio && <small>当前分辨率比例：{currentResolutionRatio}</small>}
        </div>
        <div className="calculator-section-title">分辨率转比例</div>
        <div className="resolution-compare">
          <label>
            <span>分辨率宽度</span>
            <input
              inputMode="numeric"
              value={resolutionWidth}
              placeholder="1920"
              onChange={(event) => setResolutionWidth(event.target.value)}
            />
          </label>
          <label>
            <span>分辨率高度</span>
            <input
              inputMode="numeric"
              value={resolutionHeight}
              placeholder="1080"
              onChange={(event) => setResolutionHeight(event.target.value)}
            />
          </label>
        </div>
        <div className="resolution-result-grid">
          {renderResolutionCard('计算结果', parsedResolution)}
        </div>
        {metadata?.width && metadata?.height && (
          <div className="calculator-source">
            当前视频：{metadata.width} x {metadata.height}，比例约 {simplifyRatio(metadata.width, metadata.height)}
          </div>
        )}
      </section>
    </main>
  );
}

function WatermarkPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [imageSize, setImageSize] = useState(0);
  const [imageDimensions, setImageDimensions] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('上传图片后由 Flask 后台处理');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const [resultMeta, setResultMeta] = useState<WatermarkMeta | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startProcessing = async (file?: File) => {
    if (!file) return;
    stopPolling();
    setError('');
    setDownloadUrl('');
    setDownloadName('');
    setResultMeta(null);
    setProgress(0);
    setIsProcessing(true);
    setStatus('正在上传图片...');
    setImageName(file.name);
    setImageSize(file.size);
    setImageDimensions('');

    if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    const nextImageUrl = URL.createObjectURL(file);
    setImageUrl(nextImageUrl);

    const body = new FormData();
    body.append('image', file);
    body.append('adaptive_mode', 'auto');
    body.append('max_passes', '4');

    try {
      const response = await fetch('/api/watermark', { method: 'POST', body });
      const payload = await readJsonResponse<{ job_id: string }>(response, '图片任务创建失败');
      if (!payload.job_id) throw new Error('图片任务响应格式不正确');
      pollWatermarkJob(payload.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片任务创建失败');
      setStatus('图片处理失败');
      setIsProcessing(false);
    }
  };

  const pollWatermarkJob = (jobId: string) => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = await readJsonResponse<JobResponse>(response, '读取图片任务失败');
        setProgress(job.progress || 0);
        setStatus(job.message || '正在处理图片...');

        if (job.status === 'done') {
          stopPolling();
          setProgress(100);
          setStatus(job.meta?.applied === false ? '未检测到可靠的 Gemini 标志，已输出原图副本' : '图片处理完成，可以下载');
          setDownloadUrl(job.download_url || '');
          setDownloadName(job.output_name || '');
          setResultMeta(job.meta || null);
          setIsProcessing(false);
        }

        if (job.status === 'failed') {
          stopPolling();
          setError(job.error || '图片处理失败');
          setStatus('图片处理失败');
          setIsProcessing(false);
        }
      } catch (err) {
        stopPolling();
        setError(err instanceof Error ? err.message : '读取图片任务失败');
        setStatus('图片处理失败');
        setIsProcessing(false);
      }
    }, 700);
  };

  return (
    <main className="watermark-page">
      <section
        className={`watermark-drop panel ${active ? 'active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setActive(false);
          void startProcessing(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
          hidden
          onChange={(event) => {
            void startProcessing(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <span className="upload-icon">{isProcessing ? <Loader2 className="spin" size={32} /> : <ImageIcon size={32} />}</span>
        <h2>{isProcessing ? '后台正在处理图片...' : '导入图片并在后台去除 Gemini 标志'}</h2>
        <p>支持 PNG、JPG、WebP、BMP、TIFF，输出统一为 PNG。请只处理你拥有或已获授权处理的图片。</p>
        <button type="button" className="sample-button" disabled={isProcessing} onClick={() => inputRef.current?.click()}>
          <Upload size={16} />
          选择图片文件
        </button>
      </section>

      {error && (
        <div className="error-box watermark-error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="watermark-grid">
        <section className="panel watermark-preview-panel">
          <div className="panel-title">
            <ImageIcon size={18} />
            <h2>预览</h2>
          </div>
          <div className="watermark-preview-grid">
            <div className="watermark-preview-card">
              <span>原图</span>
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={imageName || '原图'}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    setImageDimensions(`${image.naturalWidth} x ${image.naturalHeight}`);
                  }}
                />
              ) : (
                <div>等待上传图片</div>
              )}
            </div>
            <div className="watermark-preview-card">
              <span>处理结果</span>
              {downloadUrl ? (
                <img src={downloadUrl} alt="处理结果" />
              ) : (
                <div>{isProcessing ? '后台处理中...' : '完成后在这里预览'}</div>
              )}
            </div>
          </div>
        </section>

        <aside className="panel watermark-status-panel">
          <div className="panel-title">
            <Sparkles size={18} />
            <h2>处理状态</h2>
          </div>

          <div className="info-grid watermark-info-grid">
            <InfoItem label="文件名" value={imageName || '-'} />
            <InfoItem label="文件大小" value={imageSize ? formatSize(imageSize) : '-'} />
            <InfoItem label="图片尺寸" value={imageDimensions || '-'} />
            <InfoItem label="处理方式" value="后台任务" />
          </div>

          <div className="progress-panel watermark-progress">
            <div>
              <span>{status}</span>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
          </div>

          {resultMeta && (
            <div className={resultMeta.applied === false ? 'watermark-meta skipped' : 'watermark-meta'}>
              {resultMeta.applied === false ? <AlertCircle size={17} /> : <CheckCircle size={17} />}
              <span>{formatWatermarkMeta(resultMeta)}</span>
            </div>
          )}

          {downloadUrl && (
            <a className="download-button" href={downloadUrl} download={downloadName}>
              <Download size={18} />
              下载 {downloadName || '处理后的图片'}
            </a>
          )}
        </aside>
      </div>
    </main>
  );
}

function formatWatermarkMeta(meta: WatermarkMeta) {
  if (meta.applied === false) {
    return meta.skipReason === 'no-watermark-detected'
      ? '未检测到可靠的 Gemini 标志，结果为原图副本。'
      : `未执行处理：${meta.skipReason || '信号不足'}。`;
  }

  const parts = [
    meta.size ? `${meta.size}px 模板` : '',
    meta.passCount ? `${meta.passCount} 轮` : '',
    meta.alphaGain && meta.alphaGain !== 1 ? `强度 ${meta.alphaGain}` : '',
    meta.decisionTier ? `判定 ${meta.decisionTier}` : ''
  ].filter(Boolean);

  return parts.length > 0 ? `已处理：${parts.join('，')}。` : '已检测并处理图片。';
}

function ImageResizePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [resizeMode, setResizeMode] = useState<'pixels' | 'percent'>('pixels');
  const [scalePercent, setScalePercent] = useState('100');
  const [keepAspect, setKeepAspect] = useState(true);
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality] = useState('95');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const [outputSize, setOutputSize] = useState('');

  useEffect(() => () => {
    if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const updateDimension = (value: string, changed: 'width' | 'height') => {
    if (changed === 'width') setWidth(value);
    else setHeight(value);
    if (!keepAspect || !sourceSize || !/^\d+$/.test(value) || Number(value) < 1) return;
    if (changed === 'width') {
      setHeight(String(Math.max(1, Math.round(Number(value) * sourceSize.height / sourceSize.width))));
    } else {
      setWidth(String(Math.max(1, Math.round(Number(value) * sourceSize.width / sourceSize.height))));
    }
  };

  const selectFile = (nextFile?: File) => {
    if (!nextFile) return;
    setError('');
    setDownloadUrl('');
    setPreviewUrl('');
    setDownloadName('');
    setOutputSize('');
    setFile(nextFile);
    if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(nextFile));
  };

  const resize = async () => {
    if (!file) {
      setError('请先选择一张图片。');
      return;
    }
    setError('');
    setIsProcessing(true);
    try {
      const body = new FormData();
      body.append('image', file);
      body.append('output_format', outputFormat);
      body.append('quality', quality);
      if (resizeMode === 'percent') {
        body.append('scale_percent', scalePercent);
      } else {
        body.append('width', width);
        body.append('height', height);
        body.append('keep_aspect', String(keepAspect));
      }
      const payload = await readJsonResponse<{ download_url: string; preview_url: string; output_name: string; width: number; height: number }>(
        await fetch('/api/image-resize', { method: 'POST', body }),
        '图片尺寸调整失败'
      );
      setDownloadUrl(payload.download_url);
      setPreviewUrl(payload.preview_url);
      setDownloadName(payload.output_name);
      setOutputSize(`${payload.width} x ${payload.height}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片尺寸调整失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const percentageOutputSize = sourceSize && Number.isFinite(Number(scalePercent)) && Number(scalePercent) >= 1
    ? `${Math.max(1, Math.round(sourceSize.width * Number(scalePercent) / 100))} x ${Math.max(1, Math.round(sourceSize.height * Number(scalePercent) / 100))}`
    : '';

  return (
    <main className="image-resize-page">
      <section
        className={`watermark-drop panel ${active ? 'active' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setActive(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setActive(false)}
        onDrop={(event) => { event.preventDefault(); setActive(false); selectFile(event.dataTransfer.files?.[0]); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
          hidden
          onChange={(event) => { selectFile(event.target.files?.[0]); event.currentTarget.value = ''; }}
        />
        <span className="upload-icon"><ImageIcon size={32} /></span>
        <h2>导入图片并调整分辨率</h2>
        <p>支持 PNG、JPG、WebP、BMP、TIFF；导出为高质量 PNG。可保持原始比例，或按指定宽高拉伸。</p>
        <button type="button" className="sample-button" onClick={() => inputRef.current?.click()}>
          <Upload size={16} /> 选择图片文件
        </button>
      </section>

      {error && <div className="error-box watermark-error"><AlertCircle size={17} /><span>{error}</span></div>}

      <div className="watermark-grid">
        <section className="panel watermark-preview-panel">
          <div className="panel-title"><ImageIcon size={18} /><h2>预览</h2></div>
          <div className="watermark-preview-grid">
            <div className="watermark-preview-card">
              <span>原图{sourceSize ? ` · ${sourceSize.width} x ${sourceSize.height}` : ''}</span>
              {imageUrl ? <img src={imageUrl} alt="原图" onLoad={(event) => {
                const image = event.currentTarget;
                const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
                setSourceSize(dimensions);
                setWidth(String(dimensions.width));
                setHeight(String(dimensions.height));
              }} /> : <div>等待上传图片</div>}
            </div>
            <div className="watermark-preview-card">
              <span>调整结果{outputSize ? ` · ${outputSize}` : ''}</span>
              {previewUrl ? <img src={previewUrl} alt="调整后的图片" /> : <div>处理完成后在这里预览</div>}
            </div>
          </div>
        </section>

        <aside className="panel watermark-status-panel image-resize-settings">
          <div className="panel-title"><SlidersHorizontal size={18} /><h2>目标分辨率</h2></div>
          <div className="image-resize-mode" role="group" aria-label="调整方式">
            <button type="button" className={resizeMode === 'pixels' ? 'active' : ''} onClick={() => setResizeMode('pixels')}>按像素</button>
            <button type="button" className={resizeMode === 'percent' ? 'active' : ''} onClick={() => setResizeMode('percent')}>按百分比</button>
          </div>
          {resizeMode === 'pixels' ? <>
            <div className="image-resize-fields">
              <label><span>宽度（px）</span><input inputMode="numeric" value={width} placeholder="例如 1920" onChange={(event) => updateDimension(event.target.value, 'width')} /></label>
              <label><span>高度（px）</span><input inputMode="numeric" value={height} placeholder="例如 1080" onChange={(event) => updateDimension(event.target.value, 'height')} /></label>
            </div>
            <label className="image-resize-aspect"><input type="checkbox" checked={keepAspect} onChange={(event) => setKeepAspect(event.target.checked)} /><span>保持原始比例</span></label>
            <small>{keepAspect ? '修改任一边会自动计算另一边；同时填写宽高时，图片会在该范围内等比缩放。' : '将严格使用填写的宽度和高度，图像可能发生拉伸。'}</small>
          </> : <>
            <label className="image-resize-percent">
              <span>缩放比例 <strong>{scalePercent}%</strong></span>
              <input type="range" min="1" max="100" step="1" value={scalePercent} onChange={(event) => setScalePercent(event.target.value)} aria-label="缩放比例" />
              <div className="image-resize-percent-scale"><small>1%</small><small>50%</small><small>100%</small></div>
            </label>
            <small>{percentageOutputSize ? `预计输出：${percentageOutputSize}。按百分比会始终保持原始比例。` : '请输入 1% 到 100% 之间的缩放比例。'}</small>
          </>}
          <div className="image-resize-export">
            <label><span>保存格式</span><select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as 'png' | 'jpeg' | 'webp')}><option value="png">PNG（无损）</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
            {outputFormat === 'png' ? <small>PNG 为无损格式，不需要设置图片质量。</small> : <label className="image-resize-quality"><span>图片质量 <strong>{quality}</strong></span><input type="range" min="1" max="100" step="1" value={quality} onChange={(event) => setQuality(event.target.value)} aria-label="图片质量" /><div><small>较小文件</small><small>较高质量</small></div></label>}
          </div>
          <button type="button" className="download-button" disabled={!file || isProcessing} onClick={() => void resize()}>
            {isProcessing ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
            {isProcessing ? '正在调整…' : '开始调整尺寸'}
          </button>
          {downloadUrl && <a className="download-button" href={downloadUrl} download={downloadName}><Download size={18} />下载 {downloadName}</a>}
        </aside>
      </div>
    </main>
  );
}

function VideoDownloader() {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState('best');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('粘贴视频页面链接后开始下载。');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  const pollJob = (jobId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const job = await readJsonResponse<JobResponse>(await fetch(`/api/jobs/${jobId}`), '读取下载进度失败');
        setProgress(job.progress || 0);
        setStatus(job.message || '正在下载视频…');
        if (job.status === 'done') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
          setProgress(100);
          setDownloadUrl(job.download_url || '');
          setDownloadName(job.output_name || '');
          setStatus('下载完成，可以保存文件。');
        } else if (job.status === 'failed') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
          setError(job.error || '下载失败');
          setStatus('下载失败');
        }
      } catch (err) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy(false);
        setError(err instanceof Error ? err.message : '读取下载进度失败');
        setStatus('下载失败');
      }
    }, 700);
  };

  const startDownload = async () => {
    if (!url.trim()) {
      setError('请输入视频页面链接。');
      return;
    }
    setBusy(true);
    setError('');
    setProgress(0);
    setDownloadUrl('');
    setDownloadName('');
    setStatus('正在创建下载任务…');
    try {
      const payload = await readJsonResponse<{ job_id: string }>(await fetch('/api/video-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), quality })
      }), '创建下载任务失败');
      if (!payload.job_id) throw new Error('下载任务响应无效');
      pollJob(payload.job_id);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : '创建下载任务失败');
      setStatus('下载失败');
    }
  };

  return (
    <main className="downloader-page">
      <section className="panel downloader-panel">
        <div className="panel-title"><CloudDownload size={20} /><h2>视频下载</h2></div>
        <p className="downloader-intro">使用 yt-dlp 下载你有权保存的公开视频。链接和文件仅在本机处理。</p>
        <label>
          <span>视频页面链接</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" disabled={busy} />
        </label>
        <label>
          <span>最高画质</span>
          <select value={quality} onChange={(event) => setQuality(event.target.value)} disabled={busy}>
            <option value="best">最佳可用</option>
            <option value="1080">不高于 1080p</option>
            <option value="720">不高于 720p</option>
            <option value="480">不高于 480p</option>
          </select>
        </label>
        {error && <div className="error-box"><AlertCircle size={17} /><span>{error}</span></div>}
        <button className="primary-button" type="button" disabled={busy} onClick={() => void startDownload()}>
          {busy ? <Loader2 size={18} className="spin" /> : <CloudDownload size={18} />}
          {busy ? '正在下载…' : '开始下载'}
        </button>
        <div className="progress-panel">
          <div><span>{status}</span><strong>{Math.round(progress)}%</strong></div>
          <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
        </div>
        {downloadUrl && <a className="download-button" href={downloadUrl} download={downloadName}><Download size={18} />下载 {downloadName || '视频文件'}</a>}
      </section>
    </main>
  );
}

function ModelDownloader() {
  const [repoId, setRepoId] = useState('');
  const [revision, setRevision] = useState('');
  const [saveDir, setSaveDir] = useState('');
  const [allowPatterns, setAllowPatterns] = useState('');
  const [token, setToken] = useState('');
  const [job, setJob] = useState<ModelJobResponse | null>(null);
  const [error, setError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    fetch('/api/model-settings')
      .then((response) => response.json())
      .then((payload: { default_save_dir?: string }) => {
        if (payload.default_save_dir) setSaveDir(payload.default_save_dir);
      })
      .catch(() => undefined);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollModelJob = (jobId: string) => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/model-downloads/${jobId}`);
        const payload = (await response.json()) as ModelJobResponse | { error: string };
        if (!response.ok) throw new Error('error' in payload ? payload.error : '读取下载任务失败');
        const nextJob = payload as ModelJobResponse;
        setJob(nextJob);

        if (nextJob.status === 'done' || nextJob.status === 'failed') {
          stopPolling();
          setIsDownloading(false);
          if (nextJob.status === 'failed') setError(nextJob.error || '下载失败');
        }
      } catch (err) {
        stopPolling();
        setIsDownloading(false);
        setError(err instanceof Error ? err.message : '读取下载任务失败');
      }
    }, 1000);
  };

  const startDownload = async () => {
    if (!repoId.trim()) {
      setError('请输入模型仓库 ID。');
      return;
    }

    stopPolling();
    setError('');
    setJob(null);
    setIsDownloading(true);

    try {
      const response = await fetch('/api/model-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: repoId,
          revision,
          save_dir: saveDir,
          allow_patterns: allowPatterns,
          token
        })
      });
      const payload = (await response.json()) as { job_id: string } | { error: string };
      if (!response.ok) throw new Error('error' in payload ? payload.error : '下载任务创建失败');
      if (!('job_id' in payload)) throw new Error('下载任务响应格式不正确');
      setJob({
        id: payload.job_id,
        status: 'queued',
        progress: 0,
        message: '等待下载',
        repo_id: repoId,
        revision: revision || 'main',
        endpoint: 'https://hf-mirror.com',
        local_dir: '',
        file_count: 0,
        size: 0,
        current_file: null,
        current_file_index: 0,
        current_file_progress: 0,
        current_file_downloaded: 0,
        current_file_size: 0,
        files: []
      });
      pollModelJob(payload.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载任务创建失败');
      setIsDownloading(false);
    }
  };

  const progress = job?.status === 'running' ? Math.max(job.progress, 8) : job?.progress || 0;

  return (
    <main className="model-page">
      <section className="panel model-panel">
        <div className="panel-title">
          <CloudDownload size={18} />
          <h2>HF Mirror 模型下载</h2>
        </div>

        <div className="model-form">
          <label className="field">
            <span>模型仓库</span>
            <input
              value={repoId}
              onChange={(event) => setRepoId(event.target.value)}
              placeholder="Qwen/Qwen3-0.6B 或 https://hf-mirror.com/Qwen/Qwen3-0.6B"
            />
          </label>
          <label className="field">
            <span>Revision</span>
            <input value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="main" />
          </label>
          <label className="field">
            <span>保存根目录</span>
            <input
              value={saveDir}
              onChange={(event) => setSaveDir(event.target.value)}
              placeholder="D:\\Models"
            />
          </label>
          <label className="field">
            <span>访问 Token</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="公开模型可留空"
              autoComplete="off"
            />
          </label>
          <label className="field model-patterns">
            <span>文件筛选</span>
            <textarea
              value={allowPatterns}
              onChange={(event) => setAllowPatterns(event.target.value)}
              placeholder="*.safetensors, tokenizer.json"
            />
          </label>
        </div>

        {error && (
          <div className="error-box model-error">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

        <button className="primary-button" type="button" disabled={isDownloading} onClick={() => void startDownload()}>
          {isDownloading ? <Loader2 size={18} className="spin" /> : <FolderDown size={18} />}
          {isDownloading ? '正在下载...' : '开始下载模型'}
        </button>
      </section>

      <section className="panel model-status-panel">
        <div className="panel-title">
          <Database size={18} />
          <h2>下载状态</h2>
        </div>

        <div className="progress-panel model-progress">
          <div>
            <span>{job?.message || '等待任务'}</span>
            <strong>{Math.round(progress)}%</strong>
          </div>
          <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
        </div>

        {job?.current_file && (
          <div className="current-file-panel">
            <div>
              <span>当前文件 {job.current_file_index}/{job.file_count}</span>
              <strong title={job.current_file}>{job.current_file}</strong>
            </div>
            <div>
              <span>{formatSize(job.current_file_downloaded)} / {job.current_file_size ? formatSize(job.current_file_size) : '-'}</span>
              <strong>{Math.round(job.current_file_progress)}%</strong>
            </div>
            <div className="progress-track"><div style={{ width: `${job.current_file_progress}%` }} /></div>
          </div>
        )}

        <div className="info-grid model-info-grid">
          <InfoItem label="仓库" value={job?.repo_id || '-'} />
          <InfoItem label="Revision" value={job?.revision || '-'} />
          <InfoItem label="镜像源" value={job?.endpoint || 'https://hf-mirror.com'} />
          <InfoItem label="保存目录" value={job?.local_dir || '-'} />
          <InfoItem label="文件数量" value={job?.file_count ? String(job.file_count) : '-'} />
          <InfoItem label="总大小" value={job?.size ? formatSize(job.size) : '-'} />
        </div>

        {job?.status === 'done' && (
          <div className="success-box">
            <CheckCircle size={17} />
            <span>模型已下载到 {job.local_dir}</span>
          </div>
        )}

        {job?.files && job.files.length > 0 && (
          <div className="file-progress-list">
            {job.files.map((file) => (
              <div key={file.name} className={`file-progress-item ${file.status}`}>
                <div>
                  <strong title={file.name}>{file.name}</strong>
                  <span>{file.status === 'done' ? '完成' : file.status === 'running' ? '下载中' : '等待中'}</span>
                </div>
                <div>
                  <span>{file.size ? `${formatSize(file.downloaded)} / ${formatSize(file.size)}` : '-'}</span>
                  <strong>{Math.round(file.progress)}%</strong>
                </div>
                <div className="progress-track"><div style={{ width: `${file.progress}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ExtractAudioPage({
  audioName,
  audioUrl,
  audioInfo,
  audioFormats,
  audioFormat,
  audioStreamIndex,
  audioProgress,
  audioStatus,
  audioDownloadUrl,
  audioDownloadName,
  error,
  isUploading,
  isExtracting,
  onFormatChange,
  onAudioStreamChange,
  onExtract,
  onUpload
}: {
  audioName: string;
  audioUrl: string;
  audioInfo: MediaInfo | null;
  audioFormats: FormatInfo[];
  audioFormat: string;
  audioStreamIndex: number;
  audioProgress: number;
  audioStatus: string;
  audioDownloadUrl: string;
  audioDownloadName: string;
  error: string;
  isUploading: boolean;
  isExtracting: boolean;
  onFormatChange: (format: string) => void;
  onAudioStreamChange: (index: number) => void;
  onExtract: () => void;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const hasAudio = Boolean(audioInfo?.audio_codec);
  const canExtract = Boolean(audioInfo) && !isUploading && !isExtracting;

  const handleFile = (file?: File) => {
    if (file) onUpload(file);
  };

  return (
    <main className="audio-page">
      <section
        className={`audio-drop panel ${active ? 'active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setActive(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.flv,.wmv,.m4v,.mpg,.mpeg,.3gp,.ts,.mts,.m2ts,.ogg,.ogv"
          hidden
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <span className="upload-icon">{isUploading ? <Loader2 className="spin" size={32} /> : <Music size={32} />}</span>
        <h2>{isUploading ? '正在读取视频信息...' : '导入视频文件提取音频'}</h2>
        <p>上传一个视频文件，提取其中的音轨并导出为 MP3、WAV、AAC、FLAC 或 OGG。</p>
        <button type="button" className="sample-button" onClick={() => inputRef.current?.click()} disabled={isUploading}>
          <Upload size={16} />
          选择视频文件
        </button>
      </section>

      {error && (
        <div className="error-box audio-error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {audioUrl && (
        <section className="panel audio-player-panel">
          <div className="panel-title">
            <Play size={18} />
            <h2>视频预览</h2>
          </div>
          {audioInfo?.video_codec ? (
            <video controls src={audioUrl} preload="metadata" />
          ) : (
            <audio controls src={audioUrl} preload="metadata" />
          )}
        </section>
      )}

      <section className="panel audio-export-panel">
        <div className="panel-title">
          <Download size={18} />
          <h2>提取设置</h2>
        </div>
        <label className="field">
          <span>输出音频格式</span>
          <select value={audioFormat} onChange={(event) => onFormatChange(event.target.value)}>
            {audioFormats.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </label>
        {(audioInfo?.audio_streams?.length || 0) > 1 && (
          <label className="field">
            <span>选择音轨</span>
            <select value={audioStreamIndex} onChange={(event) => onAudioStreamChange(Number(event.target.value))}>
              {audioInfo!.audio_streams!.map((stream) => (
                <option key={stream.index} value={stream.index}>{formatAudioStreamLabel(stream)}</option>
              ))}
            </select>
          </label>
        )}
        <div className="progress-panel audio-progress">
          <div>
            <span>{audioStatus}</span>
            <strong>{Math.round(audioProgress)}%</strong>
          </div>
          <div className="progress-track"><div style={{ width: `${audioProgress}%` }} /></div>
        </div>
        <button className="primary-button" type="button" disabled={!canExtract} onClick={onExtract}>
          {isExtracting ? <Loader2 size={18} className="spin" /> : <Music size={18} />}
          {isExtracting ? '正在提取音频...' : '开始提取音频'}
        </button>
        {audioDownloadUrl && (
          <a className="download-button" href={audioDownloadUrl} download={audioDownloadName}>
            <Download size={18} />
            下载 {audioDownloadName || '音频文件'}
          </a>
        )}
        {audioDownloadUrl && (
          <AudioResultPreview src={audioDownloadUrl} name={audioDownloadName || '提取后的音频'} />
        )}
        {audioInfo && !hasAudio && (
          <div className="error-box audio-warning">
            <AlertCircle size={17} />
            <span>未检测到音轨。如果源文件本身没有声音，提取任务会失败。</span>
          </div>
        )}
      </section>

      <section className="panel audio-info-panel">
        <div className="panel-title">
          <Music size={18} />
          <h2>视频详细信息</h2>
        </div>
        <div className="info-grid audio-info-grid">
          <InfoItem label="文件名" value={audioName || '-'} />
          <InfoItem label="文件大小" value={audioInfo?.size ? formatSize(audioInfo.size) : '-'} />
          <InfoItem label="时长" value={audioInfo?.duration ? formatAudioDuration(audioInfo.duration) : '-'} />
          <InfoItem label="分辨率" value={audioInfo?.resolution && audioInfo.resolution !== 'unknown' ? audioInfo.resolution : '-'} />
          <InfoItem label="视频编码" value={audioInfo?.video_codec || '-'} />
          <InfoItem label="容器格式" value={audioInfo?.format_name || '-'} />
          <InfoItem label="音频编码" value={audioInfo?.audio_codec || '-'} />
          <InfoItem label="采样率" value={audioInfo?.sample_rate ? `${audioInfo.sample_rate} Hz` : '-'} />
          <InfoItem label="声道数" value={audioInfo?.channels ? String(audioInfo.channels) : '-'} />
          <InfoItem label="声道布局" value={audioInfo?.channel_layout || '-'} />
          <InfoItem label="码率" value={audioInfo?.bit_rate ? `${Math.round(audioInfo.bit_rate / 1000)} kbps` : '-'} />
        </div>
      </section>
    </main>
  );
}

function AudioInspector({
  audioFileId,
  audioName,
  audioUrl,
  audioInfo,
  audioFormats,
  silenceFormat,
  silenceSegments,
  silenceProgress,
  silenceStatus,
  silenceDownloadUrl,
  silenceDownloadName,
  silenceError,
  trimStart,
  trimEnd,
  trimFormat,
  trimProgress,
  trimStatus,
  trimDownloadUrl,
  trimDownloadName,
  trimError,
  error,
  isUploading,
  isInsertingSilence,
  isTrimmingAudio,
  onSilenceFormatChange,
  onSilenceSegmentsChange,
  onInsertSilence,
  onTrimStartChange,
  onTrimEndChange,
  onTrimFormatChange,
  onTrimAudio,
  onUpload
}: {
  audioFileId: string;
  audioName: string;
  audioUrl: string;
  audioInfo: MediaInfo | null;
  audioFormats: FormatInfo[];
  silenceFormat: string;
  silenceSegments: AudioSilenceSegment[];
  silenceProgress: number;
  silenceStatus: string;
  silenceDownloadUrl: string;
  silenceDownloadName: string;
  silenceError: string;
  trimStart: string;
  trimEnd: string;
  trimFormat: string;
  trimProgress: number;
  trimStatus: string;
  trimDownloadUrl: string;
  trimDownloadName: string;
  trimError: string;
  error: string;
  isUploading: boolean;
  isInsertingSilence: boolean;
  isTrimmingAudio: boolean;
  onSilenceFormatChange: (format: string) => void;
  onSilenceSegmentsChange: (segments: AudioSilenceSegment[]) => void;
  onInsertSilence: () => void;
  onTrimStartChange: (value: string) => void;
  onTrimEndChange: (value: string) => void;
  onTrimFormatChange: (format: string) => void;
  onTrimAudio: () => void;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [active, setActive] = useState(false);
  const hasInvalidSilenceSegment = silenceSegments.some((segment) => {
    const insertAt = parseTimecode(segment.insertAt);
    const duration = parseTimecode(segment.duration);
    return insertAt === null || duration === null || duration <= 0;
  });
  const canInsertSilence = Boolean(audioFileId && audioInfo?.audio_codec)
    && silenceSegments.length > 0
    && !hasInvalidSilenceSegment
    && !isUploading
    && !isInsertingSilence;
  const trimStartSeconds = parseTimecode(trimStart);
  const trimEndSeconds = parseTimecode(trimEnd);
  const trimDuration = audioInfo?.duration || 0;
  const hasInvalidTrim = trimStartSeconds === null
    || trimEndSeconds === null
    || trimEndSeconds <= trimStartSeconds
    || (trimDuration > 0 && trimStartSeconds >= trimDuration);
  const canTrimAudio = Boolean(audioFileId && audioInfo?.audio_codec)
    && !hasInvalidTrim
    && !isUploading
    && !isTrimmingAudio;

  const handleFile = (file?: File) => {
    if (file) onUpload(file);
  };

  const setTrimTimeFromPlayback = (setter: (value: string) => void) => {
    setter(formatTime(audioRef.current?.currentTime || 0));
  };

  const updateSilenceSegment = (id: string, patch: Partial<Omit<AudioSilenceSegment, 'id'>>) => {
    onSilenceSegmentsChange(
      silenceSegments.map((segment) => (segment.id === id ? { ...segment, ...patch } : segment))
    );
  };

  const addSilenceSegment = (insertAt = '00:00.000') => {
    onSilenceSegmentsChange([...silenceSegments, createSilenceSegment(insertAt)]);
  };

  const removeSilenceSegment = (id: string) => {
    if (silenceSegments.length <= 1) return;
    onSilenceSegmentsChange(silenceSegments.filter((segment) => segment.id !== id));
  };

  return (
    <main className="audio-page">
      <section
        className={`audio-drop panel ${active ? 'active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setActive(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <span className="upload-icon">{isUploading ? <Loader2 className="spin" size={32} /> : <Music size={32} />}</span>
        <h2>{isUploading ? '正在读取音频信息...' : '导入音频文件查看详细信息'}</h2>
        <p>支持当前 FFmpeg 能够识别的所有音频格式；部分格式可能无法在浏览器中直接播放，但仍可读取和处理。</p>
        <button type="button" className="sample-button" onClick={() => inputRef.current?.click()} disabled={isUploading}>
          <Upload size={16} />
          选择音频文件
        </button>
      </section>

      {error && (
        <div className="error-box audio-error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {audioUrl && (
        <section className="panel audio-player-panel">
          <div className="panel-title">
            <Play size={18} />
            <h2>音频播放</h2>
          </div>
          <audio ref={audioRef} controls src={audioUrl} preload="metadata" />
          <AudioWaveform src={audioUrl} mediaRef={audioRef} duration={audioInfo?.duration} />
        </section>
      )}

      <section className="panel audio-export-panel audio-trim-panel">
        <div className="panel-title">
          <Scissors size={18} />
          <h2>音频裁剪</h2>
        </div>
        <div className="time-row">
          <label>
            <span>起点</span>
            <input value={trimStart} onChange={(event) => onTrimStartChange(event.target.value)} />
          </label>
          <label>
            <span>终点</span>
            <input value={trimEnd} onChange={(event) => onTrimEndChange(event.target.value)} />
          </label>
        </div>
        <div className="mark-actions">
          <button type="button" disabled={!audioUrl} onClick={() => setTrimTimeFromPlayback(onTrimStartChange)}>
            <Clock3 size={16} />
            当前设为起点
          </button>
          <button type="button" disabled={!audioUrl} onClick={() => setTrimTimeFromPlayback(onTrimEndChange)}>
            <Clock3 size={16} />
            当前设为终点
          </button>
        </div>
        <label className="field audio-silence-format">
          <span>输出格式</span>
          <select value={trimFormat} onChange={(event) => onTrimFormatChange(event.target.value)}>
            {audioFormats.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </label>
        {hasInvalidTrim && audioFileId && (
          <div className="error-box audio-warning">
            <AlertCircle size={17} />
            <span>请检查起点和终点，终点必须大于起点。</span>
          </div>
        )}
        <button className="primary-button" type="button" disabled={!canTrimAudio} onClick={onTrimAudio}>
          {isTrimmingAudio ? <Loader2 size={18} className="spin" /> : <Scissors size={18} />}
          {isTrimmingAudio ? '正在裁剪音频...' : '裁剪并导出'}
        </button>
        <div className="progress-panel audio-progress">
          <div>
            <span>{trimStatus}</span>
            <strong>{Math.round(trimProgress)}%</strong>
          </div>
          <div className="progress-track"><div style={{ width: `${trimProgress}%` }} /></div>
        </div>
        {trimError && (
          <div className="error-box audio-warning">
            <AlertCircle size={17} />
            <span>{trimError}</span>
          </div>
        )}
        {trimDownloadUrl && (
          <a className="download-button" href={trimDownloadUrl} download={trimDownloadName}>
            <Download size={18} />
            下载 {trimDownloadName || '裁剪后的音频'}
          </a>
        )}
        {trimDownloadUrl && (
          <AudioResultPreview src={trimDownloadUrl} name={trimDownloadName || '裁剪后的音频'} />
        )}
      </section>

      <section className="panel audio-export-panel audio-silence-panel">
        <div className="panel-title">
          <Clock3 size={18} />
          <h2>插入空白音频</h2>
        </div>
        <div className="audio-silence-list">
          {silenceSegments.map((segment, index) => (
            <div className="audio-silence-row" key={segment.id}>
              <label>
                <span>第 {index + 1} 段位置</span>
                <input
                  value={segment.insertAt}
                  onChange={(event) => updateSilenceSegment(segment.id, { insertAt: event.target.value })}
                />
              </label>
              <label>
                <span>静音时长</span>
                <input
                  value={segment.duration}
                  onChange={(event) => updateSilenceSegment(segment.id, { duration: event.target.value })}
                />
              </label>
              <button
                type="button"
                className="ghost-icon"
                disabled={!audioUrl}
                title="使用当前播放位置"
                onClick={() => updateSilenceSegment(segment.id, { insertAt: formatTime(audioRef.current?.currentTime || 0) })}
              >
                <Clock3 size={16} />
              </button>
              <button
                type="button"
                className="ghost-icon"
                disabled={silenceSegments.length <= 1}
                title="删除这一段"
                onClick={() => removeSilenceSegment(segment.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <label className="field audio-silence-format">
          <span>输出格式</span>
          <select value={silenceFormat} onChange={(event) => onSilenceFormatChange(event.target.value)}>
            {audioFormats.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </label>
        {hasInvalidSilenceSegment && (
          <div className="error-box audio-warning">
            <AlertCircle size={17} />
            <span>请检查每一段的插入位置和静音时长，时长必须大于 0。</span>
          </div>
        )}
        <div className="audio-silence-actions">
          <button
            type="button"
            className="sample-button"
            disabled={!audioUrl}
            onClick={() => addSilenceSegment(formatTime(audioRef.current?.currentTime || 0))}
          >
            <Clock3 size={16} />
            添加当前播放位置
          </button>
          <button type="button" className="sample-button" onClick={() => addSilenceSegment()}>
            新增一段
          </button>
          <button className="primary-button" type="button" disabled={!canInsertSilence} onClick={onInsertSilence}>
            {isInsertingSilence ? <Loader2 size={18} className="spin" /> : <Music size={18} />}
            {isInsertingSilence ? '正在插入静音...' : `插入 ${silenceSegments.length} 段静音并导出`}
          </button>
        </div>
        <div className="progress-panel audio-progress">
          <div>
            <span>{silenceStatus}</span>
            <strong>{Math.round(silenceProgress)}%</strong>
          </div>
          <div className="progress-track"><div style={{ width: `${silenceProgress}%` }} /></div>
        </div>
        {silenceError && (
          <div className="error-box audio-warning">
            <AlertCircle size={17} />
            <span>{silenceError}</span>
          </div>
        )}
        {silenceDownloadUrl && (
          <a className="download-button" href={silenceDownloadUrl} download={silenceDownloadName}>
            <Download size={18} />
            下载 {silenceDownloadName || '处理后的音频'}
          </a>
        )}
        {silenceDownloadUrl && (
          <AudioResultPreview src={silenceDownloadUrl} name={silenceDownloadName || '处理后的音频'} />
        )}
      </section>

      <section className="panel audio-info-panel">
        <div className="panel-title">
          <Music size={18} />
          <h2>音频详细信息</h2>
        </div>
        <div className="info-grid audio-info-grid">
          <InfoItem label="文件名" value={audioName || '-'} />
          <InfoItem label="文件大小" value={audioInfo?.size ? formatSize(audioInfo.size) : '-'} />
          <InfoItem label="时长" value={audioInfo?.duration ? formatAudioDuration(audioInfo.duration) : '-'} />
          <InfoItem label="容器格式" value={audioInfo?.format_name || '-'} />
          <InfoItem label="音频编码" value={audioInfo?.audio_codec || '-'} />
          <InfoItem label="采样率" value={audioInfo?.sample_rate ? `${audioInfo.sample_rate} Hz` : '-'} />
          <InfoItem label="声道数" value={audioInfo?.channels ? String(audioInfo.channels) : '-'} />
          <InfoItem label="声道布局" value={audioInfo?.channel_layout || '-'} />
          <InfoItem label="码率" value={audioInfo?.bit_rate ? `${Math.round(audioInfo.bit_rate / 1000)} kbps` : '-'} />
        </div>
      </section>
    </main>
  );
}

const WAVEFORM_BAR_COUNT = 160;

function AudioWaveform({
  src,
  mediaRef,
  duration,
  visibleRange,
  peaksUrl,
  title = '声波图',
  ariaLabel = '媒体播放位置'
}: {
  src: string;
  mediaRef: React.RefObject<HTMLMediaElement | null>;
  duration?: number;
  visibleRange?: { start: number; end: number };
  peaksUrl?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [message, setMessage] = useState('正在生成声波图...');
  const [currentTime, setCurrentTime] = useState(0);
  const [knownDuration, setKnownDuration] = useState(duration || 0);

  const placeholderPeaks = useMemo(
    () => Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
      const wave = Math.sin(index * 0.42) * 0.18 + Math.sin(index * 0.13) * 0.12;
      return clamp(0.32 + wave, 0.12, 0.62);
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    let context: AudioContext | null = null;

    const loadWaveform = async () => {
      setStatus('loading');
      setMessage('正在生成声波图...');
      setPeaks([]);

      try {
        if (peaksUrl) {
          const response = await fetch(peaksUrl);
          const payload = (await response.json()) as { peaks?: number[]; duration?: number; error?: string };
          if (!response.ok) throw new Error(payload.error || 'Unable to load waveform data');
          if (!Array.isArray(payload.peaks) || payload.peaks.length === 0) throw new Error('Waveform data is empty');
          if (cancelled) return;

          setPeaks(payload.peaks.map((peak) => clamp(Number(peak) || 0, 0.06, 1)));
          setKnownDuration(payload.duration || duration || 0);
          setStatus('ready');
          setMessage('');
          return;
        }

        const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) throw new Error('AudioContext is unavailable');

        const response = await fetch(src);
        if (!response.ok) throw new Error('Unable to load audio data');

        const audioData = await response.arrayBuffer();
        context = new AudioContextClass();
        const audioBuffer = await context.decodeAudioData(audioData.slice(0));
        if (cancelled) return;

        setPeaks(buildWaveformPeaks(audioBuffer, WAVEFORM_BAR_COUNT));
        setKnownDuration(audioBuffer.duration || duration || 0);
        setStatus('ready');
        setMessage('');
      } catch (err) {
        if (!cancelled) {
          setStatus('failed');
          setMessage(peaksUrl && err instanceof Error
            ? err.message
            : '当前浏览器无法生成该格式的声波图，播放器仍可正常使用。');
        }
      } finally {
        closeAudioContext(context);
      }
    };

    void loadWaveform();

    return () => {
      cancelled = true;
      closeAudioContext(context);
    };
  }, [src, duration, peaksUrl]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return undefined;

    const syncTime = () => {
      setCurrentTime(media.currentTime || 0);
      if (Number.isFinite(media.duration) && media.duration > 0) {
        setKnownDuration(media.duration);
      } else if (duration) {
        setKnownDuration(duration);
      }
    };

    const stopFrame = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      syncTime();
    };

    const tick = () => {
      syncTime();
      if (!media.paused && !media.ended) {
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };

    const startFrame = () => {
      stopFrame();
      frameRef.current = window.requestAnimationFrame(tick);
    };

    media.addEventListener('loadedmetadata', syncTime);
    media.addEventListener('durationchange', syncTime);
    media.addEventListener('timeupdate', syncTime);
    media.addEventListener('seeked', syncTime);
    media.addEventListener('play', startFrame);
    media.addEventListener('pause', stopFrame);
    media.addEventListener('ended', stopFrame);
    syncTime();

    return () => {
      media.removeEventListener('loadedmetadata', syncTime);
      media.removeEventListener('durationchange', syncTime);
      media.removeEventListener('timeupdate', syncTime);
      media.removeEventListener('seeked', syncTime);
      media.removeEventListener('play', startFrame);
      media.removeEventListener('pause', stopFrame);
      media.removeEventListener('ended', stopFrame);
      stopFrame();
    };
  }, [mediaRef, src, duration]);

  const waveformDuration = knownDuration || duration || 0;
  const visibleStart = clamp(visibleRange?.start ?? 0, 0, waveformDuration);
  const visibleEnd = clamp(visibleRange?.end || waveformDuration, visibleStart, waveformDuration);
  const visibleDuration = Math.max(0, visibleEnd - visibleStart);
  const sourcePeaks = peaks.length > 0 ? peaks : placeholderPeaks;
  const visiblePeaks = useMemo(() => {
    if (!waveformDuration || !visibleDuration || sourcePeaks.length === 0) return sourcePeaks;
    const startRatio = visibleStart / waveformDuration;
    const endRatio = visibleEnd / waveformDuration;
    return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
      const ratio = startRatio + ((index + 0.5) / WAVEFORM_BAR_COUNT) * (endRatio - startRatio);
      return sourcePeaks[Math.min(sourcePeaks.length - 1, Math.floor(ratio * sourcePeaks.length))];
    });
  }, [sourcePeaks, visibleStart, visibleEnd, visibleDuration, waveformDuration]);
  const progress = visibleDuration > 0 ? clamp((currentTime - visibleStart) / visibleDuration, 0, 1) : 0;

  const seekFromPointer = (clientX: number) => {
    const media = mediaRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!media || !rect || visibleDuration <= 0) return;

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    media.currentTime = visibleStart + ratio * visibleDuration;
    setCurrentTime(media.currentTime);
  };

  const stepPlayback = (amount: number) => {
    const media = mediaRef.current;
    if (!media || visibleDuration <= 0) return;
    media.currentTime = clamp(media.currentTime + amount, visibleStart, visibleEnd);
    setCurrentTime(media.currentTime);
  };

  return (
    <div className={`audio-waveform ${status}`}>
      <div className="audio-waveform-head">
        <span>{title}</span>
        <strong>{formatTime(currentTime, false)} / {waveformDuration ? `${formatTime(visibleStart, false)} - ${formatTime(visibleEnd, false)}` : '--:--'}</strong>
      </div>
      <div
        ref={trackRef}
        className="audio-waveform-track"
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={Math.round(visibleStart)}
        aria-valuemax={Math.round(visibleEnd)}
        aria-valuenow={Math.round(currentTime || 0)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) seekFromPointer(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            stepPlayback(event.shiftKey ? -10 : -5);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            stepPlayback(event.shiftKey ? 10 : 5);
          }
        }}
      >
        {visiblePeaks.map((peak, index) => (
          <span
            key={index}
            className={(index + 0.5) / visiblePeaks.length <= progress ? 'active' : ''}
            style={{ height: `${Math.max(8, peak * 100)}%` }}
          />
        ))}
        <div className="audio-waveform-playhead" style={{ left: `${progress * 100}%` }} />
      </div>
      {message && <p>{message}</p>}
    </div>
  );
}

function AudioSpeedPage({ audioFormats }: { audioFormats: FormatInfo[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);
  const [fileId, setFileId] = useState('');
  const [fileName, setFileName] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [speed, setSpeed] = useState(1);
  const [format, setFormat] = useState('mp3');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('请先选择一个音频文件');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const upload = async (file: File) => {
    setBusy(true); setError(''); setDownloadUrl(''); setProgress(0); setStatus('正在上传并读取音频...');
    const localUrl = URL.createObjectURL(file);
    const body = new FormData(); body.append('audio', file);
    try {
      const response = await fetch('/api/audio', { method: 'POST', body });
      const payload = await readJsonResponse<UploadResponse>(response, '上传失败');
      if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
      setAudioUrl(localUrl); setFileId(payload.file_id); setFileName(payload.filename); setInfo(payload.info);
      setStatus('音频已就绪，请选择播放速度');
    } catch (err) {
      URL.revokeObjectURL(localUrl); setError(err instanceof Error ? err.message : '上传失败'); setStatus('上传失败');
    } finally { setBusy(false); }
  };

  const processAudio = async () => {
    if (!fileId) return;
    setBusy(true); setError(''); setDownloadUrl(''); setProgress(0); setStatus('正在创建变速任务...');
    try {
      const response = await fetch('/api/audio/speed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId, speed, format })
      });
      const payload = await readJsonResponse<{ job_id: string }>(response, '任务创建失败');
      pollRef.current = window.setInterval(async () => {
        try {
          const job = await readJsonResponse<JobResponse>(await fetch(`/api/jobs/${payload.job_id}`), '读取任务失败');
          setProgress(job.progress || 0); setStatus(job.message || '正在处理音频...');
          if (job.status === 'done' || job.status === 'failed') {
            if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null; setBusy(false);
            if (job.status === 'done') {
              setProgress(100); setStatus('变速处理完成，可以试听和下载');
              setDownloadUrl(job.download_url || ''); setDownloadName(job.output_name || '');
            } else { setError(job.error || '音频处理失败'); setStatus('处理失败'); }
          }
        } catch (err) {
          if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null; setBusy(false);
          setError(err instanceof Error ? err.message : '读取任务失败');
        }
      }, 700);
    } catch (err) { setBusy(false); setError(err instanceof Error ? err.message : '任务创建失败'); setStatus('处理失败'); }
  };

  const estimatedDuration = info?.duration ? info.duration / speed : 0;
  return (
    <main className="audio-page">
      <section className="panel audio-drop">
        <input ref={inputRef} hidden type="file"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />
        <span className="upload-icon">{busy && !fileId ? <Loader2 className="spin" size={32} /> : <Music size={32} />}</span>
        <h2>导入音频并修改播放速度</h2>
        <p>调整节奏但保持原有音高，支持 0.25x 至 4x。</p>
        <button className="sample-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}><Upload size={16} />选择音频文件</button>
      </section>
      {audioUrl && <section className="panel audio-player-panel"><div className="panel-title"><Play size={18} /><h2>原音频 · {fileName}</h2></div><audio controls src={audioUrl} /></section>}
      <section className="panel audio-export-panel speed-panel">
        <div className="panel-title"><SlidersHorizontal size={18} /><h2>播放速度</h2></div>
        <div className="speed-presets">{[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => <button key={value} type="button" className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)}>{value}x</button>)}</div>
        <label className="field"><span>自定义倍速：{speed.toFixed(2)}x</span><input type="range" min="0.25" max="4" step="0.05" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label>
        <div className="info-grid"><InfoItem label="原始时长" value={info?.duration ? formatAudioDuration(info.duration) : '-'} /><InfoItem label="预计时长" value={estimatedDuration ? formatAudioDuration(estimatedDuration) : '-'} /></div>
        <label className="field"><span>输出格式</span><select value={format} onChange={(event) => setFormat(event.target.value)}>{audioFormats.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <button className="primary-button" type="button" disabled={!fileId || busy} onClick={() => void processAudio()}>{busy ? <Loader2 size={18} className="spin" /> : <Wand2 size={18} />}{busy ? '正在处理...' : `生成 ${speed.toFixed(2)}x 音频`}</button>
        <div className="progress-panel audio-progress"><div><span>{status}</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div></div>
        {error && <div className="error-box audio-warning"><AlertCircle size={17} /><span>{error}</span></div>}
        {downloadUrl && <><a className="download-button" href={downloadUrl} download={downloadName}><Download size={18} />下载 {downloadName}</a><AudioResultPreview src={downloadUrl} name={downloadName || '变速后的音频'} /></>}
      </section>
    </main>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function AudioResultPreview({ src, name }: { src: string; name: string }) {
  return (
    <div className="audio-result-preview">
      <div>
        <Play size={16} />
        <span>结果预览</span>
        <strong title={name}>{name}</strong>
      </div>
      <audio controls src={src} preload="metadata" />
    </div>
  );
}

function makeClientId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSilenceSegment(insertAt = '00:00.000', duration = '00:01.000'): AudioSilenceSegment {
  return {
    id: makeClientId(),
    insertAt,
    duration
  };
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      throw new Error(`${fallbackMessage}：后端返回了非 JSON 响应，请重启后端服务后再试。`);
    }
    throw new Error('服务响应格式不正确。');
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error?: unknown }).error)
      : fallbackMessage;
    throw new Error(message);
  }

  return payload as T;
}

function formatTime(seconds: number, includeMs = true) {
  const total = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const base = h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return includeMs ? `${base}.${String(ms).padStart(3, '0')}` : base;
}

function formatAudioDuration(seconds: number) {
  const millis = Math.round(Math.max(0, Number(seconds) || 0) * 1000);
  return `${formatTime(millis / 1000, true)} (${millis} ms)`;
}

function parseTimecode(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (!text.includes(':')) {
    const seconds = Number(text);
    return Number.isFinite(seconds) ? Math.max(0, seconds) : null;
  }

  const parts = text.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part)) || parts.length > 3) return null;
  while (parts.length < 3) parts.unshift(0);
  const [hours, minutes, seconds] = parts;
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function buildWaveformPeaks(audioBuffer: AudioBuffer, count: number) {
  const channelCount = Math.max(1, audioBuffer.numberOfChannels);
  const samplesPerPeak = Math.max(1, Math.floor(audioBuffer.length / count));
  const peaks = Array.from({ length: count }, (_, index) => {
    const start = index * samplesPerPeak;
    const end = index === count - 1 ? audioBuffer.length : Math.min(audioBuffer.length, start + samplesPerPeak);
    const sampleStride = Math.max(1, Math.floor((end - start) / 240));
    let peak = 0;

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = audioBuffer.getChannelData(channel);
      for (let sample = start; sample < end; sample += sampleStride) {
        peak = Math.max(peak, Math.abs(data[sample] || 0));
      }
    }

    return peak;
  });
  const loudest = Math.max(...peaks, 0.01);
  return peaks.map((peak) => clamp(peak / loudest, 0.06, 1));
}

function closeAudioContext(context: AudioContext | null) {
  if (context && context.state !== 'closed') {
    void context.close().catch(() => undefined);
  }
}

function formatSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function getScaledResolution(metadata: MediaInfo | null, selectedScale: number) {
  if (!metadata?.width || !metadata?.height) return '';
  return `${Math.round(metadata.width * selectedScale)} x ${Math.round(metadata.height * selectedScale)}`;
}

function formatAudioStreamLabel(stream: AudioStreamInfo) {
  const details = [
    stream.title,
    stream.language,
    stream.codec?.toUpperCase(),
    stream.channels ? `${stream.channels} 声道` : undefined,
    stream.default ? '默认' : undefined
  ].filter(Boolean);
  return `音轨 ${stream.index + 1}${details.length ? ` · ${details.join(' · ')}` : ''}`;
}

function parseRatioLabel(value: string): ParsedRatio | null {
  const [width, height] = value.split(':');
  if (!width || !height) return null;
  return parseRatioParts(width, height);
}

function parseRatioParts(width: string, height: string): ParsedRatio | null {
  const ratioWidth = parsePositiveNumber(width);
  const ratioHeight = parsePositiveNumber(height);
  if (!ratioWidth || !ratioHeight) return null;
  return {
    width: ratioWidth,
    height: ratioHeight,
    value: ratioWidth / ratioHeight,
    label: `${formatRatioPart(ratioWidth)}:${formatRatioPart(ratioHeight)}`
  };
}

function parseResolution(value: string): ParsedResolution | null {
  const parts = value
    .trim()
    .replace(/[×X*＊/／,，:：]/g, 'x')
    .split(/[x\s]+/)
    .filter(Boolean);
  if (parts.length !== 2) return null;
  return buildParsedResolution(parts[0], parts[1]);
}

function buildParsedResolution(widthValue: string, heightValue: string): ParsedResolution | null {
  const width = parsePositiveNumber(widthValue);
  const height = parsePositiveNumber(heightValue);
  if (!width || !height) return null;

  const normalizedWidth = Math.round(width);
  const normalizedHeight = Math.round(height);
  return {
    width: normalizedWidth,
    height: normalizedHeight,
    ratio: simplifyRatio(normalizedWidth, normalizedHeight),
    decimal: formatAspectDecimal(normalizedWidth / normalizedHeight)
  };
}

function parsePositiveNumber(value?: string) {
  const number = Number(value?.trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatRatioPart(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, '');
}

function formatAspectDecimal(value: number) {
  return value.toFixed(4).replace(/\.?0+$/, '');
}

function simplifyRatio(width: number, height: number) {
  const normalizedWidth = Math.round(Math.abs(width));
  const normalizedHeight = Math.round(Math.abs(height));
  if (!normalizedWidth || !normalizedHeight) return '-';
  const divisor = gcd(normalizedWidth, normalizedHeight);
  return `${Math.round(normalizedWidth / divisor)}:${Math.round(normalizedHeight / divisor)}`;
}

function gcd(a: number, b: number): number {
  const left = Math.round(Math.abs(a));
  const right = Math.round(Math.abs(b));
  return right ? gcd(right, left % right) : Math.max(1, left);
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
