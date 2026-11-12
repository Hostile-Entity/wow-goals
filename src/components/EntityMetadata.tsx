import { BaseEntity } from "../types";
import { formatDateTime } from "../state/useAppData";

export function EntityMetadata({ entity }: { entity: BaseEntity }) {
  return <details className="entity-metadata">
    <summary>Item information</summary>
    <p className="meta">Created {formatDateTime(entity.createdAt)}<br />Updated {formatDateTime(entity.updatedAt)}</p>
    {"postponedCount" in entity && <p className="meta">Postponed {String(entity.postponedCount)} times</p>}
  </details>;
}
