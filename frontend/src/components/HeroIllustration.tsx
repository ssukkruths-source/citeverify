import React from 'react';
import { BookOpen, Check, FileSearch, Laptop, Link2, Search, ShieldCheck } from 'lucide-react';

export const HeroIllustration: React.FC = () => (
  <div className="cv-hero-art relative mx-auto w-full max-w-[650px]" aria-label="Illustration of a researcher tracing a claim to a source">
    <div className="cv-art-orbit absolute inset-[7%_4%_5%] rounded-[48%] bg-[#EAF1FC]" />
    <div className="cv-art-orbit cv-art-orbit--warm absolute inset-[21%_0_1%_20%] rounded-[45%] bg-[#FFF3D8]" />
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 680 510" fill="none" aria-hidden="true">
      <path d="M165 215 C218 133 299 168 331 227 S413 334 497 247" stroke="#8EADD8" strokeWidth="2" strokeDasharray="6 8" />
      <path d="M176 359 C260 396 321 354 348 297" stroke="#A5CBB5" strokeWidth="2" strokeDasharray="5 8" />
      <circle cx="169" cy="216" r="6" fill="#3268BB" /><circle cx="497" cy="247" r="6" fill="#63A982" /><circle cx="176" cy="359" r="6" fill="#C87672" />
      <path d="M94 117 C128 94 161 91 188 106" stroke="#C8D7EA" strokeWidth="1.5" />
      <path d="M489 389 C528 402 554 388 571 365" stroke="#D9C9A6" strokeWidth="1.5" />
    </svg>

    <div className="cv-art-paper absolute left-[8%] top-[17%] w-[44%] rotate-[-7deg] rounded-[20px] border border-[#E8E7E1] bg-white p-5 shadow-[0_22px_55px_rgba(20,35,63,.11)] sm:p-6">
      <div className="mb-4 flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EAF1FC] text-[#3268BB]"><BookOpen className="h-4 w-4" /></span><span className="rounded-full bg-[#F4F5F2] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-[#687387]">Research paper</span></div>
      <div className="space-y-2.5"><div className="h-2 w-[86%] rounded-full bg-[#14233F]"/><div className="h-2 w-[68%] rounded-full bg-[#C7D5E8]"/><div className="mt-4 space-y-2"><div className="h-1.5 w-full rounded-full bg-[#E8E7E1]"/><div className="h-1.5 w-[91%] rounded-full bg-[#E8E7E1]"/><div className="h-1.5 w-[78%] rounded-full bg-[#E8E7E1]"/><div className="h-1.5 w-[88%] rounded-full bg-[#E8E7E1]"/></div></div>
      <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#FAF9F5] p-2.5"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DFF3E8] text-[#3D8760]"><Link2 className="h-3 w-3" /></span><div className="h-1.5 w-[65%] rounded-full bg-[#C7D5E8]"/></div>
    </div>

    <div className="cv-art-person absolute left-[34%] top-[43%] h-[39%] w-[29%]">
      <div className="absolute left-[36%] top-0 h-[27%] w-[30%] rounded-[48%] bg-[#D89B77]" />
      <div className="absolute left-[28%] top-[4%] h-[15%] w-[43%] rounded-t-full bg-[#263754]" />
      <div className="absolute left-[18%] top-[25%] h-[51%] w-[61%] rounded-t-[36px] bg-[#3268BB]" />
      <div className="absolute left-[1%] top-[35%] h-[16%] w-[44%] rotate-[-25deg] rounded-full bg-[#D89B77]" />
      <div className="absolute right-[-4%] top-[38%] h-[14%] w-[54%] rotate-[25deg] rounded-full bg-[#D89B77]" />
      <div className="absolute bottom-0 left-[23%] h-[28%] w-[23%] rounded-b-xl bg-[#263754]" />
      <div className="absolute bottom-0 right-[23%] h-[28%] w-[23%] rounded-b-xl bg-[#263754]" />
    </div>

    <div className="cv-art-laptop absolute bottom-[10%] left-[30%] w-[43%] rotate-[-2deg]">
      <div className="rounded-t-[14px] border-[5px] border-[#263754] bg-white p-2.5 shadow-lg sm:p-3.5">
        <div className="mb-3 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#D8847E]"/><span className="h-1.5 w-1.5 rounded-full bg-[#F2C66D]"/><span className="h-1.5 w-1.5 rounded-full bg-[#63A982]"/><span className="ml-2 h-1.5 w-[42%] rounded-full bg-[#E8E7E1]"/></div>
        <div className="flex gap-2"><div className="w-[56%] rounded-lg bg-[#FAF9F5] p-2"><div className="mb-2 h-1.5 w-[80%] rounded-full bg-[#3268BB]"/><div className="space-y-1.5"><div className="h-1 w-full rounded bg-[#D7DEE8]"/><div className="h-1 w-[84%] rounded bg-[#D7DEE8]"/><div className="h-1 w-[70%] rounded bg-[#D7DEE8]"/></div></div><div className="flex flex-1 flex-col justify-center gap-2"><span className="flex items-center gap-1.5 rounded-full bg-[#DFF3E8] px-2 py-1 text-[8px] font-bold text-[#397552]"><Check className="h-2.5 w-2.5"/> Source located</span><span className="flex items-center gap-1.5 rounded-full bg-[#EAF1FC] px-2 py-1 text-[8px] font-bold text-[#3268BB]"><FileSearch className="h-2.5 w-2.5"/> Evidence checked</span></div></div>
      </div>
      <div className="mx-[-5%] h-2.5 rounded-b-full bg-[#AEB9C8] shadow-md"/>
    </div>

    <div className="cv-art-magnifier absolute right-[8%] top-[27%] flex h-[92px] w-[92px] items-center justify-center rounded-full border-[9px] border-white bg-[#EAF1FC]/90 shadow-[0_10px_30px_rgba(20,35,63,.15)] sm:h-[112px] sm:w-[112px]">
      <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-white text-[#3268BB] sm:h-[76px] sm:w-[76px]"><Search className="h-8 w-8" strokeWidth={1.7}/></div><span className="absolute -bottom-5 -right-5 h-12 w-3 rotate-[-42deg] rounded-full bg-[#3268BB] shadow-md"/>
    </div>

    <div className="absolute right-[3%] top-[10%] flex items-center gap-2 rounded-full border border-[#E8E7E1] bg-white px-3 py-2 shadow-[0_10px_25px_rgba(20,35,63,.08)]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DFF3E8] text-[#397552]"><ShieldCheck className="h-3.5 w-3.5"/></span><span className="text-[10px] font-bold tracking-wide text-[#14233F]">SOURCE VERIFIED</span></div>
    <div className="absolute bottom-[6%] right-[3%] hidden items-center gap-2 rounded-2xl border border-[#E8E7E1] bg-white p-3 shadow-[0_10px_25px_rgba(20,35,63,.08)] sm:flex"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF3D8] text-[#A47A2C]"><Laptop className="h-4 w-4"/></span><span className="text-[10px] font-bold text-[#14233F]">Evidence, in context</span></div>
  </div>
);
