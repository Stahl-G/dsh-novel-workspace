import type { NovelData } from "@kaitu/core";
export declare function Interview({ data, busy, onEdit, }: {
    data: NovelData;
    busy: boolean;
    onEdit(command: object): Promise<unknown>;
}): import("react").JSX.Element;
