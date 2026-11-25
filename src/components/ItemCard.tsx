import { ReactNode } from "react";
import { BaseEntity, EntityType } from "../types";
import { ItemTimestamp } from "./ItemTimestamp";

export function ItemCard({ type, entity, className, accessibleLabel, actions, children }: {
  type: EntityType;
  entity: BaseEntity;
  className: string;
  accessibleLabel?: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  const note = type === "note";
  return (
    <article
      id={`item-${type}-${entity.id}`}
      className={`card item-card ${note ? "note-card" : "entity-card"} ${className}`}
      aria-label={accessibleLabel}
    >
      <div className={`item-card-main ${note ? "note-main" : "entity-main"}`}>{children}</div>
      <div className="item-card-side">
        <div className={`item-card-actions ${note ? "note-side" : "entity-side"}`}>{actions}</div>
        <ItemTimestamp entity={entity} />
      </div>
    </article>
  );
}
