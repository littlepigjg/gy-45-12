import { create } from 'zustand';
import type { IconMeta, IconItem, Project, SpriteConfig } from '../types';
import { generateId, iconItemToMeta } from '../utils';
import {
  saveIconDataUrl,
  getIconDataUrl,
  deleteIconBlob,
  deleteIconBulk,
} from '../utils/db';

const STORAGE_KEY = 'css-sprite-tool-data';

type ToastFn = (msg: string) => void;
interface ToastHandlers {
  showSuccess: ToastFn;
  showError: ToastFn;
  showWarning: ToastFn;
  showInfo: ToastFn;
}

let toastHandlers: ToastHandlers = {
  showSuccess: () => {},
  showError: (m) => console.error(m),
  showWarning: (m) => console.warn(m),
  showInfo: (m) => console.info(m),
};

export function setStoreToastHandlers(handlers: ToastHandlers) {
  toastHandlers = handlers;
}

interface PersistedData {
  projects: Project[];
  icons: IconMeta[];
}

interface AppState {
  projects: Project[];
  icons: IconMeta[];
  activeProjectId: string | null;
  generatorIcons: IconItem[];
  spriteConfig: SpriteConfig;

  setToastHandlers: (handlers: ToastHandlers) => void;

  addIcons: (icons: IconItem[]) => Promise<void>;
  removeIcon: (id: string) => Promise<void>;
  clearGeneratorIcons: () => void;
  setGeneratorIcons: (icons: IconItem[]) => void;
  updateSpriteConfig: (config: Partial<SpriteConfig>) => void;

  createProject: (name: string, description?: string) => Project;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => void;
  setActiveProject: (id: string | null) => void;
  addIconsToProject: (projectId: string, iconIds: string[]) => void;
  removeIconFromProject: (projectId: string, iconId: string) => void;

  getIconsInProject: (projectId: string) => Promise<{
    items: IconItem[];
    total: number;
    loaded: number;
    failed: number;
  }>;
  getIconItem: (meta: IconMeta) => Promise<IconItem | null>;
}

function loadFromStorage(): PersistedData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        projects: parsed.projects || [],
        icons: parsed.icons || [],
      };
    }
  } catch (e) {
    toastHandlers.showError('读取本地数据失败');
  }
  return { projects: [], icons: [] };
}

