import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Download, Scissors, ScanEye, RotateCcw, Check, FolderPlus, Trash2, Package } from 'lucide-react';
import JSZip from 'jszip';
import { fileToDataUrl, createIconItemsFromFiles, cn } from '@/utils';
import { splitSprite, autoDetectGrid } from '@/services/spriteSplitter';
import { useAppStore } from '@/store/useAppStore';
import type { SplitConfig, SplitIcon } from '@/types';

export default function Splitter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [spriteDataUrl, setSpriteDataUrl] = useState<string>('');
  const [spriteSize, setSpriteSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [splitIcons, setSplitIcons] = useState<SplitIcon[]>([]);
  const [config, setConfig] = useState<SplitConfig>({
    rows: 4,
    columns: 4,
    iconWidth: 32,
    iconHeight: 32,
    spacing: 0,
    padding: 0,
  });
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [saved, setSaved] = useState(false);

  const { projects, addIcons, addIconsToProject } = useAppStore();

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const dataUrl = await fileToDataUrl(file);
    setSpriteDataUrl(dataUrl);
    setSplitIcons([]);

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
      const detected = await autoDetectGrid(spriteDataUrl);
      setConfig({
        rows: detected.rows,
        columns: detected.columns,
        iconWidth: detected.iconWidth,
        iconHeight: detected.iconHeight,
        spacing: detected.spacing,
        padding: 0,
      });
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
      const icons = await splitSprite(spriteDataUrl, config, true);
      if (!cancelled) setSplitIcons(icons);
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [spriteDataUrl, config]);

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

      <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr] gap-0">
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
                拆分配置
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
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col overflow-hidden">
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
