import { ArrowRight, LogOut, User } from 'lucide-react';

type Image = {
  height: number;
  url: string;
  width: number;
};

type Profile = {
  display_name: string;
  external_urls?: { spotify: string };
  images?: Image[];
};

type AccountHeaderProps = {
  sourceProfile: Profile | null;
  targetProfile: Profile | null;
  onChangeAccounts: () => void;
};

export default function AccountHeader({ sourceProfile, targetProfile, onChangeAccounts }: AccountHeaderProps) {
  return (
    <div className="flex items-center justify-between bg-slate-800 p-4 rounded-lg border border-slate-700">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          {sourceProfile?.external_urls ? (
            <a href={sourceProfile.external_urls.spotify} target="_blank" rel="noopener noreferrer">
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                {sourceProfile.images && sourceProfile.images.length > 0 ? (
                  <img src={sourceProfile.images[0].url} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
            </a>
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider">From</div>
            <div className="font-medium text-slate-200">{sourceProfile?.display_name}</div>
          </div>
        </div>
        <ArrowRight className="text-slate-500" />
        <div className="flex items-center gap-3">
          {targetProfile?.external_urls ? (
            <a href={targetProfile.external_urls.spotify} target="_blank" rel="noopener noreferrer">
              <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
                {targetProfile.images && targetProfile.images.length > 0 ? (
                  <img src={targetProfile.images[0].url} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
            </a>
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider">To</div>
            <div className="font-medium text-slate-200">{targetProfile?.display_name}</div>
          </div>
        </div>
      </div>
      <button
        onClick={onChangeAccounts}
        className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
      >
        <LogOut className="w-3 h-3" /> Change Accounts
      </button>
    </div>
  );
}
