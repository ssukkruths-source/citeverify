import React, { useEffect, useState } from 'react';
import { 
  Settings, 
  Lock, 
  Database, 
  Cpu, 
  Save, 
  CheckCircle2, 
  ShieldCheck, 
  Globe, 
  Info,
  Server,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { PlatformSettings } from '../types';
import { fetchSettings, runCleanup, updateSettings } from '../api/client';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<PlatformSettings>({
    strict_verification: 'false',
    openalex_enabled: 'true',
    crossref_enabled: 'true',
    semantic_scholar_enabled: 'true',
    ai_model: 'CiteVerify Evidence-Reasoning v2.4 (Biomed/STEM)',
    auto_download_report: 'false',
    privacy_mode: 'true',
    data_retention_days: '30',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((data) => setSettings(data))
      .catch((err) => console.error(err));
  }, []);

  const handleToggle = (key: keyof PlatformSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: prev[key] === 'true' ? 'false' : 'true',
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    setCleanupMessage(null);
    try {
      const result = await runCleanup();
      setCleanupMessage(
        result.count === 0
          ? `No audits are older than the ${result.retention_days}-day retention window.`
          : `Removed ${result.count} expired audit(s) older than ${result.retention_days} days.`,
      );
    } catch (e: any) {
      setCleanupMessage(e.message || 'Cleanup could not be completed.');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="p-6 sm:p-10 max-w-4xl mx-auto space-y-8 font-sans">
      {/* Header */}
      <div className="pb-4 border-b border-[#E8E7E1]">
        <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
          Workspace Configuration
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight mt-1">
          Settings & Scientific Privacy
        </h1>
        <p className="text-sm text-[#687387] mt-1">
          Configure academic API connections, data retention policies, and NLI verification parameters.
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Academic Scholarly APIs */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E8E7E1] shadow-subtle space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-[#E8E7E1]">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#14233F]">
                Scholarly Metadata Integrations
              </h3>
              <p className="text-xs text-[#687387]">
                Select authoritative academic indices queried for publication authenticity.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {/* OpenAlex */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1]">
              <div>
                <h4 className="text-xs font-bold text-[#14233F]">
                  OpenAlex API Indexing
                </h4>
                <p className="text-[11px] text-[#687387]">
                  Open global catalog of 250M+ scholarly works, abstracts, and open-access links.
                </p>
              </div>
              <button
                onClick={() => handleToggle('openalex_enabled')}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  settings.openalex_enabled === 'true' ? 'bg-[#63A982]' : 'bg-stone-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                    settings.openalex_enabled === 'true' ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Crossref */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1]">
              <div>
                <h4 className="text-xs font-bold text-[#14233F]">
                  Crossref REST API (DOI Authority)
                </h4>
                <p className="text-[11px] text-[#687387]">
                  Official DOI registration agency for scientific journals and conference proceedings.
                </p>
              </div>
              <button
                onClick={() => handleToggle('crossref_enabled')}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  settings.crossref_enabled === 'true' ? 'bg-[#63A982]' : 'bg-stone-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                    settings.crossref_enabled === 'true' ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Semantic Scholar */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1]">
              <div>
                <h4 className="text-xs font-bold text-[#14233F]">
                  Semantic Scholar Academic Graph
                </h4>
                <p className="text-[11px] text-[#687387]">
                  Fallback verification for AI/CS papers and citation context graphs.
                </p>
              </div>
              <button
                onClick={() => handleToggle('semantic_scholar_enabled')}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  settings.semantic_scholar_enabled === 'true' ? 'bg-[#63A982]' : 'bg-stone-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                    settings.semantic_scholar_enabled === 'true' ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Privacy & Data Retention */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E8E7E1] shadow-subtle space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-[#E8E7E1]">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-[#3268BB] flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#14233F]">
                Privacy & Data Retention
              </h3>
              <p className="text-xs text-[#687387]">
                Control manuscript storage and session persistence.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1]">
              <div>
                <h4 className="text-xs font-bold text-[#14233F]">
                  Strict Privacy Mode (Zero Public Model Training)
                </h4>
                <p className="text-[11px] text-[#687387]">
                  Enforces local session execution and forbids permanent cloud ingestion.
                </p>
              </div>
              <button
                onClick={() => handleToggle('privacy_mode')}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  settings.privacy_mode === 'true' ? 'bg-[#63A982]' : 'bg-stone-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                    settings.privacy_mode === 'true' ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1]">
              <div>
                <h4 className="text-xs font-bold text-[#14233F]">
                  Local Database Retention Period
                </h4>
                <p className="text-[11px] text-[#687387]">
                  Automatically purge audit records and uploaded PDFs after a period.
                </p>
              </div>
              <select
                value={settings.data_retention_days}
                onChange={(e) => setSettings({ ...settings, data_retention_days: e.target.value })}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#E8E7E1] bg-white outline-none font-mono"
              >
                <option value="7">7 Days</option>
                <option value="30">30 Days (Default)</option>
                <option value="90">90 Days</option>
                <option value="0">Ephemeral (Clear on Exit)</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-white border border-dashed border-[#E8E7E1] gap-3">
              <div>
                <h4 className="text-xs font-bold text-[#14233F]">
                  Purge expired audits now
                </h4>
                <p className="text-[11px] text-[#687387]">
                  Removes expired audits, their claims, findings and uploaded PDFs. Saved
                  discovery publications and collections are kept.
                </p>
                {cleanupMessage && (
                  <p className="text-[10.5px] text-[#3268BB] font-semibold mt-1">{cleanupMessage}</p>
                )}
              </div>
              <button
                onClick={handleCleanup}
                disabled={isCleaning}
                className="shrink-0 px-3.5 py-2 rounded-lg border border-[#E8E7E1] bg-[#FAF9F5] hover:bg-stone-100 text-[11px] font-bold text-[#14233F] flex items-center gap-1.5 disabled:opacity-50"
              >
                {isCleaning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Run cleanup
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: NLP & Verification Engine Parameters */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E8E7E1] shadow-subtle space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-[#E8E7E1]">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#14233F]">
                Verification Model & Thresholds
              </h3>
              <p className="text-xs text-[#687387]">
                Adjust NLI sensitivity and claim extraction strictness.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#14233F]">
                Selected Reasoning Pipeline:
              </label>
              <select
                value={settings.ai_model}
                onChange={(e) => setSettings({ ...settings, ai_model: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-[#E8E7E1] bg-[#FAF9F5] outline-none font-mono"
              >
                <option value="CiteVerify Evidence-Reasoning v2.4 (Biomed/STEM)">
                  CiteVerify Evidence-Reasoning v2.4 (Biomed/STEM Benchmark)
                </option>
                <option value="CiteVerify Broad-Domain Meta v2.2">
                  CiteVerify Broad-Domain Meta v2.2 (Social Sciences & Humanities)
                </option>
              </select>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E8E7E1]">
              <div>
                <h4 className="text-xs font-bold text-[#14233F]">
                  Strict Verification Thresholds
                </h4>
                <p className="text-[11px] text-[#687387]">
                  Require exact publication title and author surname match before marking VERIFIED.
                </p>
              </div>
              <button
                onClick={() => handleToggle('strict_verification')}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  settings.strict_verification === 'true' ? 'bg-[#63A982]' : 'bg-stone-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                    settings.strict_verification === 'true' ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-2">
          {saveSuccess && (
            <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Settings successfully saved!</span>
            </div>
          )}
          {!saveSuccess && <div />}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold transition-all shadow-editorial flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
