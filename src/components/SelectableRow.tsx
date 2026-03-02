import { type ReactNode } from 'react';
import { CheckCircle } from 'lucide-react';

type SelectableRowProps = {
  selected: boolean;
  onClick: () => void;
  thumbnail: ReactNode;
  children: ReactNode;
};

export default function SelectableRow({ selected, onClick, thumbnail, children }: SelectableRowProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 flex items-center gap-4 cursor-pointer border-b border-slate-800 transition-colors hover:bg-slate-800/50 ${selected ? 'bg-slate-800' : ''}`}
    >
      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selected ? 'bg-green-500 border-green-500' : 'border-slate-600'}`}>
        {selected && <CheckCircle className="w-3.5 h-3.5 text-black" />}
      </div>

      {thumbnail}

      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
