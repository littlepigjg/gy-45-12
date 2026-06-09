import { useState, useRef, useCallback, useEffect } from 'react';
import type { DetectionBox } from '../../types';
import { Trash2, Plus, MousePointer, Hand } from 'lucide-react';
import { cn } from '../../utils';

type Tool = 'select' | 'create' | 'pan';

interface BoxEditorProps {
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  boxes: DetectionBox[];
  onChange: (boxes: DetectionBox[]) => void;
  selectedBoxId: string | null;
  onSelectBox: (id: string | null) => void;
  groups?: { id: string; color: string }[];
}

const HANDLE_SIZE = 8;
const MIN_BOX_SIZE = 6;

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

function getBoxColor(
  box: DetectionBox,
  groups: { id: string; color: string }[] = []
): string {
  if (box.uncertain) return '#f59e0b';
  if (box.groupId) {
    const g = groups.find((g) => g.id === box.groupId);
    if (g) return g.color;
  }
  return '#22d3ee';
}

type ResizeHandle =
  | 'nw' | 'n' | 'ne'
  | 'w' | 'e'
  | 'sw' | 's' | 'se'
  | null;

export default function BoxEditor({
  imageSrc,
  imageWidth,
  imageHeight,
  boxes,
  onChange,
  selectedBoxId,
  onSelectBox,
  groups = [],
}: BoxEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeHandle>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [createStart, setCreateStart] = useState({ x: 0, y: 0 });
  const [tempBox, setTempBox] = useState<DetectionBox | null>(null);
  const [originalBox, setOriginalBox] = useState<DetectionBox | null>(null);

  const groupColors = groups.length > 0
    ? groups
    : Array.from(new Set(boxes.map((b) => b.groupId).filter(Boolean))).map((id, i) => ({
        id: id as string,
        color: GROUP_COLORS[i % GROUP_COLORS.length],
      }));

  const screenToImage = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;
    return { x, y };
  }, [zoom, pan]);

  const getHandleHit = useCallback((x: number, y: number, box: DetectionBox): ResizeHandle => {
    if (box.id !== selectedBoxId) return null;
    const hs = HANDLE_SIZE / zoom;
    const { x: bx, y: by, width: bw, height: bh } = box;
    const handles: { pos: ResizeHandle; hx: number; hy: number }[] = [
      { pos: 'nw', hx: bx, hy: by },
      { pos: 'n', hx: bx + bw / 2, hy: by },
      { pos: 'ne', hx: bx + bw, hy: by },
      { pos: 'w', hx: bx, hy: by + bh / 2 },
      { pos: 'e', hx: bx + bw, hy: by + bh / 2 },
      { pos: 'sw', hx: bx, hy: by + bh },
      { pos: 's', hx: bx + bw / 2, hy: by + bh },
      { pos: 'se', hx: bx + bw, hy: by + bh },
    ];
    for (const h of handles) {
      if (Math.abs(x - h.hx) <= hs && Math.abs(y - h.hy) <= hs) {
        return h.pos;
      }
    }
    return null;
  }, [selectedBoxId, zoom]);

  const findHit = useCallback((x: number, y: number): { boxId: string; handle: ResizeHandle } | null => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      const handle = getHandleHit(x, y, b);
      if (handle) return { boxId: b.id, handle };
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        return { boxId: b.id, handle: null };
      }
    }
    return null;
  }, [boxes, getHandleHit]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const pos = screenToImage(e.clientX, e.clientY);

    if (tool === 'pan' || e.shiftKey) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (tool === 'create') {
      setIsCreating(true);
      setCreateStart(pos);
      setTempBox({
        id: 'temp',
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        confidence: 0.5,
      });
      onSelectBox(null);
      return;
    }

    const hit = findHit(pos.x, pos.y);
    if (hit?.handle) {
      setIsResizing(hit.handle);
      setOriginalBox(boxes.find((b) => b.id === hit.boxId) || null);
      setDragStart(pos);
      return;
    }
    if (hit?.boxId) {
      setIsDragging(true);
      setOriginalBox(boxes.find((b) => b.id === hit.boxId) || null);
      setDragStart(pos);
      onSelectBox(hit.boxId);
      return;
    }

    onSelectBox(null);
  }, [tool, pan, boxes, onSelectBox, screenToImage, findHit]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      return;
    }

    if (isCreating && tempBox) {
      const pos = screenToImage(e.clientX, e.clientY);
      const x = Math.max(0, Math.min(imageWidth, Math.min(createStart.x, pos.x)));
      const y = Math.max(0, Math.min(imageHeight, Math.min(createStart.y, pos.y)));
      const w = Math.max(MIN_BOX_SIZE, Math.min(imageWidth - x, Math.abs(pos.x - createStart.x)));
      const h = Math.max(MIN_BOX_SIZE, Math.min(imageHeight - y, Math.abs(pos.y - createStart.y)));
      setTempBox({ ...tempBox, x, y, width: w, height: h });
      return;
    }

    if ((isDragging || isResizing) && originalBox) {
      const pos = screenToImage(e.clientX, e.clientY);
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      const nb = { ...originalBox };

      if (isDragging) {
        nb.x = Math.max(0, Math.min(imageWidth - nb.width, originalBox.x + dx));
        nb.y = Math.max(0, Math.min(imageHeight - nb.height, originalBox.y + dy));
      } else if (isResizing) {
        if (isResizing.includes('e')) nb.width = Math.max(MIN_BOX_SIZE, originalBox.width + dx);
        if (isResizing.includes('s')) nb.height = Math.max(MIN_BOX_SIZE, originalBox.height + dy);
        if (isResizing.includes('w')) {
          const nw = Math.max(MIN_BOX_SIZE, originalBox.width - dx);
          nb.x = originalBox.x + (originalBox.width - nw);
          nb.width = nw;
        }
        if (isResizing.includes('n')) {
          const nh = Math.max(MIN_BOX_SIZE, originalBox.height - dy);
          nb.y = originalBox.y + (originalBox.height - nh);
          nb.height = nh;
        }
        nb.x = Math.max(0, nb.x);
        nb.y = Math.max(0, nb.y);
        nb.width = Math.min(nb.width, imageWidth - nb.x);
        nb.height = Math.min(nb.height, imageHeight - nb.y);
      }

      nb.confidence = 0.7;
      nb.uncertain = false;
      onChange(boxes.map((b) => (b.id === originalBox.id ? nb : b)));
    }
  }, [isPanning, isCreating, isDragging, isResizing, dragStart, createStart, tempBox, originalBox, boxes, onChange, screenToImage, imageWidth, imageHeight]);

  const handleMouseUp = useCallback(() => {
    if (isPanning) setIsPanning(false);
    if (isCreating && tempBox && tempBox.width >= MIN_BOX_SIZE && tempBox.height >= MIN_BOX_SIZE) {
      const newBox: DetectionBox = {
        ...tempBox,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        confidence: 0.7,
        uncertain: false,
      };
      onChange([...boxes, newBox]);
      onSelectBox(newBox.id);
    }
    setIsCreating(false);
    setTempBox(null);
    setIsDragging(false);
    setIsResizing(null);
    setOriginalBox(null);
  }, [isPanning, isCreating, tempBox, boxes, onChange, onSelectBox]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBoxId && document.activeElement?.tagName !== 'INPUT') {
          onChange(boxes.filter((b) => b.id !== selectedBoxId));
          onSelectBox(null);
        }
      }
      if (e.key === 'v') setTool('select');
      if (e.key === 'r') setTool('create');
      if (e.key === 'h') setTool('pan');
      if (e.key === 'Escape') onSelectBox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boxes, selectedBoxId, onChange, onSelectBox]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.2, Math.min(5, zoom * (1 + delta)));
    setZoom(newZoom);
  }, [zoom]);

  const deleteSelected = () => {
    if (!selectedBoxId) return;
    onChange(boxes.filter((b) => b.id !== selectedBoxId));
    onSelectBox(null);
  };

  const selectedBox = boxes.find((b) => b.id === selectedBoxId);
  const displayBoxes = tempBox ? [...boxes, tempBox] : boxes;

  return (
    <div className="h-full flex flex-col bg-ink-950/50">
      <div className="shrink-0 px-4 py-2 border-b border-ink-700/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {[
            { t: 'select' as Tool, icon: MousePointer, label: '选择 (V)' },
            { t: 'create' as Tool, icon: Plus, label: '绘制框 (R)' },
            { t: 'pan' as Tool, icon: Hand, label: '平移 (H)' },
          ].map(({ t, icon: Icon, label }) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              title={label}
              className={cn(
                'p-2 rounded transition-all',
                tool === t
                  ? 'bg-neon-cyan/20 text-neon-cyan'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-ink-800'
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <div className="w-px h-6 bg-ink-700 mx-2" />
          <button
            onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
            className="px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-ink-800 text-sm"
          >
            −
          </button>
          <span className="text-xs text-slate-400 w-14 text-center font-mono">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(5, z + 0.1))}
            className="px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-ink-800 text-sm"
          >
            +
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-ink-800 text-xs"
          >
            重置
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedBox && (
            <>
              <div className="text-xs text-slate-400 font-mono">
                x:{Math.round(selectedBox.x)} y:{Math.round(selectedBox.y)} w:{Math.round(selectedBox.width)} h:{Math.round(selectedBox.height)}
              </div>
              <button
                onClick={deleteSelected}
                className="p-2 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                title="删除选中框 (Delete)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <div className="text-xs text-slate-500">
            {boxes.length} 个检测框
            {boxes.filter((b) => b.uncertain).length > 0 && (
              <span className="text-amber-400 ml-2">
                ({boxes.filter((b) => b.uncertain).length} 个待确认)
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative cursor-crosshair"
        style={{
          cursor:
            tool === 'pan' || isPanning ? (isPanning ? 'grabbing' : 'grab') :
            tool === 'create' ? (isCreating ? 'crosshair' : 'crosshair') :
            'default',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="checkerboard rounded-lg p-4 inline-block absolute"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <div className="relative">
            <img
              src={imageSrc}
              alt="sprite"
              className="block max-w-none"
              style={{ imageRendering: 'pixelated', width: imageWidth, height: imageHeight }}
              draggable={false}
            />
            <svg
              className="absolute top-0 left-0 pointer-events-none"
              width={imageWidth}
              height={imageHeight}
            >
              {displayBoxes.map((box) => {
                const color = box.id === 'temp' ? '#f59e0b' : getBoxColor(box, groupColors);
                const isSelected = box.id === selectedBoxId;
                const strokeW = isSelected ? 2 : 1;

                return (
                  <g key={box.id}>
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      fill="none"
                      stroke={color}
                      strokeWidth={strokeW / zoom}
                      strokeDasharray={box.uncertain ? '4,2' : undefined}
                      opacity={isSelected ? 1 : 0.8}
                    />
                    {!isSelected && (
                      <rect
                        x={box.x}
                        y={box.y}
                        width={Math.min(32, box.width)}
                        height={12}
                        fill={color}
                        opacity={0.8}
                      />
                    )}
                    {!isSelected && (
                      <text
                        x={box.x + 3}
                        y={box.y + 9}
                        fill="#000"
                        fontSize={9}
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {Math.round(box.confidence * 100)}%
                      </text>
                    )}
                    {isSelected && (
                      <>
                        {(['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'] as ResizeHandle[]).map((h) => {
                          if (!h) return null;
                          const hs = HANDLE_SIZE / zoom;
                          let hx = box.x;
                          let hy = box.y;
                          if (h.includes('e')) hx = box.x + box.width;
                          else if (h === 'n' || h === 's' || h === 'w' || h === 'e') {
                            if (h === 'w' || h === 'e') hy = box.y + box.height / 2;
                            if (h === 'n' || h === 's') hx = box.x + box.width / 2;
                          }
                          if (h.includes('s')) hy = box.y + box.height;
                          if (h === 'n' || h === 's') hx = box.x + box.width / 2;
                          if (h === 'w' || h === 'e') hy = box.y + box.height / 2;
                          return (
                            <rect
                              key={h}
                              x={hx - hs / 2}
                              y={hy - hs / 2}
                              width={hs}
                              height={hs}
                              fill={color}
                              stroke="#fff"
                              strokeWidth={1 / zoom}
                              style={{ cursor: getCursorForHandle(h), pointerEvents: 'auto' }}
                              className="!pointer-events-auto"
                            />
                          );
                        })}
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {selectedBox && (
        <div className="shrink-0 px-4 py-3 border-t border-ink-700/50 flex items-center gap-3">
          <span className="text-xs text-slate-400 font-semibold">精确调整:</span>
          {([
            { label: 'X', key: 'x' as const },
            { label: 'Y', key: 'y' as const },
            { label: 'W', key: 'width' as const },
            { label: 'H', key: 'height' as const },
          ]).map(({ label, key }) => (
            <div key={key} className="flex items-center gap-1">
              <label className="text-xs text-slate-500 w-4">{label}</label>
              <input
                type="number"
                value={Math.round(selectedBox[key])}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  onChange(
                    boxes.map((b) => {
                      if (b.id !== selectedBoxId) return b;
                      const nb = { ...b, [key]: val };
                      if (key === 'width') nb.width = Math.max(MIN_BOX_SIZE, val);
                      if (key === 'height') nb.height = Math.max(MIN_BOX_SIZE, val);
                      if (key === 'x') nb.x = Math.min(imageWidth - nb.width, val);
                      if (key === 'y') nb.y = Math.min(imageHeight - nb.height, val);
                      return nb;
                    })
                  );
                }}
                className="w-16 h-7 bg-ink-800 border border-ink-600 rounded px-2 text-xs text-slate-200 text-center focus:outline-none focus:border-neon-cyan/60 font-mono"
              />
            </div>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <label className="text-xs text-slate-500">置信度</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selectedBox.confidence}
              onChange={(e) => {
                const c = parseFloat(e.target.value);
                onChange(
                  boxes.map((b) =>
                    b.id === selectedBoxId ? { ...b, confidence: c, uncertain: c < 0.4 } : b
                  )
                );
              }}
              className="w-24"
            />
            <span className="text-xs text-slate-400 font-mono w-8">
              {Math.round(selectedBox.confidence * 100)}%
            </span>
          </div>
          <label className="flex items-center gap-1.5 ml-2">
            <input
              type="checkbox"
              checked={!!selectedBox.uncertain}
              onChange={(e) => {
                onChange(
                  boxes.map((b) =>
                    b.id === selectedBoxId ? { ...b, uncertain: e.target.checked } : b
                  )
                );
              }}
              className="rounded bg-ink-800 border-ink-600"
            />
            <span className="text-xs text-amber-400">标记待确认</span>
          </label>
        </div>
      )}
    </div>
  );
}

function getCursorForHandle(h: ResizeHandle): string {
  switch (h) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    default:
      return 'default';
  }
}
