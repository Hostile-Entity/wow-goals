import { BaseEntity } from "../types";

const cardDate = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function ItemTimestamp({ entity }: { entity: BaseEntity }) {
  const updated = entity.createdAt !== entity.updatedAt;
  const at = updated ? entity.updatedAt : entity.createdAt;
  const date = new Date(at);
  const label = Number.isFinite(date.getTime()) ? cardDate.format(date) : at;
  return (
    <div className="meta-row item-timestamp">
      {updated ? "Updated" : "Created"} <time dateTime={at}>{label}</time>
    </div>
  );
}
