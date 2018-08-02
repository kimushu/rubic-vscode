/**
 * Stores data for passed via handlebars
 */
interface CatalogRenderDescriptor {
    /** Uri of extension root for local resources */
    baseUri: string;

    /** Name of workspace folder */
    folderName: string;

    /** Disable "official" badge */
    unofficial?: boolean;

    /** Localized texts */
    localized: {
        official: string;
        preview: string;
        obsolete: string;
        website: string;
        loading: string;
        changed: string;
        notSelected: string;
        noItem: string;
    };

    /** Panels */
    panels: CatalogPanelRenderDescriptor[];
}

interface CatalogPanelRenderDescriptor {
    /** ID of panel */
    panelId: string;

    /** Localized title */
    localizedTitle: string;

    /** Are icons used */
    withIcons?: boolean;

    /** Are html pages used */
    withPages?: boolean;
}

/**
 * Stores data passed via message passing
 */
interface CatalogItemDescriptor {
    /** ID of item */
    itemId: string;

    /** Localized title (1st line) */
    localizedTitle: string;
    
    /** Icon URL (relative path from extension folder) */
    icon?: string;

    /** Show "Official" badge */
    official?: boolean;

    /** Show "Preview" badge */
    preview?: boolean;

    /** Show "Obsolete" badge */
    obsolete?: boolean;

    /** Localized description (2nd line) */
    localizedDescription?: string;

    /** Localized details (3rd line) */
    localizedDetails?: string;

    /** Topics badge */
    topics?: CatalogTopicDescriptor[];

    /** Menu items */
    menus?: CatalogMenuDescriptor[];
}

interface CatalogTopicDescriptor {
    /** Localized title */
    localizedTitle: string;

    /** Color name */
    color: string;

    /** Tooltip text */
    localizedTooltip?: string;
}

interface CatalogMenuDescriptor {
    /** Localized title */
    localizedTitle: string;

    /** Link address */
    url: string;

    /** Command name */
    command: string;
}

interface CatalogTemplatePage {
    /** Localized title */
    title: string;
    /** Is active */
    active?: boolean;
    /** Content */
    content: string;
}
