import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Scissors, ScanEye, RotateCcw, Check, FolderPlus,
  Trash2, Package, Grid3x3, Sparkles, AlertTriangle, Layers, Eye, Plus,
} from 'lucide-react';
import JSZip from 'jszip';
import { fileToDataUrl, createIconItemsFromFiles, cn, generateId } from '@/utils';
import { splitSprite, autoDetectGrid } from '@/services/spriteSplitter';
import { smartDetect, cropBoxesToIcons } from '@/services/smartDetector';
import { useAppStore } from '@/store/useAppStore';
import type { SplitConfig, SplitIcon, DetectionMode, DetectionBox, SmartDetectionResult } from '@/types';
import BoxEditor from '@/components/splitter/BoxEditor';

const GROUP_COLORS = [
  '#22d3ee',
  '#f59e0b',
  '#f43f5e',
  '#a78bfa',
  '#34d399',
  '#fb7185',
  '#60a5fa',
  '#fbbf24',
];

export default function Splitter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [spriteDataUrl, setSpriteDataUrl] = useState<string>('');
  const [spriteSize, setSpriteSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [splitIcons, setSplitIcons] = useState<SplitIcon[]>([]);

  const [detectionMode, setDetectionMode] = useState<DetectionMode>('grid');
  const [config, setConfig] = useState<SplitConfig>({
    rows: 4,
    columns: 4,
    iconWidth: 32,
    iconHeight: 32,
    spacing: 0,
    padding: 0,
  });
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoTrim, setAutoTrim] = useState(true);

  const [detectionBoxes, setDetectionBoxes] = useState<DetectionBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [smartResult, setSmartResult] = useState<SmartDetectionResult | null>(null);
  const [showGroups, setShowGroups] = useState(true);
  const [hideUncertain, setHideUncertain] = useState(false);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [saved, setSaved] = useState(false);

  const { projects, addIcons, addIconsToProject } = useAppStore();

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const dataUrl = await fileToDataUrl(file);
    setSpriteDataUrl(dataUrl);
    setSplitIcons([]);
    setDetectionBoxes([]);
    setSmartResult(null);
    setSelectedBoxId(null);

    const img = new Image();
    img.onload = () => {
      setSpriteSize({ width: img.width, height: img.height });
    };
    img.src = dataUrl;
  }, []);

  const runAutoDetect = async () => {
    if (!spriteDataUrl) return;
    setAutoDetecting(true);
    try {
      if (detectionMode === 'grid') {
        const detected = await autoDetectGrid(spriteDataUrl);
        setConfig({
          rows: detected.rows,
          columns: detected.columns,
          iconWidth: detected.iconWidth,
          iconHeight: detected.iconHeight,
          spacing: detected.spacing,
          padding: 0,
        });
      } else {
        const result = await smartDetect(spriteDataUrl);
        setSmartResult(result);
        setDetectionBoxes(result.boxes);
        setSelectedBoxId(null);
      }
    } finally {
      setAutoDetecting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!spriteDataUrl) {
      setSplitIcons([]);
      return;
    }
    const timer = setTimeout(async () => {
      let icons: SplitIcon[] = [];
      if (detectionMode === 'grid') {
        icons = await splitSprite(spriteDataUrl, config, autoTrim);
      } else {
        const boxes = hideUncertain
          ? detectionBoxes.filter((b) => !b.uncertain)
          : detectionBoxes;
        if (boxes.length > 0) {
          icons = await cropBoxesToIcons(spriteDataUrl, boxes, autoTrim);
        }
      }
      if (!cancelled) setSplitIcons(icons);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [spriteDataUrl, config, detectionMode, detectionBoxes, autoTrim, hideUncertain]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const downloadIcon = (icon: SplitIcon) => {
    const a = document.createElement('a');
    a.href = icon.dataUrl;
    a.download = `${icon.name}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAllZip = async () => {
    if (splitIcons.length === 0) return;
    const zip = new JSZip();
    splitIcons.forEach((icon) => {
      const base64 = icon.dataUrl.split(',')[1];
      zip.file(`${icon.name}.png`, base64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'split-icons.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveToProject = async () => {
    if (!selectedProjectId || splitIcons.length === 0) return;

    const files = splitIcons.map((icon) => {
      const byteString = atob(icon.dataUrl.split(',')[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new File([ab], `${icon.name}.png`, { type: 'image/png' });
    });

    const newIcons = await createIconItemsFromFiles(files);
    try {
      await addIcons(newIcons);
      addIconsToProject(selectedProjectId, newIcons.map((i) => i.id));
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setShowProjectModal(false);
        setSelectedProjectId('');
      }, 1200);
    } catch {
      /* toast already shown in store */
    }
  };

  const updateConfig = (key: keyof SplitConfig, value: number) => {
    setConfig((c) => ({ ...c, [key]: Math.max(0, value) }));
  };

  const switchDetectionMode = (mode: DetectionMode) => {
    setDetectionMode(mode);
    setSplitIcons([]);
    if (mode === 'grid') {
      setDetectionBoxes([]);
      setSmartResult(null);
      setSelectedBoxId(null);
    } else {
      setSelectedBoxId(null);
    }
  };

  const addBoxAtCenter = () => {
    if (!spriteDataUrl) return;
    const cx = spriteSize.width / 2 - 24;
    const cy = spriteSize.height / 2 - 24;
    const newBox: DetectionBox = {
      id: generateId(),
      x: Math.max(0, cx),
      y: Math.max(0, cy),
      width: 48,
      height: 48,
      confidence: 0.6,
      uncertain: false,
    };
    setDetectionBoxes((prev) => [...prev, newBox]);
    setSelectedBoxId(newBox.id);
  };

  const clearUncertain = () => {
    setDetectionBoxes((prev) => prev.filter((b) => !b.uncertain));
  };

  const groupColors = smartResult
    ? smartResult.groups.map((g, i) => ({ id: g.id, color: GROUP_COLORS[i % GROUP_COLORS.length] }))
    : [];

  const displayBoxes = hideUncertain
    ? detectionBoxes.filter((b) => !b.uncertain)
    : detectionBoxes;

  const uncertainCount = detectionBoxes.filter((b) => b.uncertain).length;

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 px-6 py-4 border-b border-ink-700/50 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">精灵图拆分器</h2>
          <p className="text-sm text-slate-500 mt-0.5">导入现有精灵图，自动或手动拆分为单个图标</p>
        </div>
        <div className="flex items-center gap-2">
          {splitIcons.length > 0 && (
            <>
              <button onClick={() => setShowProjectModal(true)} className="btn btn-secondary">
                <FolderPlus className="w-4 h-4" />
                保存到项目
              </button>
              <button onClick={downloadAllZip} className="btn btn-primary">
                <Package className="w-4 h-4" />
                下载 ZIP ({splitIcons.length})
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[340px_1fr] gap-0">
        <div className="flex flex-col border-r border-ink-700/50 overflow-hidden">
          <div className="p-4 border-b border-ink-700/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-neon-cyan" />
                导入精灵图
              </h3>
              {spriteDataUrl && (
                <button
                  onClick={() => {
                    setSpriteDataUrl('');
                    setSplitIcons([]);
                    setSpriteSize({ width: 0, height: 0 });
                    setDetectionBoxes([]);
                    setSmartResult(null);
                  }}
                  className="btn-ghost btn !px-2 !py-1 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清除
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
                isDragging
                  ? 'border-neon-cyan bg-neon-cyan/5'
                  : 'border-ink-600 hover:border-neon-cyan/40 hover:bg-white/[0.02]'
              )}
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-slate-500" />
              <div className="text-sm text-slate-400">
                {isDragging ? '松开以上传' : '拖拽或点击上传精灵图'}
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            {spriteDataUrl && (
              <div className="mt-3 p-3 bg-ink-900/50 rounded-lg border border-ink-700/50">
                <div className="checkerboard rounded p-2 mb-2">
                  <img src={spriteDataUrl} alt="sprite" className="max-w-full max-h-32 mx-auto" />
                </div>
                <div className="text-xs text-slate-400 font-mono text-center">
                  {spriteSize.width} × {spriteSize.height} px
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-b border-ink-700/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <Scissors className="w-4 h-4 text-neon-amber" />
                检测模式
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => switchDetectionMode('grid')}
                className={cn(
                  'p-3 rounded-lg border transition-all text-left',
                  detectionMode === 'grid'
                    ? 'border-neon-cyan/60 bg-neon-cyan/10'
                    : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                )}
              >
                <Grid3x3 className={cn('w-5 h-5 mb-1', detectionMode === 'grid' ? 'text-neon-cyan' : 'text-slate-400')} />
                <div className={cn('text-xs font-medium', detectionMode === 'grid' ? 'text-white' : 'text-slate-300')}>固定网格</div>
                <div className="text-[10px] text-slate-500 mt-0.5">规则排列图标</div>
              </button>
              <button
                onClick={() => switchDetectionMode('smart')}
                className={cn(
                  'p-3 rounded-lg border transition-all text-left',
                  detectionMode === 'smart'
                    ? 'border-neon-cyan/60 bg-neon-cyan/10'
                    : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                )}
              >
                <Sparkles className={cn('w-5 h-5 mb-1', detectionMode === 'smart' ? 'text-neon-cyan' : 'text-slate-400')} />
                <div className={cn('text-xs font-medium', detectionMode === 'smart' ? 'text-white' : 'text-slate-300')}>智能检测</div>
                <div className="text-[10px] text-slate-500 mt-0.5">不规则布局</div>
              </button>
            </div>

            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-white">
                {detectionMode === 'grid' ? '网格配置' : '智能配置'}
              </h3>
              <button
                onClick={runAutoDetect}
                disabled={!spriteDataUrl || autoDetecting}
                className="btn-ghost btn !px-2 !py-1 text-xs disabled:opacity-40"
              >
                <ScanEye className={cn('w-3.5 h-3.5', autoDetecting && 'animate-spin')} />
                {autoDetecting ? '检测中...' : '自动检测'}
              </button>
            </div>

            {detectionMode === 'grid' ? (
              <div className="space-y-3">
                {[
                  { label: '行数', key: 'rows' as const, min: 1 },
                  { label: '列数', key: 'columns' as const, min: 1 },
                  { label: '图标宽度', key: 'iconWidth' as const, min: 1 },
                  { label: '图标高度', key: 'iconHeight' as const, min: 1 },
                  { label: '间距', key: 'spacing' as const, min: 0 },
                  { label: '内边距', key: 'padding' as const, min: 0 },
                ].map(({ label, key, min }) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <label className="text-xs text-slate-400 shrink-0 w-20">{label} (px)</label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateConfig(key, config[key] - 1)}
                        disabled={config[key] <= min}
                        className="w-6 h-7 rounded bg-ink-800 border border-ink-600 text-slate-400 hover:text-slate-200 hover:border-ink-500 disabled:opacity-30 text-sm"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={min}
                        value={config[key]}
                        onChange={(e) => updateConfig(key, parseInt(e.target.value) || min)}
                        className="w-16 h-7 bg-ink-800 border border-ink-600 rounded px-2 text-xs text-slate-200 text-center focus:outline-none focus:border-neon-cyan/60"
                      />
                      <button
                        onClick={() => updateConfig(key, config[key] + 1)}
                        className="w-6 h-7 rounded bg-ink-800 border border-ink-600 text-slate-400 hover:text-slate-200 hover:border-ink-500 text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setConfig({ rows: 4, columns: 4, iconWidth: 32, iconHeight: 32, spacing: 0, padding: 0 })}
                  className="w-full btn-ghost btn text-xs mt-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  重置默认
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTrim}
                    onChange={(e) => setAutoTrim(e.target.checked)}
                    className="rounded bg-ink-800 border-ink-600"
                  />
                  <span className="text-xs text-slate-300">自动裁剪透明边缘</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideUncertain}
                    onChange={(e) => setHideUncertain(e.target.checked)}
                    className="rounded bg-ink-800 border-ink-600"
                  />
                  <span className="text-xs text-slate-300">隐藏待确认区域</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGroups}
                    onChange={(e) => setShowGroups(e.target.checked)}
                    className="rounded bg-ink-800 border-ink-600"
                  />
                  <span className="text-xs text-slate-300">显示尺寸分组颜色</span>
                </label>

                <div className="pt-2 border-t border-ink-700/50 space-y-2">
                  <button
                    onClick={addBoxAtCenter}
                    disabled={!spriteDataUrl}
                    className="w-full btn btn-secondary text-xs disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加检测框
                  </button>
                  {uncertainCount > 0 && (
                    <button
                      onClick={clearUncertain}
                      className="w-full btn-ghost btn text-xs text-amber-400 hover:text-amber-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      清除 {uncertainCount} 个待确认框
                    </button>
                  )}
                </div>

                {smartResult && (
                  <div className="pt-2 border-t border-ink-700/50">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Layers className="w-3.5 h-3.5 text-neon-cyan" />
                      <span className="text-xs font-semibold text-white">检测结果</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">检测方式</span>
                        <span className="text-slate-200 font-mono">
                          {smartResult.method === 'grid' ? '规则网格' :
                           smartResult.method === 'edge' ? '边缘检测' : '混合模式'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">检测到图标</span>
                        <span className="text-neon-cyan font-mono">{smartResult.boxes.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">尺寸分组</span>
                        <span className="text-neon-amber font-mono">{smartResult.groups.length}</span>
                      </div>
                      {uncertainCount > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            待确认
                          </span>
                          <span className="text-amber-400 font-mono">{uncertainCount}</span>
                        </div>
                      )}
                      {smartResult.backgroundDetected && smartResult.backgroundColor && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">背景色</span>
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-3 h-3 rounded border border-ink-600"
                              style={{
                                backgroundColor: `rgb(${smartResult.backgroundColor.r},${smartResult.backgroundColor.g},${smartResult.backgroundColor.b})`,
                              }}
                            />
                            <span className="text-slate-300 font-mono">
                              #{smartResult.backgroundColor.r.toString(16).padStart(2, '0')}
                              {smartResult.backgroundColor.g.toString(16).padStart(2, '0')}
                              {smartResult.backgroundColor.b.toString(16).padStart(2, '0')}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    {smartResult.groups.length > 1 && showGroups && (
                      <div className="mt-3 pt-2 border-t border-ink-700/50">
                        <div className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">尺寸分组</div>
                        <div className="space-y-1">
                          {smartResult.groups.map((g, i) => (
                            <div key={g.id} className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-sm"
                                style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}
                              />
                              <span className="text-xs text-slate-300 font-mono">
                                {g.avgWidth}×{g.avgHeight}
                              </span>
                              <span className="text-[10px] text-slate-500 ml-auto">
                                {g.boxIds.length} 个
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {splitIcons.length > 0 && (
            <div className="p-4 flex-1 overflow-hidden flex flex-col">
              <h3 className="font-semibold text-sm text-white mb-3">
                拆分结果 <span className="text-slate-500 font-normal">({splitIcons.length} 个)</span>
              </h3>
              <div className="text-xs text-slate-500 mb-3">点击单个图标下载，或使用上方 ZIP 批量下载</div>
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                <div className="grid grid-cols-3 gap-2">
                  {splitIcons.map((icon) => (
                    <button
                      key={icon.index}
                      onClick={() => downloadIcon(icon)}
                      className="group bg-ink-700/40 border border-ink-600 rounded-lg p-2 hover:border-neon-cyan/40 transition-all"
                      title={icon.name}
                    >
                      <div className="aspect-square checkerboard rounded flex items-center justify-center mb-1.5">
                        <img
                          src={icon.dataUrl}
                          alt={icon.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 truncate font-mono group-hover:text-neon-cyan">
                        {icon.name}
                      </div>
                      <div className="text-[9px] text-slate-600 font-mono">
                        {icon.width}×{icon.height}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col overflow-hidden">
          {detectionMode === 'grid' ? (
            <>
              <div className="px-4 py-3 border-b border-ink-700/50">
                <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                  <ScanEye className="w-4 h-4 text-neon-cyan" />
                  预览网格
                </h3>
              </div>
              <div className="flex-1 overflow-auto scrollbar-thin bg-ink-950/50 p-8 flex items-start justify-center">
                {!spriteDataUrl ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    <Scissors className="w-16 h-16 mb-4 opacity-30" />
                    <div className="text-sm">上传精灵图开始拆分</div>
                  </div>
                ) : (
                  <div className="relative checkerboard rounded-lg p-4 inline-block">
                    <img src={spriteDataUrl} alt="sprite" className="block max-w-none" style={{ imageRendering: 'pixelated' }} />
                    <svg
                      className="absolute top-4 left-4 pointer-events-none"
                      width={spriteSize.width}
                      height={spriteSize.height}
                    >
                      {Array.from({ length: config.rows }).map((_, r) =>
                        Array.from({ length: config.columns }).map((_, c) => {
                          const x = config.padding + c * (config.iconWidth + config.spacing);
                          const y = config.padding + r * (config.iconHeight + config.spacing);
                          return (
                            <rect
                              key={`${r}-${c}`}
                              x={x}
                              y={y}
                              width={config.iconWidth}
                              height={config.iconHeight}
                              fill="none"
                              stroke="#22d3ee"
                              strokeWidth={1}
                              strokeDasharray="4,2"
                              opacity={0.6}
                            />
                          );
                        })
                      )}
                    </svg>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-ink-700/50 flex items-center justify-between">
                <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-neon-cyan" />
                  智能检测预览
                  {detectionBoxes.length > 0 && (
                    <span className="text-xs font-normal text-slate-500 ml-2">
                      拖拽移动框，拖动角落调整大小
                    </span>
                  )}
                </h3>
              </div>
              {!spriteDataUrl ? (
                <div className="flex-1 overflow-auto scrollbar-thin bg-ink-950/50 p-8 flex items-start justify-center">
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    <Sparkles className="w-16 h-16 mb-4 opacity-30" />
                    <div className="text-sm">上传精灵图开始智能检测</div>
                  </div>
                </div>
              ) : (
                <BoxEditor
                  imageSrc={spriteDataUrl}
                  imageWidth={spriteSize.width}
                  imageHeight={spriteSize.height}
                  boxes={displayBoxes}
                  onChange={setDetectionBoxes}
                  selectedBoxId={selectedBoxId}
                  onSelectBox={setSelectedBoxId}
                  groups={showGroups ? groupColors : []}
                />
              )}
            </>
          )}
        </div>
      </div>

      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm">
          <div className="card p-6 w-96">
            <h3 className="text-lg font-bold text-white mb-4">保存到项目</h3>
            {saved ? (
              <div className="py-8 text-center">
                <Check className="w-12 h-12 text-neon-lime mx-auto mb-3" />
                <div className="text-slate-300">已保存 {splitIcons.length} 个图标</div>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin mb-4">
                  {projects.length === 0 ? (
                    <div className="text-sm text-slate-500 py-4 text-center">暂无项目，请先在图标库中创建</div>
                  ) : (
                    projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProjectId(p.id)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-lg border transition-all',
                          selectedProjectId === p.id
                            ? 'border-neon-cyan/60 bg-neon-cyan/10'
                            : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                        )}
                      >
                        <div className="font-medium text-sm text-white">{p.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{p.iconIds.length} 个图标</div>
                      </button>
                    ))
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowProjectModal(false)} className="btn btn-secondary">
                    取消
                  </button>
                  <button
                    onClick={saveToProject}
                    disabled={!selectedProjectId}
                    className="btn btn-primary disabled:opacity-40"
                  >
                    保存
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
