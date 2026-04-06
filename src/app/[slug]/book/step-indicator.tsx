"use client";

const STEPS = [
  { number: 1, label: "Lodge & Dates" },
  { number: 2, label: "Guests" },
  { number: 3, label: "Beds" },
  { number: 4, label: "Review" },
  { number: 5, label: "Confirm" },
];

type Props = {
  currentStep: number;
};

export function StepIndicator({ currentStep }: Props) {
  return (
    <nav aria-label="Booking progress" className="mb-8">
      <ol className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const isActive = step.number === currentStep;
          const isCompleted = step.number < currentStep;
          const isLast = i === STEPS.length - 1;

          return (
            <li key={step.number} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isCompleted
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`hidden text-sm sm:inline ${
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`h-px w-6 sm:w-10 ${
                    isCompleted ? "bg-primary/40" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