function saveToStorage(projects: Project[], icons: IconMeta[]): boolean {
  try {
    const payload = JSON.stringify({ projects, icons });
    localStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch (e) {
    toastHandlers.showError('本地存储失败，浏览器存储空间可能已满');
    return false;
  }
}

const initialData = loadFromStorage();

export const useAppStore = create<AppState>((set, get) => ({
  projects: initialData.projects,
  icons: initialData.icons,
  activeProjectId: initialData.projects[0]?.id || null,
  generatorIcons: [],
  spriteConfig: {
    columns: 5,
    spacing: 4,
    bgColor: 'transparent',
    classPrefix: 'sprite',
    retina: false,
  },

  setToastHandlers: (handlers) => {
    setStoreToastHandlers(handlers);
  },

  addIcons: async (items) => {
    if (items.length === 0) return;
    const metas: IconMeta[] = items.map(iconItemToMeta);

    try {
      for (const item of items) {
        await saveIconDataUrl(item.id, item.dataUrl);
      }
    } catch (e) {
      toastHandlers.showError('保存图片到本地数据库失败');
      throw e;
    }

    set((state) => {
      const newIcons = [...state.icons, ...metas];
      saveToStorage(state.projects, newIcons);
      return { icons: newIcons };
    });
    toastHandlers.showSuccess(`已保存 ${items.length} 个图标`);
  },

  removeIcon: async (id) => {
    try {
      await deleteIconBlob(id);
    } catch (e) {
      toastHandlers.showError('删除图片数据失败');
    }

    set((state) => {
      const newIcons = state.icons.filter((i) => i.id !== id);
      const newProjects = state.projects.map((p) => ({
        ...p,
        iconIds: p.iconIds.filter((iid) => iid !== id),
      }));
      saveToStorage(newProjects, newIcons);
      return { icons: newIcons, projects: newProjects };
    });
  },

  clearGeneratorIcons: () => set({ generatorIcons: [] }),

  setGeneratorIcons: (icons) => set({ generatorIcons: icons }),

  updateSpriteConfig: (config) =>
    set((state) => ({
      spriteConfig: { ...state.spriteConfig, ...config },
    })),

  createProject: (name, description = '') => {
    const project: Project = {
      id: generateId(),
      name,
      description,
      iconIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => {
      const newProjects = [...state.projects, project];
      saveToStorage(newProjects, state.icons);
      return { projects: newProjects, activeProjectId: project.id };
    });
    toastHandlers.showSuccess(`项目 "${name}" 已创建`);
    return project;
  },

  deleteProject: async (id) => {
    const state = get();
    const project = state.projects.find((p) => p.id === id);
    const projectIconIds = new Set(project?.iconIds || []);
    const newProjects = state.projects.filter((p) => p.id !== id);
    const remainingProjectIconIds = new Set(
      newProjects.flatMap((p) => p.iconIds)
    );
    const orphanedIds = [...projectIconIds].filter(
      (iid) => !remainingProjectIconIds.has(iid)
    );

    if (orphanedIds.length > 0) {
      try {
        await deleteIconBulk(orphanedIds);
      } catch (e) {
        toastHandlers.showError('清理图片数据失败');
      }
    }

    set((s) => {
      const newIcons = s.icons.filter((i) => !orphanedIds.includes(i.id));
      saveToStorage(newProjects, newIcons);
      return {
        projects: newProjects,
        icons: newIcons,
        activeProjectId:
          s.activeProjectId === id ? newProjects[0]?.id || null : s.activeProjectId,
      };
    });
    toastHandlers.showInfo('项目已删除');
  },

  renameProject: (id, name) => {
    set((state) => {
      const newProjects = state.projects.map((p) =>
        p.id === id ? { ...p, name, updatedAt: Date.now() } : p
      );
      saveToStorage(newProjects, state.icons);
      return { projects: newProjects };
    });
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  addIconsToProject: (projectId, iconIds) => {
    set((state) => {
      const newProjects = state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              iconIds: [...new Set([...p.iconIds, ...iconIds])],
              updatedAt: Date.now(),
            }
          : p
      );
      saveToStorage(newProjects, state.icons);
      return { projects: newProjects };
    });
  },

  removeIconFromProject: (projectId, iconId) => {
    set((state) => {
      const newProjects = state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              iconIds: p.iconIds.filter((id) => id !== iconId),
              updatedAt: Date.now(),
            }
          : p
      );
      saveToStorage(newProjects, state.icons);
      return { projects: newProjects };
    });
  },

  getIconItem: async (meta) => {
    try {
      const dataUrl = await getIconDataUrl(meta.id);
      if (!dataUrl) {
        toastHandlers.showWarning(`图标 "${meta.name}" 数据缺失`);
        return null;
      }
      return { ...meta, dataUrl };
    } catch (e) {
      toastHandlers.showError(`加载图标 "${meta.name}" 失败`);
      return null;
    }
  },

  getIconsInProject: async (projectId) => {
    const state = get();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return { items: [], total: 0, loaded: 0, failed: 0 };
    const metaMap = new Map(state.icons.map((i) => [i.id, i]));
    const metas = project.iconIds
      .map((id) => metaMap.get(id))
      .filter((m): m is IconMeta => !!m);

    const items: IconItem[] = [];
    let failed = 0;
    for (const meta of metas) {
      const item = await get().getIconItem(meta);
      if (item) items.push(item);
      else failed++;
    }
    if (failed > 0) {
      toastHandlers.showWarning(`成功加载 ${items.length} 个图标，${failed} 个加载失败`);
    }
    return { items, total: metas.length, loaded: items.length, failed };
  },
}));

export { generateId };
