import { BaseEntity } from "../types";
import { formatDateTime } from "../state/useAppData";

export function ItemTimestamp({ entity }: { entity: BaseEntity }) {
  const updated = entity.createdAt !== entity.updatedAt;
  const at = updated ? entity.updatedAt : entity.createdAt;
  return (
    <div className="meta-row item-timestamp">
      {updated ? "Updated" : "Created"} <time dateTime={at}>{formatDateTime(at)}</time>
    </div>
  );
}
