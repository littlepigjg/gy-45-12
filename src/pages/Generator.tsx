import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload,
  Trash2,
  Download,
  Copy,
  Check,
  Settings2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  Plus,
  FolderPlus,
  X,
  GripVertical,
  Grid3X3,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { createIconItemsFromFiles, downloadDataUrl, downloadText, cn } from '@/utils';
import { generateSprite } from '@/services/spriteGenerator';
import type { SpriteResult, IconItem } from '@/types';

export default function Generator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [spriteResult, setSpriteResult] = useState<SpriteResult | null>(null);
  const [codeTab, setCodeTab] = useState<'css' | 'scss'>('css');
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    generatorIcons,
    setGeneratorIcons,
    spriteConfig,
    updateSpriteConfig,
    clearGeneratorIcons,
    addIcons,
    projects,
    addIconsToProject,
  } = useAppStore();

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const icons = await createIconItemsFromFiles(files);
    if (icons.length > 0) {
      setGeneratorIcons([...generatorIcons, ...icons]);
    }
  }, [generatorIcons, setGeneratorIcons]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  useEffect(() => {
    let cancelled = false;
    if (generatorIcons.length === 0) {
      setSpriteResult(null);
      return;
    }
    setIsGenerating(true);
    const timer = setTimeout(async () => {
      const result = await generateSprite(generatorIcons, spriteConfig);
      if (!cancelled) {
        setSpriteResult(result);
        setIsGenerating(false);
      }
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [generatorIcons, spriteConfig]);

  const removeIcon = (id: string) => {
    setGeneratorIcons(generatorIcons.filter((i) => i.id !== id));
  };

  const moveIcon = (fromIndex: number, toIndex: number) => {
    const next = [...generatorIcons];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    setGeneratorIcons(next);
  };

  const copyCode = async () => {
    const code = codeTab === 'css' ? spriteResult?.cssCode : spriteResult?.scssCode;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadAll = () => {
    if (!spriteResult) return;
    downloadDataUrl(spriteResult.imageDataUrl, 'sprite.png');
    downloadText(spriteResult.cssCode, 'sprite.css', 'text/css');
  };

  const saveToProject = async () => {
    if (!selectedProjectId || generatorIcons.length === 0) return;
    try {
      await addIcons(generatorIcons);
      addIconsToProject(selectedProjectId, generatorIcons.map((i) => i.id));
      setShowProjectModal(false);
      setSelectedProjectId('');
    } catch {
      /* toast already shown in store */
    }
  };

  const DragHandle = ({ index }: { index: number }) => {
    const [dragging, setDragging] = useState(false);
    const dragOver = useRef<number | null>(null);

    return (
      <div
        draggable
        onDragStart={(e) => {
          setDragging(true);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        }}
        onDragEnd={() => setDragging(false)}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          dragOver.current = index;
        }}
        onDrop={(e) => {
          e.preventDefault();
          const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
          if (!Number.isNaN(fromIdx) && fromIdx !== index) {
            moveIcon(fromIdx, index);
          }
          dragOver.current = null;
        }}
        className={cn(
          'group relative bg-ink-700/40 border rounded-lg overflow-hidden transition-all cursor-grab active:cursor-grabbing',
          dragging ? 'opacity-40 scale-95' : 'border-ink-600 hover:border-neon-cyan/40'
        )}
      >
        <div className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-5 h-5 rounded bg-ink-900/80 flex items-center justify-center">
            <GripVertical className="w-3 h-3 text-slate-400" />
          </div>
        </div>
        <button
          onClick={() => removeIcon(generatorIcons[index].id)}
          className="absolute top-1 right-1 z-10 w-5 h-5 rounded bg-ink-900/80 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-rose-600 transition-all"
        >
          <X className="w-3 h-3 text-white" />
        </button>
        <div className="aspect-square checkerboard p-2 flex items-center justify-center">
          <img
            src={generatorIcons[index].dataUrl}
            alt={generatorIcons[index].name}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        </div>
        <div className="px-2 py-1.5 bg-ink-800/80 border-t border-ink-700/50">
          <div className="text-[11px] text-slate-300 truncate font-mono">
            {generatorIcons[index].name}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {generatorIcons[index].width}×{generatorIcons[index].height}
          </div>
        </div>
      </div>
    );
  };

  const configItems = useMemo(() => [
    {
      label: '排列列数',
      key: 'columns' as const,
      type: 'number',
      min: 1,
      max: 20,
      value: spriteConfig.columns,
    },
    {
      label: '图标间距 (px)',
      key: 'spacing' as const,
      type: 'number',
      min: 0,
      max: 64,
      value: spriteConfig.spacing,
    },
  ], [spriteConfig]);

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 px-6 py-4 border-b border-ink-700/50 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">精灵图生成器</h2>
          <p className="text-sm text-slate-500 mt-0.5">上传图标、配置参数、一键生成精灵图与CSS代码</p>
        </div>
        <div className="flex items-center gap-2">
          {generatorIcons.length > 0 && (
            <>
              <button
                onClick={() => setShowProjectModal(true)}
                className="btn btn-secondary"
              >
                <FolderPlus className="w-4 h-4" />
                保存到项目
              </button>
              <button onClick={clearGeneratorIcons} className="btn btn-danger">
                <Trash2 className="w-4 h-4" />
                清空
              </button>
            </>
          )}
          {spriteResult && (
            <button onClick={downloadAll} className="btn btn-primary">
              <Download className="w-4 h-4" />
              下载全部
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr_380px] gap-0">
        <div className="flex flex-col border-r border-ink-700/50 overflow-hidden">
          <div className="p-4 border-b border-ink-700/50">
            <div className="flex items-center gap-2 mb-3">
              <Settings2 className="w-4 h-4 text-neon-cyan" />
              <h3 className="font-semibold text-sm text-white">参数配置</h3>
            </div>
            <div className="space-y-3">
              {configItems.map((item) => (
                <div key={item.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-400">{item.label}</label>
                    <input
                      type="number"
                      min={item.min}
                      max={item.max}
                      value={item.value}
                      onChange={(e) =>
                        updateSpriteConfig({ [item.key]: Math.max(item.min, Math.min(item.max, parseInt(e.target.value) || item.min)) })
                      }
                      className="w-16 h-7 bg-ink-800 border border-ink-600 rounded px-2 text-xs text-slate-200 text-center focus:outline-none focus:border-neon-cyan/60"
                    />
                  </div>
                  <input
                    type="range"
                    min={item.min}
                    max={item.max}
                    value={item.value}
                    onChange={(e) => updateSpriteConfig({ [item.key]: parseInt(e.target.value) })}
                    className="w-full accent-neon-cyan"
                  />
                </div>
              ))}

              <div>
                <label className="text-xs text-slate-400 block mb-1.5">背景颜色</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={spriteConfig.bgColor === 'transparent' ? '#000000' : spriteConfig.bgColor}
                    onChange={(e) => updateSpriteConfig({ bgColor: e.target.value })}
                    className="w-10 h-8 rounded border border-ink-600 bg-ink-800 cursor-pointer"
                  />
                  <button
                    onClick={() => updateSpriteConfig({ bgColor: 'transparent' })}
                    className={cn(
                      'flex-1 h-8 rounded border text-xs font-medium transition-colors',
                      spriteConfig.bgColor === 'transparent'
                        ? 'border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan'
                        : 'border-ink-600 bg-ink-800 text-slate-400 hover:text-slate-200'
                    )}
                  >
                    透明
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5">CSS类名前缀</label>
                <input
                  type="text"
                  value={spriteConfig.classPrefix}
                  onChange={(e) => updateSpriteConfig({ classPrefix: e.target.value || 'sprite' })}
                  className="input font-mono text-xs"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={spriteConfig.retina}
                  onChange={(e) => updateSpriteConfig({ retina: e.target.checked })}
                  className="w-4 h-4 accent-neon-cyan"
                />
                <span className="text-xs text-slate-300">启用 Retina 2x 模式</span>
              </label>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-ink-700/50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-white">
                图标列表 <span className="text-slate-500 font-normal">({generatorIcons.length})</span>
              </h3>
              <button
                onClick={() => inputRef.current?.click()}
                className="btn-ghost btn !px-2 !py-1 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                添加
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'mb-3 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
                  isDragging
                    ? 'border-neon-cyan bg-neon-cyan/5'
                    : 'border-ink-600 hover:border-neon-cyan/40 hover:bg-white/[0.02]'
                )}
              >
                <Upload className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                <div className="text-sm text-slate-400">
                  {isDragging ? '松开以上传' : '拖拽或点击上传图标'}
                </div>
                <div className="text-xs text-slate-600 mt-1">支持 PNG / JPG / SVG / GIF / WebP</div>
              </div>

              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />

              {generatorIcons.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {generatorIcons.map((_, i) => (
                    <DragHandle key={generatorIcons[i].id} index={i} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-neon-cyan" />
              <h3 className="font-semibold text-sm text-white">预览</h3>
              {spriteResult && (
                <span className="chip bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 font-mono">
                  {spriteResult.totalWidth}×{spriteResult.totalHeight}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))} className="btn-ghost btn !px-2 !py-1">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 w-14 text-center font-mono">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom((z) => Math.min(5, z + 0.1))} className="btn-ghost btn !px-2 !py-1">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => setZoom(1)} className="btn-ghost btn !px-2 !py-1 ml-1">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto scrollbar-thin bg-ink-950/50 p-8">
            {isGenerating && !spriteResult && (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                生成中...
              </div>
            )}
            {!isGenerating && !spriteResult && generatorIcons.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-600">
                <Grid3X3 className="w-16 h-16 mb-4 opacity-30" />
                <div className="text-sm">上传图标开始生成精灵图</div>
              </div>
            )}
            {spriteResult && (
              <div className="flex items-start justify-center checkerboard rounded-lg p-4 inline-block min-w-full">
                <img
                  src={spriteResult.imageDataUrl}
                  alt="sprite preview"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                    imageRendering: zoom > 1.5 ? 'pixelated' : 'auto',
                  }}
                  className="max-w-none shadow-2xl"
                  draggable={false}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col border-l border-ink-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-700/50 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-white">CSS 代码</h3>
            <div className="flex items-center gap-1">
              <div className="flex bg-ink-800 rounded-md border border-ink-600 overflow-hidden">
                <button
                  onClick={() => setCodeTab('css')}
                  className={cn(
                    'px-3 py-1 text-xs font-mono transition-colors',
                    codeTab === 'css' ? 'bg-neon-cyan text-ink-950' : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  CSS
                </button>
                <button
                  onClick={() => setCodeTab('scss')}
                  className={cn(
                    'px-3 py-1 text-xs font-mono transition-colors border-l border-ink-600',
                    codeTab === 'scss' ? 'bg-neon-cyan text-ink-950' : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  SCSS
                </button>
              </div>
              <button
                onClick={copyCode}
                disabled={!spriteResult}
                className="btn-ghost btn !px-2 !py-1 disabled:opacity-40"
              >
                {copied ? <Check className="w-4 h-4 text-neon-lime" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  if (!spriteResult) return;
                  downloadText(
                    codeTab === 'css' ? spriteResult.cssCode : spriteResult.scssCode,
                    codeTab === 'css' ? 'sprite.css' : 'sprite.scss',
                    'text/plain'
                  );
                }}
                disabled={!spriteResult}
                className="btn-ghost btn !px-2 !py-1 disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto scrollbar-thin p-4 bg-ink-950/60">
            {spriteResult ? (
              <pre className="code-block text-slate-300">
                <code>{codeTab === 'css' ? spriteResult.cssCode : spriteResult.scssCode}</code>
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                代码将在这里生成
              </div>
            )}
          </div>
        </div>
      </div>

      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm">
          <div className="card p-6 w-96">
            <h3 className="text-lg font-bold text-white mb-4">保存到项目</h3>
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
          </div>
        </div>
      )}
    </div>
  );
}
