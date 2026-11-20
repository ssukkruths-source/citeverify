import React, { useEffect, useState } from 'react';
import { ArrowRight, Menu, Moon, ShieldCheck, Sun, X } from 'lucide-react';

interface NavbarProps {
  onNavigate: (view: string) => void;
  activeView: string;
}

const links = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Statement Check', href: '#statement-check' },
  { label: 'Explore', href: '#explore' },
  { label: 'About', href: '#about' },
];

export const Navbar: React.FC<NavbarProps> = ({ onNavigate }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('citeverify-theme') === 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('citeverify-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const go = (view: string) => {
    setMenuOpen(false);
    onNavigate(view);
  };

  return (
    <header className="cv-nav sticky top-0 z-50 border-b border-[#E8E7E1] bg-[#FAF9F5]/95 px-4 sm:px-8 backdrop-blur-xl">
      <div className="mx-auto flex h-[74px] max-w-[1320px] items-center justify-between gap-5">
        <button onClick={() => go('landing')} className="flex shrink-0 items-center gap-2.5 text-left" aria-label="CiteVerify home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3268BB] text-white shadow-sm"><ShieldCheck className="h-[19px] w-[19px]" /></span>
          <span className="text-[19px] font-extrabold tracking-[-0.055em] text-[#14233F]">CiteVerify</span>
        </button>

        <nav className="hidden items-center gap-3 lg:flex xl:gap-5" aria-label="Main navigation">
          {links.map((item) => <a key={item.label} href={item.href} className="cv-nav-link text-[13px] font-semibold text-[#687387] transition-colors hover:text-[#3268BB]">{item.label}</a>)}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex xl:gap-3">
          <button onClick={() => setDark((value) => !value)} className="cv-icon-button" aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} title={`${dark ? 'Light' : 'Dark'} mode`}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => go('upload')} className="inline-flex items-center gap-2 rounded-full bg-[#3268BB] px-5 py-3 text-[13px] font-bold text-white shadow-[0_5px_16px_rgba(50,104,187,.18)] transition hover:-translate-y-0.5 hover:bg-[#28599f]">
            Get Started <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <button onClick={() => setDark((value) => !value)} className="cv-icon-button" aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          <button onClick={() => setMenuOpen((open) => !open)} className="cv-icon-button" aria-label={menuOpen ? 'Close menu' : 'Open menu'}>{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {menuOpen && <div className="cv-mobile-menu border-t border-[#E8E7E1] pb-5 pt-3 md:hidden">
        <nav className="mx-auto grid max-w-[1320px] gap-1 px-1" aria-label="Mobile navigation">
          {links.map((item) => <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold text-[#687387] hover:bg-[#EAF1FC] hover:text-[#3268BB]">{item.label}</a>)}
          <button onClick={() => go('upload')} className="mt-2 flex items-center justify-center gap-2 rounded-full bg-[#3268BB] px-5 py-3 text-sm font-bold text-white">Get Started <ArrowRight className="h-4 w-4" /></button>
        </nav>
      </div>}
    </header>
  );
};
