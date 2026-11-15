import React from "react";

export interface Choice {
  value: string;
  title: string;
  detail: string;
  /** Short status at the end of the row, such as "Key saved". */
  state?: string;
}

interface ChoiceListProps {
  legend: string;
  name: string;
  choices: Choice[];
  value: string | undefined;
  onChange: (value: string) => void;
}

/** One choice out of a few, as plain rows. Arrow keys move between rows because these are real radios. */
export const ChoiceList: React.FC<ChoiceListProps> = ({ legend, name, choices, value, onChange }) => (
  <fieldset>
    <legend className="sr-only">{legend}</legend>
    <div className="divide-y divide-g-line rounded-md border border-g-line">
      {choices.map((choice) => {
        const checked = choice.value === value;
        return (
          <label
            key={choice.value}
            className={
              "flex cursor-pointer items-baseline gap-3 px-3 py-2.5 first:rounded-t-md last:rounded-b-md " +
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-g-accent " +
              (checked ? "bg-g-raised" : "hover:bg-g-hover active:bg-g-base")
            }
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={checked}
              onChange={() => {
                if (!checked) onChange(choice.value);
              }}
            />
            <span
              aria-hidden="true"
              className={
                "relative top-0.5 h-3.5 w-3.5 shrink-0 rounded-full border " +
                (checked ? "border-g-accent bg-g-accent shadow-[inset_0_0_0_3px_#17191C]" : "border-g-lineStrong")
              }
            />
            <span className="min-w-0 flex-1">
              <span className="text-sm font-medium text-g-text">{choice.title}</span>
              <span className="sr-only">. </span>
              <span className="ml-2 text-[13px] text-g-muted">{choice.detail}</span>
            </span>
            {choice.state && <span className="shrink-0 text-xs text-g-muted">{choice.state}</span>}
          </label>
        );
      })}
    </div>
  </fieldset>
);
