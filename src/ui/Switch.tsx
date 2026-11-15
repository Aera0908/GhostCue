import React, { useId } from "react";

interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ label, description, checked, onChange, disabled = false }) => {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <p id={labelId} className={`text-sm ${disabled ? "text-g-muted" : "text-g-text"}`}>
          {label}
        </p>
        {description && (
          <p id={descriptionId} className="mt-0.5 text-[13px] leading-5 text-g-muted">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border " +
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-g-accent " +
          "disabled:cursor-not-allowed disabled:opacity-40 " +
          (checked
            ? "border-g-accent bg-g-accent hover:bg-g-accentHover active:bg-g-accentPress"
            : "border-g-lineStrong bg-g-base hover:border-g-muted active:bg-g-hover")
        }
      >
        <span
          aria-hidden="true"
          className={
            "absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full transition-transform duration-150 ease-out motion-reduce:transition-none " +
            (checked ? "translate-x-4 bg-g-accentInk" : "translate-x-0 bg-g-muted")
          }
        />
      </button>
    </div>
  );
};
