import { FilterKey, StatusFilter } from "../state/useAppData";
import { filterOptions } from "../state/lifecycle";

function optionLabel(value: StatusFilter): string {
  return value === "actionable" ? "open items" : value;
}

interface FilterControlProps {
  filterKey: FilterKey;
  current: StatusFilter;
  isOpen: boolean;
  onToggle(): void;
  onSelect(value: StatusFilter): void;
}

export function FilterControl({
  filterKey,
  current,
  isOpen,
  onToggle,
  onSelect,
}: FilterControlProps) {
  return (
    <div className="filter-wrap">
      <button
        className="filter-btn"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`filters-${filterKey}`}
      >
        Filter: {optionLabel(current)}
      </button>
      {isOpen && (
        <div className="filter-menu" id={`filters-${filterKey}`}>
          {filterOptions(filterKey).map((option) => (
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
