import { vi } from 'vitest';
import 'fake-indexeddb/auto';

globalThis.structuredClone = (value: unknown) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

vi.stubGlobal(
  'Image',
  class StubImage {
    private _src = '';
    private _listeners: Record<string, Function[]> = {};
    public onload: ((e: Event) => void) | null = null;
    width = 2048;
    height = 2048;
    naturalWidth = 2048;
    naturalHeight = 2048;
    get src() { return this._src; }
    set src(value: string) {
      this._src = value;
      if (value.startsWith('data:')) {
        queueMicrotask(() => {
          const ev = new Event('load');
          this.onload?.(ev);
          (this._listeners.load || []).forEach((fn) => fn(ev));
        });
      }
    }
    addEventListener(type: string, fn: Function) {
      (this._listeners[type] ||= []).push(fn);
    }
    removeEventListener(type: string, fn: Function) {
      this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
    }
    dispatchEvent() { return true; }
  } as any
);

interface MockCanvasCtx {
  fillStyle: string;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
}

function makeMockContext(): MockCanvasCtx {
  return {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
  };
}

const mockContexts = new WeakMap<any, MockCanvasCtx>();

const OriginalCanvas = (globalThis as any).HTMLCanvasElement;

vi.stubGlobal(
  'HTMLCanvasElement',
  class MockCanvas {
    width = 0;
    height = 0;
    getContext() {
      let ctx = mockContexts.get(this);
      if (!ctx) {
        ctx = makeMockContext();
        mockContexts.set(this, ctx);
      }
      return ctx;
    }
    toDataURL() {
      return 'data:image/png;base64,mocked';
    }
  } as any
);

if (typeof document !== 'undefined' && OriginalCanvas) {
  const origCreate = document.createElement.bind(document);
  document.createElement = function (tag: string, opts?: any) {
    if (tag.toLowerCase() === 'canvas') {
      return new (globalThis as any).HTMLCanvasElement();
    }
    return origCreate(tag, opts);
  };
}
