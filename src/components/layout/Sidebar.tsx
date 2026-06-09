import { NavLink } from 'react-router-dom';
import { Grid3X3, Scissors, FolderKanban, Sparkles } from 'lucide-react';

const navItems = [
  { to: '/generator', label: '精灵图生成', icon: Grid3X3 },
  { to: '/splitter', label: '精灵图拆分', icon: Scissors },
  { to: '/library', label: '图标库管理', icon: FolderKanban },
];

export default function Sidebar() {
  return (
    <aside className="w-64 shrink-0 h-full bg-ink-900/80 backdrop-blur-xl border-r border-ink-700/50 flex flex-col">
      <div className="p-5 border-b border-ink-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-neon-cyan to-neon-amber flex items-center justify-center shadow-glow-cyan">
            <Sparkles className="w-5 h-5 text-ink-950" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">SpriteLab</h1>
            <p className="text-xs text-slate-500">CSS Sprite Toolkit</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 shadow-glow-cyan'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-ink-700/50">
        <div className="text-xs text-slate-500 leading-relaxed">
          本地存储 · 数据安全
          <br />
          所有图标保存在您的浏览器中
        </div>
      </div>
    </aside>
  );
}
