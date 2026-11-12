import { FilterKey, StatusFilter } from "../state/useAppData";
import { filterLabel, filterOptions } from "../state/lifecycle";

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
        View: {filterLabel(filterKey, current)}
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
              {filterLabel(filterKey, option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
