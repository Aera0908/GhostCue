import React, { useId } from "react";

interface ControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

interface FieldProps {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  /** Receives the attributes that tie the control to its label, hint and error. */
  children: (props: ControlProps) => React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, hint, error, children }) => {
  const id = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-g-text">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-[13px] leading-5 text-g-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[13px] leading-5 text-g-danger">
          {error}
        </p>
      )}
    </div>
  );
};

const CONTROL =
  "w-full rounded-md border border-g-line bg-g-base px-3 text-sm text-g-text placeholder:text-g-muted/70 " +
  "hover:border-g-lineStrong focus:border-g-accent focus:outline-none focus-visible:outline-none " +
  "aria-[invalid=true]:border-g-danger disabled:cursor-not-allowed disabled:opacity-40";

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${CONTROL} h-9 ${className}`} {...rest} />;
  }
);

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className = "", ...rest }, ref) {
    return <textarea ref={ref} className={`${CONTROL} select-text py-2 leading-6 ${className}`} {...rest} />;
  }
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${CONTROL} h-9 cursor-pointer ${className}`} {...rest}>
        {children}
      </select>
    );
  }
);
