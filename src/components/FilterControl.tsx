import { FilterKey, StatusFilter } from "../state/useAppData";

const options: StatusFilter[] = ["all", "in_progress", "active", "inactive", "completed", "discarded"];

function optionLabel(value: StatusFilter): string {
  return value.replace("_", " ");
}

interface FilterControlProps {
  filterKey: FilterKey;
  current: StatusFilter;
  isOpen: boolean;
  onToggle(): void;
  onSelect(value: StatusFilter): void;
}

export function FilterControl({ current, isOpen, onToggle, onSelect }: FilterControlProps) {
  return (
    <div className="filter-wrap">
      <button className="filter-btn" onClick={onToggle}>
        Filter: {optionLabel(current)}
      </button>
      {isOpen && (
        <div className="filter-menu">
          {options.map((option) => (
            <button
              key={option}
              className={current === option ? "active" : ""}
              onClick={() => {
                onSelect(option);
              }}
            >
              {optionLabel(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
