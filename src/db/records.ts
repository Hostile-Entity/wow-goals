import type { AppStateData } from "../types";
import type { dataStores } from "./schema";

export type DataStore = (typeof dataStores)[number];
export type StoreMap = {
  [K in DataStore]: AppStateData[K][number];
} & {
  settings: AppStateData["settings"];
  meta: { id: string; data?: unknown; at?: string };
};
export type StoreName = keyof StoreMap;

type StorePut = { [S in StoreName]: { store: S; row: StoreMap[S] } }[StoreName];
export type PutChange<K extends StoreName = StoreName> = StorePut & { store: K };
export type Change<K extends StoreName = StoreName> =
  (StorePut | { store: StoreName; deleteId: string }) & { store: K };
export type Records<K extends StoreName = StoreName> = {
  [S in K]: StoreMap[S][];
};

type IndexNames = { completions: "by-date"; reviews: "by-week" };
export type StoreRead<K extends StoreName = StoreName> =
  | K
  | { store: K; key: IDBValidKey; index?: never }
  | { [S in K & keyof IndexNames]: { store: S; index: IndexNames[S]; key: string } }[K & keyof IndexNames];

export type Mutation<R extends StoreName, W extends StoreName, A extends StoreName> = {
  read?: readonly StoreRead<R>[];
  write: readonly W[];
  afterRead?: {
    stores: readonly A[];
    select(records: Records<NoInfer<R>>): readonly StoreRead<NoInfer<A>>[];
  };
};
