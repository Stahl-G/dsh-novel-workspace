import { type Workspace } from "@kaitu/core";
export declare function libraryProjects(ws: Workspace): {
    hidden: boolean;
    slug: string;
    title: string;
    linked: boolean;
    pinned: boolean;
    words: number;
    scenes: number;
}[];
export declare function addLibraryProject(ws: Workspace, input: unknown): Promise<{
    project: string;
    sourceRoot: string;
}>;
export declare function setLibraryHidden(ws: Workspace, project: string, hidden: boolean): {
    hidden: boolean;
};
export declare function removeLibraryProject(ws: Workspace, project: string): {
    removed: boolean;
};
export declare function browseLibraryFolders(input: unknown): {
    path: string;
    home: string;
    crumbs: {
        name: string;
        path: string;
    }[];
    entries: {
        name: string;
        path: string;
        hidden: boolean;
    }[];
    truncated: boolean;
};
