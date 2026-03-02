import { CheckCircle } from 'lucide-react';

type Step = {
  num: number;
  label: string;
};

type ProgressStepperProps = {
  steps: Step[];
  currentStep: number;
};

export default function ProgressStepper({ steps, currentStep }: ProgressStepperProps) {
  return (
    <div className="mb-12">
      {/* Top row: circles and lines, vertically aligned */}
      <div className="flex items-center">
        {steps.map((s, index) => {
          const isCompleted = currentStep > s.num;
          const isCurrent = currentStep === s.num;
          return (
            <div key={s.num} className="flex items-center flex-1 last:flex-none">
              <div
                className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                  ${isCompleted ? 'bg-green-500 text-black' : ''}
                  ${isCurrent ? 'bg-mist-200 text-black scale-110 ring-4 ring-white/20' : ''}
                  ${!isCompleted && !isCurrent ? 'bg-slate-800 text-slate-500' : ''}
                `}
              >
                {isCompleted ? <CheckCircle className="w-5 h-5" /> : s.num}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 transition-colors duration-300 ${isCompleted ? 'bg-green-500' : 'bg-slate-800'}`}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Bottom row: labels aligned under each circle */}
      <div className="flex mt-2">
        {steps.map((s) => {
          const isCompleted = currentStep > s.num;
          const isCurrent = currentStep === s.num;
          return (
            <div key={s.num} className="flex-1 last:flex-none last:w-8">
              <span className={`text-xs font-medium ${isCompleted ? 'text-green-400' : ''} ${isCurrent ? 'text-white-400' : ''} ${!isCompleted && !isCurrent ? 'text-slate-600' : ''}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
